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
import static org.apache.spark.sql.functions.countDistinct;
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.lit;
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating page/screen view statistics in S3 Tables.
 * Aligned with Redshift clickstream_engagement_page_screen_view.
 */
@Slf4j
public class PageScreenViewJob {

    public static final String PAGE_SCREEN_VIEW_TABLE = "page_screen_view";

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    public PageScreenViewJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createPageScreenView(eventData);
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

    void createPageScreenView(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(PAGE_SCREEN_VIEW_TABLE);
        log.info("Creating page/screen view in table: {}", tableName);

        // Filter to page_view and screen_view events only
        Dataset<Row> viewEvents = eventData
            .filter(col("event_name").isin("_page_view", "_screen_view"))
            .withColumn("event_date", to_date(col("event_timestamp")));

        // Page title aggregation
        Dataset<Row> byPageTitle = viewEvents
            .filter(col("page_view_page_title").isNotNull())
            .groupBy("app_id", "event_date", "platform", "page_view_page_title")
            .agg(countDistinct("event_id").alias("view_count"))
            .withColumn("aggregation_type", lit("Page Title"))
            .withColumnRenamed("page_view_page_title", "aggregation_dim");

        // Page URL path aggregation
        Dataset<Row> byPageUrl = viewEvents
            .filter(col("page_view_page_url_path").isNotNull())
            .groupBy("app_id", "event_date", "platform", "page_view_page_url_path")
            .agg(countDistinct("event_id").alias("view_count"))
            .withColumn("aggregation_type", lit("Page URL Path"))
            .withColumnRenamed("page_view_page_url_path", "aggregation_dim");

        // Screen name aggregation
        Dataset<Row> byScreenName = viewEvents
            .filter(col("screen_view_screen_name").isNotNull())
            .groupBy("app_id", "event_date", "platform", "screen_view_screen_name")
            .agg(countDistinct("event_id").alias("view_count"))
            .withColumn("aggregation_type", lit("Screen Name"))
            .withColumnRenamed("screen_view_screen_name", "aggregation_dim");

        // Screen class aggregation
        Dataset<Row> byScreenClass = viewEvents
            .filter(col("screen_view_screen_id").isNotNull())
            .groupBy("app_id", "event_date", "platform", "screen_view_screen_id")
            .agg(countDistinct("event_id").alias("view_count"))
            .withColumn("aggregation_type", lit("Screen Class"))
            .withColumnRenamed("screen_view_screen_id", "aggregation_dim");

        Dataset<Row> allViews = byPageTitle
            .select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "view_count")
            .union(byPageUrl.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "view_count"))
            .union(byScreenName.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "view_count"))
            .union(byScreenClass.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "view_count"))
            .withColumn("updated_at", current_timestamp());

        createTableIfNotExists(tableName);
        allViews.createOrReplaceTempView("page_screen_view_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING page_screen_view_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND target.aggregation_type = source.aggregation_type "
                + "   AND coalesce(target.aggregation_dim, '') = coalesce(source.aggregation_dim, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Page/screen view updated successfully");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "aggregation_type STRING, "
                + "aggregation_dim STRING, "
                + "view_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
