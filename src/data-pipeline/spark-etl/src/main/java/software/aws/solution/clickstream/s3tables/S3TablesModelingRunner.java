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

/**
 * Main entry class for S3 Tables data modeling jobs.
 *
 * This runner coordinates the execution of various data modeling jobs:
 * - EventAggregationJob: Creates event_daily_summary and event_hourly_summary tables
 * - UserBehaviorJob: Creates user_behavior table
 * - SessionAnalysisJob: Creates session_analysis table
 * - RetentionAnalysisJob: Creates retention_daily and retention_weekly tables
 *
 * Requirements: 5.2
 */
@Slf4j
public class S3TablesModelingRunner {

    private final SparkSession spark;
    private final S3TablesModelingConfig config;

    /**
     * Constructor for S3TablesModelingRunner.
     *
     * @param spark SparkSession instance
     * @param config Configuration for the modeling jobs
     */
    public S3TablesModelingRunner(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    /**
     * Main entry point for the S3 Tables modeling job.
     *
     * @param args Command line arguments
     */
    public static void main(final String[] args) {
        log.info("Starting S3 Tables Modeling Runner");

        S3TablesModelingConfig config = S3TablesModelingConfig.fromArgs(args);
        log.info("Configuration loaded: projectId={}, namespace={}, tableBucketArn={}",
            config.getProjectId(), config.getNamespace(), config.getTableBucketArn());

        SparkSession spark = createSparkSession(config);

        try {
            S3TablesModelingRunner runner = new S3TablesModelingRunner(spark, config);
            runner.run();
            log.info("S3 Tables Modeling completed successfully");
        } catch (Exception e) {
            log.error("S3 Tables Modeling failed", e);
            throw new RuntimeException("S3 Tables Modeling failed", e);
        } finally {
            spark.stop();
        }
    }

    /**
     * Create and configure SparkSession with Iceberg support for S3 Tables.
     *
     * @param config Configuration containing S3 Tables settings
     * @return Configured SparkSession
     */
    public static SparkSession createSparkSession(final S3TablesModelingConfig config) {
        String catalogName = config.getCatalogName();

        return SparkSession.builder()
            .appName("S3TablesModeling-" + config.getProjectId())
            // Iceberg extensions for MERGE INTO support
            .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
            // S3 Tables catalog configuration
            .config("spark.sql.catalog." + catalogName, "org.apache.iceberg.spark.SparkCatalog")
            .config("spark.sql.catalog." + catalogName + ".catalog-impl",
                "software.amazon.s3tables.iceberg.S3TablesCatalog")
            .config("spark.sql.catalog." + catalogName + ".warehouse", config.getTableBucketArn())
            // Session timezone
            .config("spark.sql.session.timeZone", "UTC")
            .getOrCreate();
    }

    /**
     * Run all data modeling jobs in sequence.
     * ODS data is read once and cached to avoid redundant S3 reads across 15 jobs.
     */
    public void run() {
        log.info("Starting data modeling jobs for time range: {} to {}",
            config.getStartTimestamp(), config.getEndTimestamp());

        // Ensure namespace exists before running jobs
        ensureNamespaceExists();

        // Pre-read and cache ODS data — shared across all jobs
        log.info("Pre-reading ODS data...");
        BaseModelingJob loader = new EventAggregationJob(spark, config);
        Dataset<Row> cachedEventData = loader.readOdsEventData().cache();
        long eventCount = cachedEventData.count();
        log.info("Cached {} event rows", eventCount);

        Dataset<Row> cachedUserData = loader.readOdsUserData().cache();
        long userCount = cachedUserData.count();
        log.info("Cached {} user rows", userCount);

        // Register as temp views so all jobs can access without re-reading
        cachedEventData.createOrReplaceTempView("cached_ods_event_v2");
        cachedUserData.createOrReplaceTempView("cached_ods_user_v2");

        try {
            runAllJobs();
            expireOldData();
        } finally {
            cachedEventData.unpersist();
            cachedUserData.unpersist();
            log.info("Unpersisted cached ODS data");
        }
    }

    private void runAllJobs() {
        java.util.List<String> failedJobs = new java.util.ArrayList<>();

        BaseModelingJob[] jobs = {
            new EventAggregationJob(spark, config),
            new UserBehaviorJob(spark, config),
            new SessionAnalysisJob(spark, config),
            new EngagementKpiJob(spark, config),
            new RetentionAnalysisJob(spark, config),
            new UserAcquisitionJob(spark, config),
            new GeoUserJob(spark, config),
            new ActiveUserJob(spark, config),
            new NewReturnUserJob(spark, config),
            new DeviceJob(spark, config),
            new CrashRateJob(spark, config),
            new PageScreenViewJob(spark, config),
            new EntranceExitJob(spark, config),
            new EventNameJob(spark, config),
            new LifecycleJob(spark, config),
        };

        for (BaseModelingJob job : jobs) {
            String jobName = job.getClass().getSimpleName();
            try {
                log.info("Running {}...", jobName);
                job.run();
                log.info("{} completed", jobName);
            } catch (Exception e) {
                log.error("{} failed: {}", jobName, e.getMessage(), e);
                failedJobs.add(jobName);
            }
        }

        if (failedJobs.isEmpty()) {
            log.info("All {} data modeling jobs completed successfully", jobs.length);
        } else {
            String msg = String.format("%d/%d jobs failed: %s", failedJobs.size(), jobs.length, failedJobs);
            log.error(msg);
            throw new RuntimeException(msg);
        }
    }

    /**
     * Get the SparkSession instance.
     *
     * @return SparkSession
     */
    public SparkSession getSpark() {
        return spark;
    }

    /**
     * Get the configuration.
     *
     * @return S3TablesModelingConfig
     */
    public S3TablesModelingConfig getConfig() {
        return config;
    }

    /**
     * Expire old data from Iceberg tables based on dataRetentionDays config.
     * Deletes rows with event_date older than the retention period and
     * expires old Iceberg snapshots to reclaim storage.
     */
    private void expireOldData() {
        int retentionDays = config.getDataRetentionDays();
        if (retentionDays <= 0) {
            log.info("Data retention disabled (days={}), skipping", retentionDays);
            return;
        }

        log.info("Expiring data older than {} days", retentionDays);
        String catalogName = config.getCatalogName();
        String namespace = config.getNamespace();

        // Tables with event_date column for row-level deletion
        String[] dateTables = {
            "event_daily_summary", "event_hourly_summary", "session_analysis",
            "engagement_kpi", "geo_user_summary", "active_user_dau",
            "active_user_wau", "active_user_mau", "new_return_user",
            "device_user", "crash_rate", "page_screen_view",
            "entrance_page", "exit_page", "event_name_user",
        };

        for (String table : dateTables) {
            try {
                String fullTable = String.format("%s.%s.%s", catalogName, namespace, table);
                String deleteSQL = String.format(
                    "DELETE FROM %s WHERE event_date < date_sub(current_date(), %d)",
                    fullTable, retentionDays);
                spark.sql(deleteSQL);
                log.info("Expired old data from {}", table);
            } catch (Exception e) {
                log.warn("Failed to expire data from {}: {}", table, e.getMessage());
            }
        }

        // Expire old Iceberg snapshots (keep last 24 hours of snapshots)
        String[] allTables = java.util.stream.Stream.concat(
            java.util.Arrays.stream(dateTables),
            java.util.stream.Stream.of("user_behavior", "retention_daily", "retention_weekly",
                "user_acquisition", "lifecycle_weekly")
        ).toArray(String[]::new);

        for (String table : allTables) {
            try {
                String fullTable = String.format("%s.%s.%s", catalogName, namespace, table);
                String expireSQL = String.format(
                    "CALL %s.system.expire_snapshots('%s.%s', TIMESTAMP '%s')",
                    catalogName, namespace, table,
                    java.time.Instant.now().minus(java.time.Duration.ofHours(24))
                        .toString().replace("T", " ").replace("Z", ""));
                spark.sql(expireSQL);
                log.info("Expired old snapshots from {}", table);
            } catch (Exception e) {
                log.warn("Failed to expire snapshots from {}: {}", table, e.getMessage());
            }
        }
    }

    /**
     * Ensure the namespace exists in S3 Tables catalog.
     * Creates the namespace if it doesn't exist.
     */
    private void ensureNamespaceExists() {
        String catalogName = config.getCatalogName();
        String namespace = config.getNamespace();

        log.info("Ensuring namespace exists: {}.{}", catalogName, namespace);

        try {
            // Try to create namespace - will succeed if it doesn't exist
            // or fail silently if it already exists
            String createNamespaceSQL = String.format(
                "CREATE NAMESPACE IF NOT EXISTS %s.%s",
                catalogName, namespace
            );
            spark.sql(createNamespaceSQL);
            log.info("Namespace {}.{} is ready", catalogName, namespace);
        } catch (Exception e) {
            // Log warning but continue - namespace might already exist
            // or the catalog might not support CREATE NAMESPACE
            log.warn("Could not create namespace {}.{}: {}. Continuing anyway.",
                catalogName, namespace, e.getMessage());
        }
    }
}
