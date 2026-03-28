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

import net.jqwik.api.*;
import net.jqwik.api.constraints.*;
import net.jqwik.api.lifecycle.*;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.core.config.Configurator;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.RowFactory;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructField;
import org.apache.spark.sql.types.StructType;

import java.sql.Date;
import java.util.*;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static software.aws.solution.clickstream.util.ContextUtil.*;

/**
 * Property-based tests for UserBehaviorJob.
 * 
 * Feature: s3-tables-data-modeling, Property 7: 用户行为计算正确性
 * 
 * For any user, user_behavior table's first_visit_date should equal the earliest 
 * event date for that user in ODS data, and last_visit_date should equal the 
 * latest event date.
 * 
 * Validates: Requirements 5.4
 */
public class UserBehaviorJobPropertyTest {

    private static SparkSession spark;

    @BeforeContainer
    static void setupSpark() {
        Configurator.setRootLevel(Level.WARN);
        Configurator.setLevel("software.aws.solution.clickstream", Level.DEBUG);
        
        System.setProperty(JOB_NAME_PROP, "test-job");
        System.setProperty(WAREHOUSE_DIR_PROP, "/tmp/warehouse");
        System.setProperty(DATABASE_PROP, "test_db");
        System.setProperty(USER_KEEP_DAYS_PROP, String.valueOf(365 * 100));
        System.setProperty(ITEM_KEEP_DAYS_PROP, String.valueOf(365 * 100));

        spark = SparkSession.builder()
                .appName("UserBehaviorJob Property Test")
                .master("local[*]")
                .config("spark.driver.bindAddress", "127.0.0.1")
                .config("spark.sql.warehouse.dir", "/tmp/warehouse")
                .config("spark.sql.mapKeyDedupPolicy", "LAST_WIN")
                .config("spark.sql.session.timeZone", "UTC")
                .getOrCreate();
    }

    @AfterContainer
    static void teardownSpark() {
        if (spark != null) {
            spark.stop();
        }
    }

    /**
     * Feature: s3-tables-data-modeling, Property 7: 用户行为计算正确性
     * 
     * For any user, the first_visit_date should equal the earliest event date 
     * and last_visit_date should equal the latest event date.
     * 
     * Validates: Requirements 5.4
     */
    @Property(tries = 100)
    void userFirstAndLastVisitDatesAreCorrect(
            @ForAll @Size(min = 1, max = 10) List<@AlphaChars @StringLength(min = 1, max = 10) String> userIds,
            @ForAll @IntRange(min = 1, max = 20) int eventsPerUser
    ) {
        // Generate test event data with multiple events per user
        List<Row> events = generateTestEventsForUsers(userIds, eventsPerUser);
        
        if (events.isEmpty()) {
            return;
        }
        
        Dataset<Row> eventDataset = createEventDataset(events);
        
        // Create config for the job
        S3TablesModelingConfig config = S3TablesModelingConfig.builder()
                .projectId("test-project")
                .appIds("app1")
                .tableBucketArn("arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket")
                .namespace("test_namespace")
                .odsS3Bucket("test-bucket")
                .odsS3Prefix("ods/")
                .startTimestamp(0L)
                .endTimestamp(System.currentTimeMillis())
                .build();
        
        UserBehaviorJob job = new UserBehaviorJob(spark, config);
        
        // Calculate user behavior
        Dataset<Row> userBehavior = job.calculateUserBehavior(eventDataset);
        
        // Calculate expected first and last visit dates manually (using LocalDate for comparison)
        Map<String, java.time.LocalDate> expectedFirstVisit = new HashMap<>();
        Map<String, java.time.LocalDate> expectedLastVisit = new HashMap<>();
        
        for (Row event : events) {
            String userPseudoId = event.getString(2); // user_pseudo_id
            // Convert timestamp to LocalDate (date only, no time)
            long timestamp = event.getLong(5); // event_timestamp
            java.time.LocalDate eventLocalDate = java.time.Instant.ofEpochMilli(timestamp)
                    .atZone(java.time.ZoneId.of("UTC"))
                    .toLocalDate();
            
            if (!expectedFirstVisit.containsKey(userPseudoId) || 
                eventLocalDate.isBefore(expectedFirstVisit.get(userPseudoId))) {
                expectedFirstVisit.put(userPseudoId, eventLocalDate);
            }
            
            if (!expectedLastVisit.containsKey(userPseudoId) || 
                eventLocalDate.isAfter(expectedLastVisit.get(userPseudoId))) {
                expectedLastVisit.put(userPseudoId, eventLocalDate);
            }
        }
        
        // Verify user behavior
        List<Row> behaviorRows = userBehavior.collectAsList();
        
        for (Row row : behaviorRows) {
            String userPseudoId = row.getString(2); // user_pseudo_id
            Date firstVisitDate = row.getDate(3); // first_visit_date
            Date lastVisitDate = row.getDate(4); // last_visit_date
            
            // Convert SQL Date to LocalDate for comparison
            java.time.LocalDate actualFirstVisit = firstVisitDate.toLocalDate();
            java.time.LocalDate actualLastVisit = lastVisitDate.toLocalDate();
            
            assertThat(actualFirstVisit)
                    .as("First visit date for user %s should match earliest event date", userPseudoId)
                    .isEqualTo(expectedFirstVisit.get(userPseudoId));
            
            assertThat(actualLastVisit)
                    .as("Last visit date for user %s should match latest event date", userPseudoId)
                    .isEqualTo(expectedLastVisit.get(userPseudoId));
        }
    }

    /**
     * Property: Total events count should match the actual number of events per user.
     */
    @Property(tries = 100)
    void totalEventsCountMatchesActualEvents(
            @ForAll @Size(min = 1, max = 5) List<@AlphaChars @StringLength(min = 1, max = 10) String> userIds,
            @ForAll @IntRange(min = 1, max = 10) int eventsPerUser
    ) {
        List<Row> events = generateTestEventsForUsers(userIds, eventsPerUser);
        
        if (events.isEmpty()) {
            return;
        }
        
        Dataset<Row> eventDataset = createEventDataset(events);
        
        S3TablesModelingConfig config = S3TablesModelingConfig.builder()
                .projectId("test-project")
                .appIds("app1")
                .tableBucketArn("arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket")
                .namespace("test_namespace")
                .odsS3Bucket("test-bucket")
                .odsS3Prefix("ods/")
                .startTimestamp(0L)
                .endTimestamp(System.currentTimeMillis())
                .build();
        
        UserBehaviorJob job = new UserBehaviorJob(spark, config);
        Dataset<Row> userBehavior = job.calculateUserBehavior(eventDataset);
        
        // Calculate expected event counts
        Map<String, Long> expectedEventCounts = events.stream()
                .collect(Collectors.groupingBy(
                        row -> row.getString(2), // user_pseudo_id
                        Collectors.counting()
                ));
        
        // Verify event counts
        List<Row> behaviorRows = userBehavior.collectAsList();
        
        for (Row row : behaviorRows) {
            String userPseudoId = row.getString(2);
            long totalEvents = row.getLong(6); // total_events
            
            assertThat(totalEvents)
                    .as("Total events for user %s should match actual count", userPseudoId)
                    .isEqualTo(expectedEventCounts.get(userPseudoId));
        }
    }

    /**
     * Property: Total sessions count should be less than or equal to total events.
     */
    @Property(tries = 100)
    void totalSessionsNeverExceedsTotalEvents(
            @ForAll @Size(min = 1, max = 5) List<@AlphaChars @StringLength(min = 1, max = 10) String> userIds,
            @ForAll @IntRange(min = 1, max = 10) int eventsPerUser
    ) {
        List<Row> events = generateTestEventsForUsers(userIds, eventsPerUser);
        
        if (events.isEmpty()) {
            return;
        }
        
        Dataset<Row> eventDataset = createEventDataset(events);
        
        S3TablesModelingConfig config = S3TablesModelingConfig.builder()
                .projectId("test-project")
                .appIds("app1")
                .tableBucketArn("arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket")
                .namespace("test_namespace")
                .odsS3Bucket("test-bucket")
                .odsS3Prefix("ods/")
                .startTimestamp(0L)
                .endTimestamp(System.currentTimeMillis())
                .build();
        
        UserBehaviorJob job = new UserBehaviorJob(spark, config);
        Dataset<Row> userBehavior = job.calculateUserBehavior(eventDataset);
        
        List<Row> behaviorRows = userBehavior.collectAsList();
        
        for (Row row : behaviorRows) {
            long totalSessions = row.getLong(5); // total_sessions
            long totalEvents = row.getLong(6); // total_events
            
            assertThat(totalSessions)
                    .as("Total sessions should not exceed total events")
                    .isLessThanOrEqualTo(totalEvents);
        }
    }

    /**
     * Generate test event data for multiple users.
     */
    private List<Row> generateTestEventsForUsers(List<String> userIds, int eventsPerUser) {
        List<Row> events = new ArrayList<>();
        Random random = new Random();
        
        long baseTimestamp = System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000; // 30 days ago
        
        int userIndex = 0;
        for (String userId : userIds) {
            String userPseudoId = "user_pseudo_" + userIndex + "_" + userId;
            
            for (int i = 0; i < eventsPerUser; i++) {
                String appId = "app1";
                String sessionId = "session_" + userIndex + "_" + (i / 3); // ~3 events per session
                long eventTimestamp = baseTimestamp + random.nextInt(30 * 24 * 60 * 60) * 1000L;
                Date eventDate = new Date(eventTimestamp);
                String eventName = "event_" + random.nextInt(5);
                double eventValue = random.nextDouble() * 100;
                
                events.add(RowFactory.create(
                        appId,
                        userId,
                        userPseudoId,
                        sessionId,
                        eventDate,
                        eventTimestamp,
                        eventName,
                        eventValue
                ));
            }
            userIndex++;
        }
        
        return events;
    }

    /**
     * Create a Dataset from event rows.
     */
    private Dataset<Row> createEventDataset(List<Row> events) {
        StructType schema = DataTypes.createStructType(new StructField[]{
                DataTypes.createStructField("app_id", DataTypes.StringType, false),
                DataTypes.createStructField("user_id", DataTypes.StringType, true),
                DataTypes.createStructField("user_pseudo_id", DataTypes.StringType, false),
                DataTypes.createStructField("session_id", DataTypes.StringType, false),
                DataTypes.createStructField("event_date", DataTypes.DateType, false),
                DataTypes.createStructField("event_timestamp", DataTypes.LongType, false),
                DataTypes.createStructField("event_name", DataTypes.StringType, false),
                DataTypes.createStructField("event_value_in_usd", DataTypes.DoubleType, true)
        });
        
        return spark.createDataFrame(events, schema);
    }
}
