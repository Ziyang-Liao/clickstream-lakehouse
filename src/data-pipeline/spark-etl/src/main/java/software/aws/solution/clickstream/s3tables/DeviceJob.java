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
import static org.apache.spark.sql.functions.concat_ws;
import static org.apache.spark.sql.functions.countDistinct;
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.lit;
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating device statistics in S3 Tables.
 * Aligned with Redshift clickstream_device_user_device.
 */
@Slf4j
public class DeviceJob {

    public static final String DEVICE_TABLE = "device";

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    public DeviceJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createDevice(eventData);
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

    void createDevice(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(DEVICE_TABLE);
        log.info("Creating device in table: {}", tableName);

        // Aligned with Redshift: group by user_pseudo_id
        Dataset<Row> device = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .withColumn("device", coalesce(col("device_mobile_model_name"), col("device_ua_device")))
            .withColumn("operating_system",
                coalesce(col("device_operating_system"), col("device_ua_os"), lit("null")))
            .withColumn("operating_system_version",
                coalesce(col("device_operating_system_version"), col("device_ua_os_version"), lit("null")))
            .withColumn("device_screen_resolution",
                concat_ws(" x ",
                    coalesce(col("device_screen_width").cast("string"), lit("")),
                    coalesce(col("device_screen_height").cast("string"), lit(""))))
            .groupBy("app_id", "event_date", "user_pseudo_id", "platform",
                "device", "app_version", "operating_system", "operating_system_version",
                "device_ua_browser", "device_screen_resolution",
                "device_ua_device", "device_ua_device_category")
            .agg(countDistinct("event_id").alias("event_count"))
            .withColumn("updated_at", current_timestamp());

        createTableIfNotExists(tableName);
        device.createOrReplaceTempView("device_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING device_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND target.user_pseudo_id = source.user_pseudo_id "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND coalesce(target.device, '') = coalesce(source.device, '') "
                + "   AND coalesce(target.app_version, '') = coalesce(source.app_version, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Device updated successfully");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "user_pseudo_id STRING, "
                + "platform STRING, "
                + "device STRING, "
                + "app_version STRING, "
                + "operating_system STRING, "
                + "operating_system_version STRING, "
                + "device_ua_browser STRING, "
                + "device_screen_resolution STRING, "
                + "device_ua_device STRING, "
                + "device_ua_device_category STRING, "
                + "event_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
