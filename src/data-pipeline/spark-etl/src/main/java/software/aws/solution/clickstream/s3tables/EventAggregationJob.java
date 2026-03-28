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
import static org.apache.spark.sql.functions.date_trunc;
import static org.apache.spark.sql.functions.to_date;
import static org.apache.spark.sql.functions.when;

/**
 * Job for creating event aggregation tables in S3 Tables.
 * Aligned with Redshift clickstream_engagement_day_event_view metrics.
 */
@Slf4j
public class EventAggregationJob extends BaseModelingJob {

    public static final String EVENT_DAILY_SUMMARY_TABLE = "event_daily_summary";
    public static final String EVENT_HOURLY_SUMMARY_TABLE = "event_hourly_summary";

    public EventAggregationJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createDailySummary(eventData);
        createHourlySummary(eventData);
    }

    void createDailySummary(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(EVENT_DAILY_SUMMARY_TABLE);
        log.info("Creating daily summary in table: {}", tableName);

        // Aligned with Redshift: count(distinct event_id) and count(distinct view_event_indicator)
        Dataset<Row> dailySummary = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .withColumn("view_event_indicator",
                when(col("event_name").isin("_page_view", "_screen_view"), col("event_id")).otherwise(null))
            .groupBy(
                col("app_id"),
                col("event_date"),
                col("event_name"),
                col("platform"),
                col("geo_country")
            )
            .agg(
                countDistinct("event_id").alias("event_count"),
                countDistinct("view_event_indicator").alias("view_count"),
                countDistinct("user_pseudo_id").alias("user_count"),
                countDistinct("session_id").alias("session_count")
            )
            .withColumn("updated_at", current_timestamp());

        createDailySummaryTableIfNotExists(tableName);
        dailySummary.createOrReplaceTempView("daily_summary_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING daily_summary_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND target.event_name = source.event_name "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND coalesce(target.geo_country, '') = coalesce(source.geo_country, '') "
                + "WHEN MATCHED THEN UPDATE SET "
                + "   event_count = source.event_count, "
                + "   view_count = source.view_count, "
                + "   user_count = source.user_count, "
                + "   session_count = source.session_count, "
                + "   updated_at = source.updated_at "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Daily summary updated successfully");
    }

    void createHourlySummary(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(EVENT_HOURLY_SUMMARY_TABLE);
        log.info("Creating hourly summary in table: {}", tableName);

        Dataset<Row> hourlySummary = eventData
            .withColumn("event_hour", date_trunc("hour", col("event_timestamp")))
            .withColumn("view_event_indicator",
                when(col("event_name").isin("_page_view", "_screen_view"), col("event_id")).otherwise(null))
            .groupBy(
                col("app_id"),
                col("event_hour"),
                col("event_name"),
                col("platform"),
                col("geo_country")
            )
            .agg(
                countDistinct("event_id").alias("event_count"),
                countDistinct("view_event_indicator").alias("view_count"),
                countDistinct("user_pseudo_id").alias("user_count"),
                countDistinct("session_id").alias("session_count")
            )
            .withColumn("updated_at", current_timestamp());

        createHourlySummaryTableIfNotExists(tableName);
        hourlySummary.createOrReplaceTempView("hourly_summary_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING hourly_summary_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_hour = source.event_hour "
                + "   AND target.event_name = source.event_name "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND coalesce(target.geo_country, '') = coalesce(source.geo_country, '') "
                + "WHEN MATCHED THEN UPDATE SET "
                + "   event_count = source.event_count, "
                + "   view_count = source.view_count, "
                + "   user_count = source.user_count, "
                + "   session_count = source.session_count, "
                + "   updated_at = source.updated_at "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Hourly summary updated successfully");
    }

    void createDailySummaryTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "   app_id STRING, "
                + "   event_date DATE, "
                + "   event_name STRING, "
                + "   platform STRING, "
                + "   geo_country STRING, "
                + "   event_count BIGINT, "
                + "   view_count BIGINT, "
                + "   user_count BIGINT, "
                + "   session_count BIGINT, "
                + "   updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );

        spark.sql(createSQL);
        log.info("Table {} created or already exists", tableName);
    }

    void createHourlySummaryTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "   app_id STRING, "
                + "   event_hour TIMESTAMP, "
                + "   event_name STRING, "
                + "   platform STRING, "
                + "   geo_country STRING, "
                + "   event_count BIGINT, "
                + "   view_count BIGINT, "
                + "   user_count BIGINT, "
                + "   session_count BIGINT, "
                + "   updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (days(event_hour))",
            tableName
        );

        spark.sql(createSQL);
        log.info("Table {} created or already exists", tableName);
    }
}
