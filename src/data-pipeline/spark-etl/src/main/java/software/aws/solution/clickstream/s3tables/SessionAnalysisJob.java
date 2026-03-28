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
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.max;
import static org.apache.spark.sql.functions.min;
import static org.apache.spark.sql.functions.sum;
import static org.apache.spark.sql.functions.to_date;
import static org.apache.spark.sql.functions.unix_timestamp;
import static org.apache.spark.sql.functions.when;

/**
 * Job for creating session analysis table in S3 Tables.
 * Aligned with Redshift clickstream_engagement_kpi metrics.
 */
@Slf4j
public class SessionAnalysisJob extends BaseModelingJob {

    public static final String SESSION_ANALYSIS_TABLE = "session_analysis";


    public SessionAnalysisJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createSessionAnalysis(eventData);
    }


    void createSessionAnalysis(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(SESSION_ANALYSIS_TABLE);
        log.info("Creating session analysis in table: {}", tableName);

        // Aligned with Redshift clickstream_engagement_kpi:
        // - session_indicator: page_view + screen_view > 1 OR session_duration > 10000ms
        // - user_engagement_time_msec from events
        Dataset<Row> sessionAnalysis = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .withColumn("is_view_event",
                when(col("event_name").isin("_page_view", "_screen_view"), 1).otherwise(0))
            .groupBy(
                col("app_id"),
                col("session_id"),
                col("user_pseudo_id"),
                col("platform"),
                col("event_date")
            )
            .agg(
                min("event_timestamp").alias("session_start_time"),
                max("event_timestamp").alias("session_end_time"),
                count("*").alias("events_count"),
                sum("is_view_event").alias("view_count"),
                sum(when(col("user_engagement_time_msec").isNotNull(), col("user_engagement_time_msec")).otherwise(0))
                    .alias("user_engagement_time_msec"),
                max("session_duration").alias("session_duration")
            )
            .withColumn("session_duration_calc",
                unix_timestamp(col("session_end_time")).minus(unix_timestamp(col("session_start_time"))).multiply(1000))
            .withColumn("session_duration_final",
                when(col("session_duration").isNotNull(), col("session_duration")).otherwise(col("session_duration_calc")))
            // Aligned with Redshift: engaged session = view_count > 1 OR session_duration > 10000ms
            // Note: Redshift does NOT include user_engagement_time > 10000000
            .withColumn("engaged_session",
                when(col("view_count").gt(1)
                    .or(col("session_duration_final").gt(10000)), 1).otherwise(0))
            // Aligned with Redshift: bounce = NOT engaged
            .withColumn("bounce_flag",
                when(col("engaged_session").equalTo(0), true).otherwise(false))
            .drop("session_duration", "session_duration_calc")
            .withColumnRenamed("session_duration_final", "session_duration")
            .withColumn("updated_at", current_timestamp());

        createSessionAnalysisTableIfNotExists(tableName);
        sessionAnalysis.createOrReplaceTempView("session_analysis_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING session_analysis_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND coalesce(target.session_id, '') = coalesce(source.session_id, '') "
                + "   AND target.event_date = source.event_date "
                + "WHEN MATCHED THEN UPDATE SET "
                + "   user_pseudo_id = source.user_pseudo_id, "
                + "   platform = source.platform, "
                + "   session_start_time = source.session_start_time, "
                + "   session_end_time = source.session_end_time, "
                + "   session_duration = source.session_duration, "
                + "   view_count = source.view_count, "
                + "   events_count = source.events_count, "
                + "   user_engagement_time_msec = source.user_engagement_time_msec, "
                + "   engaged_session = source.engaged_session, "
                + "   bounce_flag = source.bounce_flag, "
                + "   updated_at = source.updated_at "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Session analysis updated successfully");
    }

    void createSessionAnalysisTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "   app_id STRING, "
                + "   session_id STRING, "
                + "   user_pseudo_id STRING, "
                + "   platform STRING, "
                + "   event_date DATE, "
                + "   session_start_time TIMESTAMP, "
                + "   session_end_time TIMESTAMP, "
                + "   session_duration BIGINT, "
                + "   view_count BIGINT, "
                + "   events_count BIGINT, "
                + "   user_engagement_time_msec BIGINT, "
                + "   engaged_session INT, "
                + "   bounce_flag BOOLEAN, "
                + "   updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );

        spark.sql(createSQL);
        log.info("Table {} created or already exists", tableName);
    }
}
