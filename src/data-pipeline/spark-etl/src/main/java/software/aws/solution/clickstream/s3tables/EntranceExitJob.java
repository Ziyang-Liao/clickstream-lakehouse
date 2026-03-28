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
import static org.apache.spark.sql.functions.lit;
import static org.apache.spark.sql.functions.row_number;
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating entrance/exit page statistics in S3 Tables.
 * Aligned with Redshift clickstream_engagement_entrance and clickstream_engagement_exit.
 */
@Slf4j
public class EntranceExitJob {

    public static final String ENTRANCE_TABLE = "entrance";
    public static final String EXIT_TABLE = "exit_page";

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    public EntranceExitJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createEntrance(eventData);
        createExit(eventData);
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

    void createEntrance(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(ENTRANCE_TABLE);
        log.info("Creating entrance in table: {}", tableName);

        // Aligned with Redshift: use page_view_entrances = 'true' field
        Dataset<Row> entranceEvents = eventData
            .filter(col("page_view_entrances").equalTo("true"))
            .withColumn("event_date", to_date(col("event_timestamp")));

        // Page Title
        Dataset<Row> byPageTitle = entranceEvents
            .filter(col("event_name").equalTo("_page_view"))
            .filter(col("page_view_page_title").isNotNull())
            .groupBy("app_id", "event_date", "platform", "page_view_page_title")
            .agg(countDistinct("event_id").alias("entrance_count"))
            .withColumn("aggregation_type", lit("Page Title"))
            .withColumnRenamed("page_view_page_title", "aggregation_dim");

        // Page URL Path
        Dataset<Row> byPageUrl = entranceEvents
            .filter(col("event_name").equalTo("_page_view"))
            .filter(col("page_view_page_url_path").isNotNull())
            .groupBy("app_id", "event_date", "platform", "page_view_page_url_path")
            .agg(countDistinct("event_id").alias("entrance_count"))
            .withColumn("aggregation_type", lit("Page URL Path"))
            .withColumnRenamed("page_view_page_url_path", "aggregation_dim");

        // Screen Name
        Dataset<Row> byScreenName = entranceEvents
            .filter(col("event_name").equalTo("_screen_view"))
            .filter(col("screen_view_screen_name").isNotNull())
            .groupBy("app_id", "event_date", "platform", "screen_view_screen_name")
            .agg(countDistinct("event_id").alias("entrance_count"))
            .withColumn("aggregation_type", lit("Screen Name"))
            .withColumnRenamed("screen_view_screen_name", "aggregation_dim");

        // Screen Class
        Dataset<Row> byScreenClass = entranceEvents
            .filter(col("event_name").equalTo("_screen_view"))
            .filter(col("screen_view_screen_id").isNotNull())
            .groupBy("app_id", "event_date", "platform", "screen_view_screen_id")
            .agg(countDistinct("event_id").alias("entrance_count"))
            .withColumn("aggregation_type", lit("Screen Class"))
            .withColumnRenamed("screen_view_screen_id", "aggregation_dim");

        Dataset<Row> allEntrance = byPageTitle
            .select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "entrance_count")
            .union(byPageUrl.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "entrance_count"))
            .union(byScreenName.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "entrance_count"))
            .union(byScreenClass.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "entrance_count"))
            .withColumn("updated_at", current_timestamp());

        createEntranceTableIfNotExists(tableName);
        allEntrance.createOrReplaceTempView("entrance_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING entrance_updates AS source "
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
        log.info("Entrance updated successfully");
    }

    void createExit(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(EXIT_TABLE);
        log.info("Creating exit in table: {}", tableName);

        // Aligned with Redshift: use ROW_NUMBER to find last event per session
        Dataset<Row> viewEvents = eventData
            .filter(col("event_name").isin("_page_view", "_screen_view"))
            .withColumn("event_date", to_date(col("event_timestamp")));

        // Use window function to find last event per session
        org.apache.spark.sql.expressions.WindowSpec windowSpec =
            org.apache.spark.sql.expressions.Window.partitionBy("session_id").orderBy(col("event_timestamp").desc());

        Dataset<Row> lastEvents = viewEvents
            .withColumn("rk", row_number().over(windowSpec))
            .filter(col("rk").equalTo(1));

        // Page Title
        Dataset<Row> byPageTitle = lastEvents
            .filter(col("event_name").equalTo("_page_view"))
            .filter(col("page_view_page_title").isNotNull())
            .groupBy("app_id", "event_date", "platform", "page_view_page_title")
            .agg(count("session_id").alias("exit_count"))
            .withColumn("aggregation_type", lit("Page Title"))
            .withColumnRenamed("page_view_page_title", "aggregation_dim");

        // Page URL Path
        Dataset<Row> byPageUrl = lastEvents
            .filter(col("event_name").equalTo("_page_view"))
            .filter(col("page_view_page_url_path").isNotNull())
            .groupBy("app_id", "event_date", "platform", "page_view_page_url_path")
            .agg(count("session_id").alias("exit_count"))
            .withColumn("aggregation_type", lit("Page URL Path"))
            .withColumnRenamed("page_view_page_url_path", "aggregation_dim");

        // Screen Name
        Dataset<Row> byScreenName = lastEvents
            .filter(col("event_name").equalTo("_screen_view"))
            .filter(col("screen_view_screen_name").isNotNull())
            .groupBy("app_id", "event_date", "platform", "screen_view_screen_name")
            .agg(count("session_id").alias("exit_count"))
            .withColumn("aggregation_type", lit("Screen Name"))
            .withColumnRenamed("screen_view_screen_name", "aggregation_dim");

        // Screen Class
        Dataset<Row> byScreenClass = lastEvents
            .filter(col("event_name").equalTo("_screen_view"))
            .filter(col("screen_view_screen_id").isNotNull())
            .groupBy("app_id", "event_date", "platform", "screen_view_screen_id")
            .agg(count("session_id").alias("exit_count"))
            .withColumn("aggregation_type", lit("Screen Class"))
            .withColumnRenamed("screen_view_screen_id", "aggregation_dim");

        Dataset<Row> allExit = byPageTitle
            .select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "exit_count")
            .union(byPageUrl.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "exit_count"))
            .union(byScreenName.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "exit_count"))
            .union(byScreenClass.select("app_id", "event_date", "platform", "aggregation_type", "aggregation_dim", "exit_count"))
            .withColumn("updated_at", current_timestamp());

        createExitTableIfNotExists(tableName);
        allExit.createOrReplaceTempView("exit_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING exit_updates AS source "
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
        log.info("Exit updated successfully");
    }

    void createEntranceTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "aggregation_type STRING, "
                + "aggregation_dim STRING, "
                + "entrance_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }

    void createExitTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "aggregation_type STRING, "
                + "aggregation_dim STRING, "
                + "exit_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
