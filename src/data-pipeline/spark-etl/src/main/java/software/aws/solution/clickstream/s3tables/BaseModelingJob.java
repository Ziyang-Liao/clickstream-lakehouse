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
     */
    protected Dataset<Row> readOdsEventData() {
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
     */
    protected Dataset<Row> readOdsUserData() {
        String odsPath = config.getOdsPath("user_v2");
        log.info("Reading ODS user data from: {}", odsPath);
        try {
            return spark.read().parquet(odsPath);
        } catch (Exception e) {
            return handleOdsReadError(odsPath, e);
        }
    }

    /**
     * Read an ODS table filtered by the configured time range.
     */
    protected Dataset<Row> readOdsTable(final String tableName) {
        String odsPath = config.getOdsPath(tableName);
        log.info("Reading ODS {} data from: {}", tableName, odsPath);

        try {
            java.sql.Timestamp startTs = new java.sql.Timestamp(config.getStartTimestamp());
            java.sql.Timestamp endTs = new java.sql.Timestamp(config.getEndTimestamp());

            Dataset<Row> data = spark.read()
                .parquet(odsPath)
                .filter(org.apache.spark.sql.functions.col("event_timestamp").geq(startTs))
                .filter(org.apache.spark.sql.functions.col("event_timestamp").lt(endTs));

            long count = data.count();
            log.info("Read {} rows from ODS {}", count, tableName);
            return data;
        } catch (Exception e) {
            return handleOdsReadError(odsPath, e);
        }
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
