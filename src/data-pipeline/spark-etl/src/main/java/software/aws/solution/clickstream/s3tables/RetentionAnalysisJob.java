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
import static org.apache.spark.sql.functions.datediff;
import static org.apache.spark.sql.functions.floor;
import static org.apache.spark.sql.functions.from_unixtime;
import static org.apache.spark.sql.functions.min;
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating retention analysis tables in S3 Tables.
 * Aligned with Redshift clickstream_retention_view_v3 metrics.
 */
@Slf4j
public class RetentionAnalysisJob extends BaseModelingJob {

    public static final String RETENTION_DAILY_TABLE = "retention_daily";
    public static final String RETENTION_WEEKLY_TABLE = "retention_weekly";
    private static final int MAX_RETENTION_DAYS = 42;
    private static final int MAX_RETENTION_WEEKS = 12;


    public RetentionAnalysisJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();
        Dataset<Row> userData = readOdsUserData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createDailyRetention(eventData, userData);
        createWeeklyRetention(eventData, userData);
    }



    void createDailyRetention(final Dataset<Row> eventData, final Dataset<Row> userData) {
        String tableName = config.getFullTableName(RETENTION_DAILY_TABLE);
        log.info("Creating daily retention in table: {}", tableName);

        // Aligned with Redshift: use first_touch_time_msec from user_v2 as cohort date
        Dataset<Row> userFirstTouch;
        if (!userData.isEmpty() && java.util.Arrays.asList(userData.columns()).contains("first_touch_time_msec")) {
            userFirstTouch = userData
                .filter(col("first_touch_time_msec").isNotNull())
                .select(
                    col("user_pseudo_id"),
                    // first_touch_time_msec is in milliseconds, convert to seconds for from_unixtime
                    to_date(from_unixtime(col("first_touch_time_msec").divide(1000))).alias("first_date")
                );
        } else {
            // Fallback: calculate from events
            userFirstTouch = eventData
                .withColumn("event_date", to_date(col("event_timestamp")))
                .groupBy("user_pseudo_id")
                .agg(min("event_date").alias("first_date"));
        }

        // Get user activity dates with platform
        Dataset<Row> userActivity = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .select(
                col("app_id"),
                col("user_pseudo_id"),
                col("platform"),
                col("event_date")
            )
            .distinct();

        // Join to calculate day_diff (aligned with Redshift)
        Dataset<Row> retentionBase = userActivity
            .join(userFirstTouch, "user_pseudo_id")
            .withColumn("day_diff", datediff(col("event_date"), col("first_date")))
            .filter(col("day_diff").geq(0).and(col("day_diff").leq(MAX_RETENTION_DAYS)));

        // Aligned with Redshift: exclude users whose first visit is not in the data range
        // (users with min(day_diff) > 0)
        Dataset<Row> excludeUsers = retentionBase
            .groupBy("platform", "user_pseudo_id")
            .agg(min("day_diff").alias("min_day_diff"))
            .filter(col("min_day_diff").gt(0))
            .select("platform", "user_pseudo_id");

        Dataset<Row> filteredRetention = retentionBase
            .join(excludeUsers,
                retentionBase.col("platform").eqNullSafe(excludeUsers.col("platform"))
                    .and(retentionBase.col("user_pseudo_id").equalTo(excludeUsers.col("user_pseudo_id"))),
                "left_anti");

        // Calculate cohort sizes
        Dataset<Row> cohortSizes = filteredRetention
            .filter(col("day_diff").equalTo(0))
            .groupBy("app_id", "platform", "first_date")
            .agg(countDistinct("user_pseudo_id").alias("total_users"));

        // Calculate retained users per day
        Dataset<Row> retainedUsers = filteredRetention
            .groupBy("app_id", "platform", "first_date", "day_diff")
            .agg(countDistinct("user_pseudo_id").alias("returned_user_count"));

        // Join to get final retention metrics
        Dataset<Row> dailyRetention = retainedUsers
            .join(cohortSizes,
                retainedUsers.col("app_id").equalTo(cohortSizes.col("app_id"))
                    .and(retainedUsers.col("platform").eqNullSafe(cohortSizes.col("platform")))
                    .and(retainedUsers.col("first_date").equalTo(cohortSizes.col("first_date"))),
                "inner")
            .select(
                retainedUsers.col("app_id"),
                retainedUsers.col("platform"),
                retainedUsers.col("first_date").alias("cohort_date"),
                col("day_diff").alias("day_number"),
                col("total_users").alias("cohort_users"),
                col("returned_user_count").alias("retained_users"),
                col("returned_user_count").cast("double").divide(col("total_users")).alias("retention_rate")
            )
            .withColumn("updated_at", current_timestamp());

        createDailyRetentionTableIfNotExists(tableName);
        dailyRetention.createOrReplaceTempView("daily_retention_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING daily_retention_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND target.cohort_date = source.cohort_date "
                + "   AND target.day_number = source.day_number "
                + "WHEN MATCHED THEN UPDATE SET "
                + "   cohort_users = source.cohort_users, "
                + "   retained_users = source.retained_users, "
                + "   retention_rate = source.retention_rate, "
                + "   updated_at = source.updated_at "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Daily retention updated successfully");
    }

    void createWeeklyRetention(final Dataset<Row> eventData, final Dataset<Row> userData) {
        String tableName = config.getFullTableName(RETENTION_WEEKLY_TABLE);
        log.info("Creating weekly retention in table: {}", tableName);

        // Use first_touch_time_msec from user_v2 as cohort week
        Dataset<Row> userFirstTouch;
        if (!userData.isEmpty() && java.util.Arrays.asList(userData.columns()).contains("first_touch_time_msec")) {
            userFirstTouch = userData
                .filter(col("first_touch_time_msec").isNotNull())
                .select(
                    col("user_pseudo_id"),
                    // first_touch_time_msec is in milliseconds, convert to seconds for from_unixtime
                    date_trunc("week", from_unixtime(col("first_touch_time_msec").divide(1000))).alias("first_week")
                );
        } else {
            userFirstTouch = eventData
                .withColumn("event_date", to_date(col("event_timestamp")))
                .withColumn("event_week", date_trunc("week", col("event_date")))
                .groupBy("user_pseudo_id")
                .agg(min("event_week").alias("first_week"));
        }

        // Get user activity weeks
        Dataset<Row> userActivity = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .withColumn("activity_week", date_trunc("week", col("event_date")))
            .select(
                col("app_id"),
                col("user_pseudo_id"),
                col("platform"),
                col("activity_week")
            )
            .distinct();

        // Join to calculate week_number
        Dataset<Row> retentionBase = userActivity
            .join(userFirstTouch, "user_pseudo_id")
            .withColumn("week_number", floor(datediff(col("activity_week"), col("first_week")).divide(7)))
            .filter(col("week_number").geq(0).and(col("week_number").leq(MAX_RETENTION_WEEKS)));

        // Calculate cohort sizes
        Dataset<Row> cohortSizes = retentionBase
            .filter(col("week_number").equalTo(0))
            .groupBy("app_id", "platform", "first_week")
            .agg(countDistinct("user_pseudo_id").alias("total_users"));

        // Calculate retained users per week
        Dataset<Row> retainedUsers = retentionBase
            .groupBy("app_id", "platform", "first_week", "week_number")
            .agg(countDistinct("user_pseudo_id").alias("returned_user_count"));

        // Join to get final retention metrics
        Dataset<Row> weeklyRetention = retainedUsers
            .join(cohortSizes,
                retainedUsers.col("app_id").equalTo(cohortSizes.col("app_id"))
                    .and(retainedUsers.col("platform").eqNullSafe(cohortSizes.col("platform")))
                    .and(retainedUsers.col("first_week").equalTo(cohortSizes.col("first_week"))),
                "inner")
            .select(
                retainedUsers.col("app_id"),
                retainedUsers.col("platform"),
                retainedUsers.col("first_week").alias("cohort_date"),
                col("week_number"),
                col("total_users").alias("cohort_users"),
                col("returned_user_count").alias("retained_users"),
                col("returned_user_count").cast("double").divide(col("total_users")).alias("retention_rate")
            )
            .withColumn("updated_at", current_timestamp());

        createWeeklyRetentionTableIfNotExists(tableName);
        weeklyRetention.createOrReplaceTempView("weekly_retention_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING weekly_retention_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND target.cohort_date = source.cohort_date "
                + "   AND target.week_number = source.week_number "
                + "WHEN MATCHED THEN UPDATE SET "
                + "   cohort_users = source.cohort_users, "
                + "   retained_users = source.retained_users, "
                + "   retention_rate = source.retention_rate, "
                + "   updated_at = source.updated_at "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Weekly retention updated successfully");
    }

    void createDailyRetentionTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "   app_id STRING, "
                + "   platform STRING, "
                + "   cohort_date DATE, "
                + "   day_number INT, "
                + "   cohort_users BIGINT, "
                + "   retained_users BIGINT, "
                + "   retention_rate DOUBLE, "
                + "   updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (cohort_date)",
            tableName
        );

        spark.sql(createSQL);
        log.info("Table {} created or already exists", tableName);
    }

    void createWeeklyRetentionTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "   app_id STRING, "
                + "   platform STRING, "
                + "   cohort_date TIMESTAMP, "
                + "   week_number BIGINT, "
                + "   cohort_users BIGINT, "
                + "   retained_users BIGINT, "
                + "   retention_rate DOUBLE, "
                + "   updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (days(cohort_date))",
            tableName
        );

        spark.sql(createSQL);
        log.info("Table {} created or already exists", tableName);
    }
}
