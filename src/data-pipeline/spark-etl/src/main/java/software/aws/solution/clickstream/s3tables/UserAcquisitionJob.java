/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

package software.aws.solution.clickstream.s3tables;

import lombok.extern.slf4j.Slf4j;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;

import static org.apache.spark.sql.functions.col;
import static org.apache.spark.sql.functions.concat_ws;
import static org.apache.spark.sql.functions.count;
import static org.apache.spark.sql.functions.countDistinct;
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.lit;
import static org.apache.spark.sql.functions.max;
import static org.apache.spark.sql.functions.sum;
import static org.apache.spark.sql.functions.to_date;
import static org.apache.spark.sql.functions.when;

/**
 * Job for creating user acquisition analysis tables in S3 Tables.
 * Aligned with Redshift clickstream_acquisition_day_user_acquisition.
 */
@Slf4j
public class UserAcquisitionJob {

    public static final String USER_ACQUISITION_TABLE = "user_acquisition";

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    public UserAcquisitionJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        Dataset<Row> userData = readOdsUserData();
        createUserAcquisition(eventData, userData);
    }

    Dataset<Row> readOdsEventData() {
        String odsPath = config.getOdsPath("event_v2");
        log.info("Reading ODS event data from: {}", odsPath);

        java.sql.Timestamp startTs = new java.sql.Timestamp(config.getStartTimestamp());
        java.sql.Timestamp endTs = new java.sql.Timestamp(config.getEndTimestamp());

        return spark.read()
            .parquet(odsPath)
            .filter(col("event_timestamp").geq(startTs))
            .filter(col("event_timestamp").lt(endTs));
    }

    Dataset<Row> readOdsUserData() {
        String odsPath = config.getOdsPath("user_v2");
        log.info("Reading ODS user data from: {}", odsPath);

        try {
            return spark.read().parquet(odsPath);
        } catch (Exception e) {
            log.warn("Could not read user data: {}", e.getMessage());
            return spark.emptyDataFrame();
        }
    }

    void createUserAcquisition(final Dataset<Row> eventData, final Dataset<Row> userData) {
        String tableName = config.getFullTableName(USER_ACQUISITION_TABLE);
        log.info("Creating user acquisition in table: {}", tableName);

        // Session-level metrics
        Dataset<Row> sessionMetrics = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .withColumn("is_view_event",
                when(col("event_name").isin("_page_view", "_screen_view"), 1).otherwise(0))
            .withColumn("is_new_user",
                when(col("event_name").equalTo("_first_open"), 1).otherwise(0))
            .groupBy("app_id", "event_date", "platform", "session_id", "user_pseudo_id",
                "traffic_source_source", "traffic_source_medium", "traffic_source_campaign",
                "traffic_source_clid_platform", "traffic_source_channel_group")
            .agg(
                countDistinct("event_id").alias("event_count"),
                sum("is_view_event").alias("view_count"),
                max("session_duration").alias("session_duration"),
                sum(when(col("user_engagement_time_msec").isNotNull(),
                    col("user_engagement_time_msec")).otherwise(0)).alias("user_engagement_time_msec"),
                max("is_new_user").alias("new_user_indicator")
            )
            // Aligned with Redshift: session_indicator = view_count > 1 OR session_duration > 10000
            .withColumn("session_indicator",
                when(col("view_count").gt(1)
                    .or(col("session_duration").gt(10000)), 1).otherwise(0));

        // Join with user data for first_traffic_* fields
        Dataset<Row> sessionWithUser;
        if (!userData.isEmpty() && hasFirstTrafficFields(userData)) {
            Dataset<Row> userFirstTraffic = userData.select(
                col("user_pseudo_id"),
                col("first_traffic_source"),
                col("first_traffic_medium"),
                col("first_traffic_campaign"),
                col("first_traffic_clid_platform"),
                col("first_traffic_channel_group"),
                col("first_app_install_source")
            );
            sessionWithUser = sessionMetrics.join(userFirstTraffic, "user_pseudo_id");
        } else {
            sessionWithUser = sessionMetrics
                .withColumn("first_traffic_source", lit(null).cast("string"))
                .withColumn("first_traffic_medium", lit(null).cast("string"))
                .withColumn("first_traffic_campaign", lit(null).cast("string"))
                .withColumn("first_traffic_clid_platform", lit(null).cast("string"))
                .withColumn("first_traffic_channel_group", lit(null).cast("string"))
                .withColumn("first_app_install_source", lit(null).cast("string"));
        }

        // Session-level traffic source aggregations
        Dataset<Row> bySessionSource = aggregateByDimension(sessionMetrics,
            "Session Traffic Source", col("traffic_source_source"));
        Dataset<Row> bySessionMedium = aggregateByDimension(sessionMetrics,
            "Session Traffic Medium", col("traffic_source_medium"));
        Dataset<Row> bySessionSourceMedium = aggregateByDimension(sessionMetrics,
            "Session Traffic Source / Medium",
            concat_ws(" / ", col("traffic_source_source"), col("traffic_source_medium")));
        Dataset<Row> bySessionCampaign = aggregateByDimension(sessionMetrics,
            "Session Traffic Campaign", col("traffic_source_campaign"));
        Dataset<Row> bySessionChannel = aggregateByDimension(sessionMetrics,
            "Session Traffic Channel Group", col("traffic_source_channel_group"));

        // User first traffic source aggregations (First-Touch Attribution)
        Dataset<Row> byFirstSource = aggregateByDimension(sessionWithUser,
            "User First Traffic Source", col("first_traffic_source"));
        Dataset<Row> byFirstMedium = aggregateByDimension(sessionWithUser,
            "User First Traffic Medium", col("first_traffic_medium"));
        Dataset<Row> byFirstSourceMedium = aggregateByDimension(sessionWithUser,
            "User First Traffic Source / Medium",
            concat_ws(" / ", col("first_traffic_source"), col("first_traffic_medium")));
        Dataset<Row> byFirstCampaign = aggregateByDimension(sessionWithUser,
            "User First Traffic Campaign", col("first_traffic_campaign"));
        Dataset<Row> byFirstChannel = aggregateByDimension(sessionWithUser,
            "User First Traffic Channel Group", col("first_traffic_channel_group"));
        Dataset<Row> byAppInstallSource = aggregateByDimension(sessionWithUser,
            "App First Install Source", col("first_app_install_source"));

        Dataset<Row> allAcquisition = bySessionSource
            .union(bySessionMedium)
            .union(bySessionSourceMedium)
            .union(bySessionCampaign)
            .union(bySessionChannel)
            .union(byFirstSource)
            .union(byFirstMedium)
            .union(byFirstSourceMedium)
            .union(byFirstCampaign)
            .union(byFirstChannel)
            .union(byAppInstallSource);

        createTableIfNotExists(tableName);
        allAcquisition.createOrReplaceTempView("user_acquisition_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING user_acquisition_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND target.aggregation_type = source.aggregation_type "
                + "   AND coalesce(target.aggregation_dim, '') = coalesce(source.aggregation_dim, '') "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND target.user_pseudo_id = source.user_pseudo_id "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("User acquisition updated successfully");
    }

    private boolean hasFirstTrafficFields(final Dataset<Row> userData) {
        java.util.List<String> cols = java.util.Arrays.asList(userData.columns());
        return cols.contains("first_traffic_source");
    }

    private Dataset<Row> aggregateByDimension(final Dataset<Row> sessionMetrics,
                                              final String aggType,
                                              final org.apache.spark.sql.Column dimCol) {
        // Aligned with Redshift: group by user_pseudo_id
        return sessionMetrics
            .withColumn("aggregation_dim", dimCol)
            .groupBy("app_id", "event_date", "platform", "user_pseudo_id", "aggregation_dim")
            .agg(
                sum("new_user_indicator").alias("new_user_count"),
                count("session_id").alias("session_count"),
                sum("session_indicator").alias("engaged_session_count"),
                sum("event_count").alias("event_count"),
                sum(when(col("session_indicator").equalTo(1),
                    col("user_engagement_time_msec")).otherwise(0)).alias("total_engagement_time_msec")
            )
            .withColumn("aggregation_type", lit(aggType))
            .withColumn("engagement_rate",
                when(col("event_count").gt(0),
                    col("engaged_session_count").cast("double").divide(col("event_count")))
                .otherwise(0.0))
            .withColumn("avg_engagement_time_seconds",
                when(col("engaged_session_count").gt(0),
                    col("total_engagement_time_msec").cast("double")
                        .divide(col("engaged_session_count")).divide(1000))
                .otherwise(0.0))
            .withColumn("updated_at", current_timestamp())
            .select("app_id", "event_date", "aggregation_type", "aggregation_dim", "platform",
                "user_pseudo_id", "new_user_count", "session_count", "engaged_session_count",
                "engagement_rate", "total_engagement_time_msec", "avg_engagement_time_seconds",
                "event_count", "updated_at");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "aggregation_type STRING, "
                + "aggregation_dim STRING, "
                + "platform STRING, "
                + "user_pseudo_id STRING, "
                + "new_user_count BIGINT, "
                + "session_count BIGINT, "
                + "engaged_session_count BIGINT, "
                + "engagement_rate DOUBLE, "
                + "total_engagement_time_msec BIGINT, "
                + "avg_engagement_time_seconds DOUBLE, "
                + "event_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
