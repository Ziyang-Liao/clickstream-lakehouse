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
import static org.apache.spark.sql.functions.to_date;

/**
 * Job for creating geo (country/city) user statistics in S3 Tables.
 * Aligned with Redshift clickstream_acquisition_country_new_user.
 */
@Slf4j
public class GeoUserJob extends BaseModelingJob {

    public static final String GEO_USER_TABLE = "geo_user";


    public GeoUserJob(final SparkSession spark, final S3TablesModelingConfig config) {
        super(spark, config);
    }

    public void run() {
        Dataset<Row> eventData = readOdsEventData();

        if (eventData.isEmpty()) {
            log.info("No event data found for the specified time range");
            return;
        }

        createGeoUser(eventData);
    }


    void createGeoUser(final Dataset<Row> eventData) {
        String tableName = config.getFullTableName(GEO_USER_TABLE);
        log.info("Creating geo user in table: {}", tableName);

        // Aligned with Redshift: only count NEW users (with _first_open event)
        Dataset<Row> geoUser = eventData
            .filter(col("event_name").equalTo("_first_open"))
            .withColumn("event_date", to_date(col("event_timestamp")))
            .groupBy("app_id", "event_date", "platform", "geo_country", "geo_city")
            .agg(countDistinct("user_pseudo_id").alias("user_count"))
            .filter(col("user_count").gt(0))
            .withColumn("updated_at", current_timestamp());

        createTableIfNotExists(tableName);
        geoUser.createOrReplaceTempView("geo_user_updates");

        String mergeSQL = String.format(
            "MERGE INTO %s AS target "
                + "USING geo_user_updates AS source "
                + "ON target.app_id = source.app_id "
                + "   AND target.event_date = source.event_date "
                + "   AND coalesce(target.platform, '') = coalesce(source.platform, '') "
                + "   AND coalesce(target.geo_country, '') = coalesce(source.geo_country, '') "
                + "   AND coalesce(target.geo_city, '') = coalesce(source.geo_city, '') "
                + "WHEN MATCHED THEN UPDATE SET * "
                + "WHEN NOT MATCHED THEN INSERT *",
            tableName
        );

        spark.sql(mergeSQL);
        log.info("Geo user updated successfully");
    }

    void createTableIfNotExists(final String tableName) {
        String createSQL = String.format(
            "CREATE TABLE IF NOT EXISTS %s ("
                + "app_id STRING, "
                + "event_date DATE, "
                + "platform STRING, "
                + "geo_country STRING, "
                + "geo_city STRING, "
                + "user_count BIGINT, "
                + "updated_at TIMESTAMP"
                + ") USING iceberg "
                + "PARTITIONED BY (event_date)",
            tableName
        );
        spark.sql(createSQL);
    }
}
