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

/**
 * Job for creating user lifecycle statistics in S3 Tables.
 * Aligned with Redshift clickstream_lifecycle_view_v2.
 */
@Slf4j
public class LifecycleJob extends BaseModelingJob {

    public static final String LIFECYCLE_WEEKLY_TABLE = "lifecycle_weekly";


    public LifecycleJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createLifecycleWeekly(eventData);
    }


    void createLifecycleWeekly(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(LIFECYCLE_WEEKLY_TABLE);
        log.info("Creating lifecycle weekly in table: {}", tableName);

        // Users with session_start events per week
        Dataset<Row> lifecycleWeekly = eventData
            .filter(col("event_name").equalTo("_session_start"))
            .withColumn("time_period_week", date_trunc("week", col("event_timestamp")).cast("date"))
            .groupBy("app_id", "time_period_week", "platform")
            .agg(countDistinct("user_pseudo_id").alias("user_count"))
            .withColumn("updated_at", current_timestamp());

        createTableIfNotExists(tableName);
        lifecycleWeekly.createOrReplaceTempView("lifecycle_weekly_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING lifecycle_weekly_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.time_period_week = source.time_period_week "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Lifecycle weekly updated successfully");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "time_period_week DATE, "
                + "platform STRING, "
                + "user_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (time_period_week)",
            tableName
        );
        spark.sql(createSQL);
    }
}
