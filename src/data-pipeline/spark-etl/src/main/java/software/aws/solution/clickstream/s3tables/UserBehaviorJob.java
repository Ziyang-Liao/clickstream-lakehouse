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
import static org.apache.spark.sql.functions.count;
import static org.apache.spark.sql.functions.countDistinct;
import static org.apache.spark.sql.functions.current_timestamp;
import static org.apache.spark.sql.functions.lit;
import static org.apache.spark.sql.functions.max;
import static org.apache.spark.sql.functions.min;
import static org.apache.spark.sql.functions.sum;
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating user behavior table in S3 Tables.
 *
 * Creates:
 * - user_behavior: User behavior metrics including first_visit_date, last_visit_date,
 *   total_sessions, total_events, and ltv
 *
 * Uses MERGE INTO for idempotent incremental updates.
 *
 * Requirements: 5.4
 */
@Slf4j
public class UserBehaviorJob {

    public static final String USER_BEHAVIOR_TABLE = "user_behavior";

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    /**
     * Constructor for UserBehaviorJob.
     *
     * @param spark SparkSession instance
     * @param config Configuration for the modeling job
     */
    public UserBehaviorJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    /**
     * Run the user behavior job.
     */
    public void run() {
        // Read ODS event_v2 data
        Dataset<Row> eventData = readOdsEventData();

        // Read ODS user_v2 data
        Dataset<Row> userData = readOdsUserData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        // Create user behavior summary
        createUserBehavior(eventData, userData);
    }

    /**
     * Read ODS event_v2 data for the specified time range.
     *
     * @return Dataset of event data
     */
    Dataset<Row> readOdsEventData() {
        String odsPath = config.getOdsPath("event_v2");
        log.info("Reading ODS event data from: {}", odsPath);

        java.sql.Timestamp startTs = new java.sql.Timestamp(config.getStartTimestamp());
        java.sql.Timestamp endTs = new java.sql.Timestamp(config.getEndTimestamp());

        Dataset<Row> eventData = spark.read()
            .parquet(odsPath)
            .filter(col("event_timestamp").geq(startTs))
            .filter(col("event_timestamp").lt(endTs));

        long count = eventData.count();
        log.info("Read {} events from ODS", count);

        return eventData;
    }

    /**
     * Read ODS user_v2 data.
     *
     * @return Dataset of user data
     */
    Dataset<Row> readOdsUserData() {
        String odsPath = config.getOdsPath("user_v2");
        log.info("Reading ODS user data from: {}", odsPath);

        try {
            Dataset<Row> userData = spark.read().parquet(odsPath);
            long count = userData.count();
            log.info("Read {} users from ODS", count);
            return userData;
        } catch (Exception e) {
            log.warn("Could not read user data: {}", e.getMessage());
            return spark.emptyDataFrame();
        }
    }

    /**
     * Create or update the user_behavior table.
     *
     * @param eventData Source event data
     * @param userData Source user data
     */
    void createUserBehavior(final Dataset<Row> eventData, final Dataset<Row> userData) {
        String tableName = config.getFullTableName(USER_BEHAVIOR_TABLE);
        log.info("Creating user behavior in table: {}", tableName);

        // Aggregate user behavior from events
        Dataset<Row> userBehavior = eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .groupBy(
                col("app_id"),
                col("user_id"),
                col("user_pseudo_id")
            )
            .agg(
                min("event_date").alias("first_visit_date"),
                max("event_date").alias("last_visit_date"),
                countDistinct("session_id").alias("total_sessions"),
                count("*").alias("total_events"),
                sum(coalesce(col("event_value"), lit(0.0))).alias("ltv")
            )
            .withColumn("updated_at", current_timestamp());

        // Create table if not exists
        createUserBehaviorTableIfNotExists(tableName);

        // Register as temp view for MERGE INTO
        userBehavior.createOrReplaceTempView("user_behavior_updates");

        // Use MERGE INTO for idempotent updates
        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING user_behavior_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.user_pseudo_id = source.user_pseudo_id "
                + "WHEN MATCHED THEN UPDATE SET "
                + "   user_id = source.user_id, "
                + "   first_visit_date = LEAST(target.first_visit_date, source.first_visit_date), "
                + "   last_visit_date = GREATEST(target.last_visit_date, source.last_visit_date), "
                + "   total_sessions = target.total_sessions + source.total_sessions, "
                + "   total_events = target.total_events + source.total_events, "
                + "   ltv = target.ltv + source.ltv, "
                + "   updated_at = source.updated_at "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("User behavior updated successfully");
    }

    /**
     * Create the user_behavior table if it doesn't exist.
     *
     * @param tableName Full table name
     */
    void createUserBehaviorTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "   app_id STRING, "
                + "   user_id STRING, "
                + "   user_pseudo_id STRING, "
                + "   first_visit_date DATE, "
                + "   last_visit_date DATE, "
                + "   total_sessions BIGINT, "
                + "   total_events BIGINT, "
                + "   ltv DOUBLE, "
                + "   updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (bucket(16, user_pseudo_id))",
            tableName
        );

        spark.sql(createSQL);
        log.info("Table {} created or already exists", tableName);
    }

    /**
     * Calculate user behavior metrics from event data.
     * This is a helper method for testing.
     *
     * @param eventData Source event data
     * @return Dataset with user behavior metrics
     */
    public Dataset<Row> calculateUserBehavior(final Dataset<Row> eventData) {
        return eventData
            .withColumn("event_date", to_date(col("event_timestamp")))
            .groupBy(
                col("app_id"),
                col("user_id"),
                col("user_pseudo_id")
            )
            .agg(
                min("event_date").alias("first_visit_date"),
                max("event_date").alias("last_visit_date"),
                countDistinct("session_id").alias("total_sessions"),
                count("*").alias("total_events"),
                sum(coalesce(col("event_value"), lit(0.0))).alias("ltv")
            );
    }
}
