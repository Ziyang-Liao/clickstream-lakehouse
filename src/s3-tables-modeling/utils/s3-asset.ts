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

import * as path from 'path';
import { SolutionInfo } from '@aws/clickstream-base-lib';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { uploadBuiltInJarsAndRemoteFiles } from '../../common/s3-asset';

/**
 * Upload the S3 Tables Modeling Spark JAR to S3.
 * The JAR is built from the spark-etl project and contains the S3TablesModelingRunner class.
 */
export function uploadS3TablesModelingJar(
  scope: Construct,
  bucket: IBucket,
  prefix: string,
) {
  const version = SolutionInfo.SOLUTION_VERSION_SHORT;

  const commonLibCommands = [
    'cd /tmp/src/data-pipeline/etl-common/',
    `gradle clean build install -PprojectVersion=${version} -x test -x compileTestJava -x coverageCheck`,
  ];

  // S3 Tables Iceberg runtime dependency - downloaded at build time and uploaded to S3
  // so Spark doesn't need internet access at runtime (critical for VPC-only environments)
  const s3TablesIcebergRuntimeUrl =
    'https://repo1.maven.org/maven2/software/amazon/s3tables/s3-tables-catalog-for-iceberg-runtime/0.1.3/s3-tables-catalog-for-iceberg-runtime-0.1.3.jar';

  const { entryPointJar, files } = uploadBuiltInJarsAndRemoteFiles(
    scope,
    {
      sourcePath: path.resolve(__dirname, '..', '..', '..'), // project root directory
      buildDirectory: path.join('src', 'data-pipeline', 'spark-etl'),
      jarName: 'spark-etl',
      shadowJar: false,
      destinationBucket: bucket,
      destinationKeyPrefix: `${prefix}s3tables-jars`,
      commonLibs: commonLibCommands,
      remoteFiles: [s3TablesIcebergRuntimeUrl],
    },
  );

  // The first (and only) remote file is the Iceberg runtime JAR
  const icebergRuntimeJarPath = files.length > 0 ? files[0] : '';

  return {
    jarPath: entryPointJar,
    icebergRuntimeJarPath,
  };
}
