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
import static org.apache.spark.sql.functions.count;
import static org.apache.spark.sql.functions.countDistinct;
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.max;
import static org.apache.spark.sql.functions.sum;
import static org.apache.spark.sql.functions.to_date;
import static org.apache.spark.sql.functions.when;

/**
 * Job for creating engagement KPI table in S3 Tables.
 * Aligned with Redshift clickstream_engagement_kpi metrics.
 */
@Slf4j
public class EngagementKpiJob {

    public static final String ENGAGEMENT_KPI_TABLE = "engagement_kpi";

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    public EngagementKpiJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createEngagementKpi(eventData);
    }

    Dataset<Row> readOdsEventData() {
        String odsPath = config.getOdsPath("event_v2");
        log.info("Reading ODS event data from: {}", odsPath);

        java.sql.Timestamp startTs = new java.sql.Timestamp(config.getStartTimestamp());
        java.sql.Timestamp endTs = new java.sql.Timestamp(config.getEndTimestamp());

        Dataset<Row> eventData = spark.read()
            .parquet(odsPath)
            .filter(col("event_timestamp").geq(startTs))
            .filter(col("event_timestamp").lt(endTs));

        long count = eventData.count();
        log.info("Read {} events from ODS", count);

        return eventData;
    }

    void createEngagementKpi(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(ENGAGEMENT_KPI_TABLE);
        log.info("Creating engagement KPI in table: {}", tableName);

        // Step 1: Calculate session-level metrics (aligned with Redshift tmp1 CTE)
        Dataset<Row> sessionMetrics = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .withColumn("is_view_event",
                when(col("event_name").isin("_page_view", "_screen_view"), 1).otherwise(0))
            .groupBy(
                col("app_id"),
                col("event_date"),
                col("platform"),
                col("session_id"),
                col("user_pseudo_id")
            )
            .agg(
                sum(when(col("user_engagement_time_msec").isNotNull(), col("user_engagement_time_msec")).otherwise(0))
                    .alias("user_engagement_time_msec"),
                sum("is_view_event").alias("view_count"),
                max("session_duration").alias("session_duration")
            )
            // Aligned with Redshift: session_indicator = view_count > 1 OR session_duration > 10000
            // Note: Redshift does NOT include user_engagement_time > 10000000
            .withColumn("session_indicator",
                when(col("view_count").gt(1)
                    .or(col("session_duration").gt(10000)), 1).otherwise(0));

        // Step 2: Calculate daily KPIs (aligned with Redshift final SELECT)
        Dataset<Row> engagementKpi = sessionMetrics
            .groupBy("app_id", "event_date", "platform")
            .agg(
                countDistinct("user_pseudo_id").alias("total_users"),
                sum("session_indicator").alias("engaged_sessions"),
                sum(when(col("session_indicator").equalTo(1), col("user_engagement_time_msec")).otherwise(0))
                    .alias("total_engagement_time_msec")
            )
            // avg_engaged_session_per_user = engaged_sessions / total_users
            .withColumn("avg_engaged_session_per_user",
                col("engaged_sessions").cast("double").divide(col("total_users")))
            // avg_engagement_time_per_session_seconds = total_engagement_time / engaged_sessions / 1000
            .withColumn("avg_engagement_time_per_session_seconds",
                when(col("engaged_sessions").gt(0),
                    col("total_engagement_time_msec").cast("double")
                        .divide(col("engaged_sessions")).divide(1000))
                .otherwise(0.0))
            // avg_engagement_time_per_user_seconds = total_engagement_time / total_users / 1000
            .withColumn("avg_engagement_time_per_user_seconds",
                col("total_engagement_time_msec").cast("double")
                    .divide(col("total_users")).divide(1000))
            .withColumn("updated_at", current_timestamp());

        createEngagementKpiTableIfNotExists(tableName);
        engagementKpi.createOrReplaceTempView("engagement_kpi_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING engagement_kpi_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "WHEN MATCHED THEN UPDATE SET "
                + "   total_users = source.total_users, "
                + "   engaged_sessions = source.engaged_sessions, "
                + "   total_engagement_time_msec = source.total_engagement_time_msec, "
                + "   avg_engaged_session_per_user = source.avg_engaged_session_per_user, "
                + "   avg_engagement_time_per_session_seconds = source.avg_engagement_time_per_session_seconds, "
                + "   avg_engagement_time_per_user_seconds = source.avg_engagement_time_per_user_seconds, "
                + "   updated_at = source.updated_at "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Engagement KPI updated successfully");
    }

    void createEngagementKpiTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "   app_id STRING, "
                + "   event_date DATE, "
                + "   platform STRING, "
                + "   total_users BIGINT, "
                + "   engaged_sessions BIGINT, "
                + "   total_engagement_time_msec BIGINT, "
                + "   avg_engaged_session_per_user DOUBLE, "
                + "   avg_engagement_time_per_session_seconds DOUBLE, "
                + "   avg_engagement_time_per_user_seconds DOUBLE, "
                + "   updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );

        spark.sql(createSQL);
        log.info("Table {} created or already exists", tableName);
    }
}
