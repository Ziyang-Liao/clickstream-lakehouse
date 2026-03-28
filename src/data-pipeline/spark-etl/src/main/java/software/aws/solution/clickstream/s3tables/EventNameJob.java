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

import static org.apache.spark.sql.functions.coalesce;
import static org.apache.spark.sql.functions.col;
import static org.apache.spark.sql.functions.countDistinct;
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.lit;
import static org.apache.spark.sql.functions.sum;
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating event name statistics in S3 Tables.
 * Aligned with Redshift clickstream_engagement_event_name.
 */
@Slf4j
public class EventNameJob {

    public static final String EVENT_NAME_TABLE = "event_name";

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    public EventNameJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createEventName(eventData);
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

    void createEventName(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(EVENT_NAME_TABLE);
        log.info("Creating event name in table: {}", tableName);

        // Aligned with Redshift: group by user_id
        Dataset<Row> eventName = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .groupBy("app_id", "event_date", "platform", "user_pseudo_id", "event_name")
            .agg(
                countDistinct("event_id").alias("event_count"),
                sum(coalesce(col("event_value"), lit(0.0))).alias("event_value")
            )
            .withColumn("updated_at", current_timestamp());

        createTableIfNotExists(tableName);
        eventName.createOrReplaceTempView("event_name_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING event_name_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND target.user_pseudo_id = source.user_pseudo_id "
                + "   AND target.event_name = source.event_name "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Event name updated successfully");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "user_pseudo_id STRING, "
                + "event_name STRING, "
                + "event_count BIGINT, "
                + "event_value DOUBLE, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
