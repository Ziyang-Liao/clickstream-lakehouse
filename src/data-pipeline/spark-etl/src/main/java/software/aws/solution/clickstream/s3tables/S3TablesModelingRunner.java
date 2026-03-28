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
     */
    public void run() {
        log.info("Starting data modeling jobs for time range: {} to {}",
            config.getStartTimestamp(), config.getEndTimestamp());

        // Ensure namespace exists before running jobs
        ensureNamespaceExists();

        // Run Event Aggregation Job
        log.info("Running EventAggregationJob...");
        new EventAggregationJob(spark, config).run();
        log.info("EventAggregationJob completed");

        // Run User Behavior Job
        log.info("Running UserBehaviorJob...");
        new UserBehaviorJob(spark, config).run();
        log.info("UserBehaviorJob completed");

        // Run Session Analysis Job
        log.info("Running SessionAnalysisJob...");
        new SessionAnalysisJob(spark, config).run();
        log.info("SessionAnalysisJob completed");

        // Run Engagement KPI Job
        log.info("Running EngagementKpiJob...");
        new EngagementKpiJob(spark, config).run();
        log.info("EngagementKpiJob completed");

        // Run Retention Analysis Job
        log.info("Running RetentionAnalysisJob...");
        new RetentionAnalysisJob(spark, config).run();
        log.info("RetentionAnalysisJob completed");

        // Run User Acquisition Job
        log.info("Running UserAcquisitionJob...");
        new UserAcquisitionJob(spark, config).run();
        log.info("UserAcquisitionJob completed");

        // Run Geo User Job
        log.info("Running GeoUserJob...");
        new GeoUserJob(spark, config).run();
        log.info("GeoUserJob completed");

        // Run Active User Job (DAU/WAU/MAU)
        log.info("Running ActiveUserJob...");
        new ActiveUserJob(spark, config).run();
        log.info("ActiveUserJob completed");

        // Run New/Return User Job
        log.info("Running NewReturnUserJob...");
        new NewReturnUserJob(spark, config).run();
        log.info("NewReturnUserJob completed");

        // Run Device Job
        log.info("Running DeviceJob...");
        new DeviceJob(spark, config).run();
        log.info("DeviceJob completed");

        // Run Crash Rate Job
        log.info("Running CrashRateJob...");
        new CrashRateJob(spark, config).run();
        log.info("CrashRateJob completed");

        // Run Page/Screen View Job
        log.info("Running PageScreenViewJob...");
        new PageScreenViewJob(spark, config).run();
        log.info("PageScreenViewJob completed");

        // Run Entrance/Exit Job
        log.info("Running EntranceExitJob...");
        new EntranceExitJob(spark, config).run();
        log.info("EntranceExitJob completed");

        // Run Event Name Job
        log.info("Running EventNameJob...");
        new EventNameJob(spark, config).run();
        log.info("EventNameJob completed");

        // Run Lifecycle Job
        log.info("Running LifecycleJob...");
        new LifecycleJob(spark, config).run();
        log.info("LifecycleJob completed");

        log.info("All data modeling jobs completed successfully");
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
