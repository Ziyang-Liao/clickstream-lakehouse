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

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;

/**
 * Configuration for S3 Tables data modeling jobs.
 */
@Getter
@Builder
@AllArgsConstructor
public class S3TablesModelingConfig {

    @NotEmpty
    private final String projectId;

    @NotEmpty
    private final String appIds;

    @NotEmpty
    private final String tableBucketArn;

    @NotEmpty
    private final String namespace;

    @NotEmpty
    private final String odsS3Bucket;

    @NotEmpty
    private final String odsS3Prefix;

    @NotNull
    private final Long startTimestamp;

    @NotNull
    private final Long endTimestamp;

    @NotNull
    @Builder.Default
    private final Integer dataRetentionDays = 365;

    /**
     * Parse configuration from command line arguments.
     *
     * @param args Command line arguments
     * @return S3TablesModelingConfig instance
     */
    public static S3TablesModelingConfig fromArgs(final String[] args) {
        if (args.length < 8) {
            throw new IllegalArgumentException(
                "Usage: S3TablesModelingRunner <projectId> <appIds> <tableBucketArn> <namespace> "
                    + "<odsS3Bucket> <odsS3Prefix> <startTimestamp> <endTimestamp> [dataRetentionDays]"
            );
        }

        S3TablesModelingConfigBuilder builder = S3TablesModelingConfig.builder()
            .projectId(args[0])
            .appIds(args[1])
            .tableBucketArn(args[2])
            .namespace(args[3])
            .odsS3Bucket(args[4])
            .odsS3Prefix(args[5])
            .startTimestamp(Long.parseLong(args[6]))
            .endTimestamp(Long.parseLong(args[7]));

        if (args.length > 8) {
            builder.dataRetentionDays(Integer.parseInt(args[8]));
        }

        return builder.build();
    }

    /**
     * Get the S3 Tables catalog name for Spark SQL.
     *
     * @return Catalog name
     */
    public String getCatalogName() {
        return "s3tablesbucket";
    }

    /**
     * Get the full table name with catalog and namespace.
     *
     * @param tableName The table name
     * @return Full qualified table name
     */
    public String getFullTableName(final String tableName) {
        return String.format("%s.%s.%s", getCatalogName(), namespace, tableName);
    }

    /**
     * Get the ODS S3 path for reading data.
     *
     * @param tableName The ODS table name
     * @return S3 path
     */
    public String getOdsPath(final String tableName) {
        String prefix = odsS3Prefix.endsWith("/") ? odsS3Prefix : odsS3Prefix + "/";
        return String.format("s3://%s/%s%s/", odsS3Bucket, prefix, tableName);
    }
}
