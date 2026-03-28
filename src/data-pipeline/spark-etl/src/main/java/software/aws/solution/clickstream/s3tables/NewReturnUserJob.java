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
import static org.apache.spark.sql.functions.from_unixtime;
import static org.apache.spark.sql.functions.max;
import static org.apache.spark.sql.functions.to_date;
import static org.apache.spark.sql.functions.when;

/**
 * Job for creating new/returning user statistics in S3 Tables.
 * Aligned with Redshift clickstream_retention_user_new_return.
 */
@Slf4j
public class NewReturnUserJob extends BaseModelingJob {

    public static final String NEW_RETURN_USER_TABLE = "new_return_user";


    public NewReturnUserJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createNewReturnUser(eventData);
    }


    void createNewReturnUser(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(NEW_RETURN_USER_TABLE);
        log.info("Creating new/return user in table: {}", tableName);

        Dataset<Row> userData = readOdsUserData();

        Dataset<Row> newReturnUser;
        if (!userData.isEmpty() && hasFirstTouchField(userData)) {
            // Aligned with Redshift: use first_touch_time_msec to determine new/returning
            Dataset<Row> userFirstTouch = userData
                .select(col("user_pseudo_id"),
                    to_date(from_unixtime(col("first_touch_time_msec").divide(1000))).alias("first_date"));

            Dataset<Row> dailyUsers = eventData
                .withColumn("event_date", to_date(col("event_timestamp")))
                .select("app_id", "event_date", "platform", "user_pseudo_id")
                .distinct();

            newReturnUser = dailyUsers
                .join(userFirstTouch, "user_pseudo_id")
                .withColumn("user_type",
                    when(col("event_date").equalTo(col("first_date")), "NEW").otherwise("RETURNING"))
                .groupBy("app_id", "event_date", "platform", "user_type")
                .agg(countDistinct("user_pseudo_id").alias("user_count"))
                .withColumn("updated_at", current_timestamp());
        } else {
            // Fallback: use _first_open event
            Dataset<Row> userType = eventData
                .withColumn("event_date", to_date(col("event_timestamp")))
                .withColumn("is_new_user",
                    when(col("event_name").equalTo("_first_open"), 1).otherwise(0))
                .groupBy("app_id", "event_date", "platform", "user_pseudo_id")
                .agg(max("is_new_user").alias("is_new"))
                .withColumn("user_type",
                    when(col("is_new").equalTo(1), "NEW").otherwise("RETURNING"));

            newReturnUser = userType
                .groupBy("app_id", "event_date", "platform", "user_type")
                .agg(countDistinct("user_pseudo_id").alias("user_count"))
                .withColumn("updated_at", current_timestamp());
        }

        createTableIfNotExists(tableName);
        newReturnUser.createOrReplaceTempView("new_return_user_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING new_return_user_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND target.user_type = source.user_type "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("New/return user updated successfully");
    }


    private boolean hasFirstTouchField(final Dataset<Row> userData) {
        return java.util.Arrays.asList(userData.columns()).contains("first_touch_time_msec");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "user_type STRING, "
                + "user_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
