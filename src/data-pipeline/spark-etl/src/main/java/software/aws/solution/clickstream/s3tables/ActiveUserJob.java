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
import static org.apache.spark.sql.functions.date_trunc;
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating DAU/WAU/MAU statistics in S3 Tables.
 * Aligned with Redshift clickstream_retention_dau_wau.
 */
@Slf4j
public class ActiveUserJob extends BaseModelingJob {

    public static final String DAU_TABLE = "dau";
    public static final String WAU_TABLE = "wau";
    public static final String MAU_TABLE = "mau";


    public ActiveUserJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createDau(eventData);
        createWau(eventData);
        createMau(eventData);
    }


    void createDau(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(DAU_TABLE);
        log.info("Creating DAU in table: {}", tableName);

        Dataset<Row> dau = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .groupBy("app_id", "event_date", "platform")
            .agg(countDistinct("user_pseudo_id").alias("user_count"))
            .withColumn("updated_at", current_timestamp());

        createDauTableIfNotExists(tableName);
        dau.createOrReplaceTempView("dau_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING dau_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("DAU updated successfully");
    }

    void createWau(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(WAU_TABLE);
        log.info("Creating WAU in table: {}", tableName);

        Dataset<Row> wau = eventData
            .withColumn("week_start", date_trunc("week", col("event_timestamp")).cast("date"))
            .groupBy("app_id", "week_start", "platform")
            .agg(countDistinct("user_pseudo_id").alias("user_count"))
            .withColumn("updated_at", current_timestamp());

        createWauTableIfNotExists(tableName);
        wau.createOrReplaceTempView("wau_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING wau_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.week_start = source.week_start "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("WAU updated successfully");
    }

    void createMau(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(MAU_TABLE);
        log.info("Creating MAU in table: {}", tableName);

        Dataset<Row> mau = eventData
            .withColumn("month_start", date_trunc("month", col("event_timestamp")).cast("date"))
            .groupBy("app_id", "month_start", "platform")
            .agg(countDistinct("user_pseudo_id").alias("user_count"))
            .withColumn("updated_at", current_timestamp());

        createMauTableIfNotExists(tableName);
        mau.createOrReplaceTempView("mau_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING mau_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.month_start = source.month_start "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("MAU updated successfully");
    }

    void createDauTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "user_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }

    void createWauTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "week_start DATE, "
                + "platform STRING, "
                + "user_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (week_start)",
            tableName
        );
        spark.sql(createSQL);
    }

    void createMauTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "month_start DATE, "
                + "platform STRING, "
                + "user_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (month_start)",
            tableName
        );
        spark.sql(createSQL);
    }
}
