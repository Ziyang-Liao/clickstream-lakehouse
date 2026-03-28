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
 * Base class for S3 Tables modeling jobs.
 * Provides common ODS data reading and Iceberg table utilities.
 */
@Slf4j
public abstract class BaseModelingJob {

    protected final SparkSession spark;
    protected final S3TablesModelingConfig config;

    protected BaseModelingJob(final SparkSession spark, final S3TablesModelingConfig config) {
        this.spark = spark;
        this.config = config;
    }

    /**
     * Run the modeling job.
     */
    public abstract void run();

    /**
     * Read ODS event_v2 data filtered by the configured time range.
     * If data was pre-cached by the Runner (as temp view "cached_ods_event_v2"),
     * reads from cache instead of S3.
     */
    protected Dataset<Row> readOdsEventData() {
        if (hasCachedView("cached_ods_event_v2")) {
            log.info("Using cached ODS event_v2 data");
            return spark.table("cached_ods_event_v2");
        }
        return readOdsTable("event_v2");
    }

    /**
     * Read ODS session data filtered by the configured time range.
     */
    protected Dataset<Row> readOdsSessionData() {
        return readOdsTable("session");
    }

    /**
     * Read ODS user_v2 data (no time filter — full snapshot).
     * If data was pre-cached by the Runner (as temp view "cached_ods_user_v2"),
     * reads from cache instead of S3.
     */
    protected Dataset<Row> readOdsUserData() {
        if (hasCachedView("cached_ods_user_v2")) {
            log.info("Using cached ODS user_v2 data");
            return spark.table("cached_ods_user_v2");
        }
        String odsPath = config.getOdsPath("user_v2");
        log.info("Reading ODS user data from: {}", odsPath);
        try {
            return spark.read().parquet(odsPath);
        } catch (Exception e) {
            return handleOdsReadError(odsPath, e);
        }
    }

    private boolean hasCachedView(String viewName) {
        try {
            return spark.catalog().tableExists(viewName);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Read an ODS table filtered by the configured time range.
     * Uses partition pruning on year=/month=/day= structure to avoid full table scan.
     */
    protected Dataset<Row> readOdsTable(final String tableName) {
        String odsPath = config.getOdsPath(tableName);
        log.info("Reading ODS {} data from: {}", tableName, odsPath);

        try {
            java.sql.Timestamp startTs = new java.sql.Timestamp(config.getStartTimestamp());
            java.sql.Timestamp endTs = new java.sql.Timestamp(config.getEndTimestamp());

            // Build partition-pruned paths to avoid scanning all historical data
            String[] partitionPaths = getPartitionPaths(odsPath, config.getStartTimestamp(), config.getEndTimestamp());

            Dataset<Row> data;
            if (partitionPaths.length > 0) {
                data = spark.read().parquet(partitionPaths)
                    .filter(org.apache.spark.sql.functions.col("event_timestamp").geq(startTs))
                    .filter(org.apache.spark.sql.functions.col("event_timestamp").lt(endTs));
            } else {
                // Fallback: read entire path if partition paths can't be determined
                data = spark.read().parquet(odsPath)
                    .filter(org.apache.spark.sql.functions.col("event_timestamp").geq(startTs))
                    .filter(org.apache.spark.sql.functions.col("event_timestamp").lt(endTs));
            }

            long count = data.count();
            log.info("Read {} rows from ODS {}", count, tableName);
            return data;
        } catch (Exception e) {
            return handleOdsReadError(odsPath, e);
        }
    }

    /**
     * Generate partition paths for the given time range.
     * ODS data is partitioned as: {basePath}/year=YYYY/month=MM/day=DD/
     */
    private String[] getPartitionPaths(String basePath, long startTimestamp, long endTimestamp) {
        if (!basePath.endsWith("/")) {
            basePath = basePath + "/";
        }
        java.util.List<String> paths = new java.util.ArrayList<>();
        long oneDay = 24L * 60 * 60 * 1000;
        long current = startTimestamp;

        while (current <= endTimestamp) {
            java.time.LocalDate date = java.time.Instant.ofEpochMilli(current)
                .atZone(java.time.ZoneOffset.UTC).toLocalDate();
            String path = String.format("%syear=%04d/month=%02d/day=%02d/",
                basePath, date.getYear(), date.getMonthValue(), date.getDayOfMonth());
            if (!paths.contains(path)) {
                paths.add(path);
            }
            current += oneDay;
        }
        // Ensure end date is included
        java.time.LocalDate endDate = java.time.Instant.ofEpochMilli(endTimestamp)
            .atZone(java.time.ZoneOffset.UTC).toLocalDate();
        String endPath = String.format("%syear=%04d/month=%02d/day=%02d/",
            basePath, endDate.getYear(), endDate.getMonthValue(), endDate.getDayOfMonth());
        if (!paths.contains(endPath)) {
            paths.add(endPath);
        }

        log.info("Partition pruning: {} paths for time range [{} - {}]", paths.size(), startTimestamp, endTimestamp);
        return paths.toArray(new String[0]);
    }

    /**
     * Execute an Iceberg MERGE INTO statement.
     */
    protected void executeMerge(final Dataset<Row> sourceData, final String tempViewName,
                                final String targetTable, final String mergeSQL) {
        sourceData.createOrReplaceTempView(tempViewName);
        spark.sql(mergeSQL);
        log.info("MERGE INTO {} completed", targetTable);
    }

    /**
     * Create an Iceberg table if it doesn't exist.
     */
    protected void createTableIfNotExists(final String createSQL) {
        spark.sql(createSQL);
    }

    private Dataset<Row> handleOdsReadError(final String odsPath, final Exception e) {
        String message = e.getMessage();
        if (message != null
                && (message.contains("Path does not exist")
                || message.contains("Unable to infer schema"))) {
            log.warn("No ODS data found at path: {}. Error: {}", odsPath, message);
            return spark.emptyDataFrame();
        }
        log.error("Failed to read ODS data from: {}", odsPath, e);
        throw new RuntimeException("Failed to read ODS data: " + message, e);
    }
}
