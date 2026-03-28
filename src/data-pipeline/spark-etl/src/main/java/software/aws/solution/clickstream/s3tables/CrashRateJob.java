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
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.to_date;
import static org.apache.spark.sql.functions.when;

/**
 * Job for creating crash rate statistics in S3 Tables.
 * Aligned with Redshift clickstream_device_crash_rate.
 */
@Slf4j
public class CrashRateJob extends BaseModelingJob {

    public static final String CRASH_RATE_TABLE = "crash_rate";


    public CrashRateJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createCrashRate(eventData);
    }


    void createCrashRate(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(CRASH_RATE_TABLE);
        log.info("Creating crash rate in table: {}", tableName);

        // Aligned with Redshift: store user_pseudo_id and crashed_user_id per row
        Dataset<Row> crashRate = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .withColumn("crashed_user_id",
                when(col("event_name").equalTo("_app_exception"), col("user_pseudo_id")).otherwise(null))
            .select("app_id", "event_date", "platform", "app_version", "user_pseudo_id", "crashed_user_id")
            .distinct()
            .withColumn("updated_at", current_timestamp());

        createTableIfNotExists(tableName);
        crashRate.createOrReplaceTempView("crash_rate_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING crash_rate_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND coalesce(target.app_version, '') = coalesce(source.app_version, '') "
                + "   AND coalesce(target.user_pseudo_id, '') = coalesce(source.user_pseudo_id, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Crash rate updated successfully");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "app_version STRING, "
                + "user_pseudo_id STRING, "
                + "crashed_user_id STRING, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
