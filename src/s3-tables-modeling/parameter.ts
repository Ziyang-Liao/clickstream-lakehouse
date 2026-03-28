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

import {
  PARAMETER_GROUP_LABEL_VPC,
  PARAMETER_LABEL_PRIVATE_SUBNETS,
  PARAMETER_LABEL_VPCID,
  S3_BUCKET_NAME_PATTERN,
  SCHEDULE_EXPRESSION_PATTERN,
} from '@aws/clickstream-base-lib';
import { CfnParameter } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Parameters, SubnetParameterType } from '../common/parameters';

export function createStackParameters(scope: Construct) {
  const netWorkProps = Parameters.createNetworkParameters(scope, false, SubnetParameterType.String);

  const { projectIdParam, appIdsParam } = Parameters.createProjectAndAppsParameters(scope, 'ProjectId', 'AppIds');

  // S3 Table Bucket ARN
  const s3TableBucketArnParam = new CfnParameter(scope, 'S3TableBucketArn', {
    description: 'The ARN of the S3 Table Bucket for storing Iceberg tables',
    type: 'String',
    allowedPattern: '^arn:aws(-cn|-us-gov)?:s3tables:[a-z0-9-]+:[0-9]{12}:bucket/[a-z0-9.-]+$',
    constraintDescription: 'S3 Table Bucket ARN must be a valid ARN format',
  });

  // S3 Table Namespace - regex allows empty (for default) or valid namespace
  // S3 Tables namespace must start with lowercase letter and contain only lowercase letters, numbers, underscores
  // Max length is 127 characters
  const s3TableNamespaceParam = new CfnParameter(scope, 'S3TableNamespace', {
    description: 'The namespace for S3 Tables (default: clickstream_{projectId}). Must start with a lowercase letter.',
    type: 'String',
    default: '',
    allowedPattern: '^[a-z][a-z0-9_]{0,126}$|^$',
    constraintDescription: 'Namespace must be empty (for default) or start with a lowercase letter and contain only lowercase letters, numbers, and underscores (max 127 chars)',
  });

  // Schedule Expression
  const scheduleExpressionParam = new CfnParameter(scope, 'ScheduleExpression', {
    description: 'The schedule expression for data modeling job, e.g: rate(24 hours) or cron(0 2 * * ? *)',
    default: 'cron(0 2 * * ? *)',
    allowedPattern: SCHEDULE_EXPRESSION_PATTERN,
    type: 'String',
  });

  // Data Retention Days
  const dataRetentionDaysParam = new CfnParameter(scope, 'DataRetentionDays', {
    description: 'Number of days to retain data in S3 Tables (1-3650)',
    default: 365,
    minValue: 1,
    maxValue: 3650,
    type: 'Number',
  });

  // ODS S3 Bucket
  const odsS3BucketParam = Parameters.createS3BucketParameter(scope, 'OdsS3Bucket', {
    description: 'ODS S3 bucket name containing processed event data',
    allowedPattern: `^${S3_BUCKET_NAME_PATTERN}$`,
  });

  // ODS S3 Prefix
  const odsS3PrefixParam = Parameters.createS3PrefixParameter(scope, 'OdsS3Prefix', {
    description: 'ODS S3 prefix for processed event data',
    default: 'clickstream/',
  });

  // ODS File Suffix
  const odsFileSuffixParam = new CfnParameter(scope, 'OdsFileSuffix', {
    description: 'File suffix for ODS data files',
    default: '.snappy.parquet',
    type: 'String',
  });

  // Pipeline S3 Bucket
  const pipelineS3BucketParam = Parameters.createS3BucketParameter(scope, 'PipelineS3Bucket', {
    description: 'Pipeline S3 bucket name for temporary files and job artifacts',
    allowedPattern: `^${S3_BUCKET_NAME_PATTERN}$`,
  });

  // Pipeline S3 Prefix
  const pipelineS3PrefixParam = Parameters.createS3PrefixParameter(scope, 'PipelineS3Prefix', {
    description: 'Pipeline S3 prefix for temporary files',
    default: 'pipeline-temp/',
  });

  // EMR Application Idle Timeout
  const emrApplicationIdleTimeoutMinutesParam = new CfnParameter(scope, 'EmrApplicationIdleTimeoutMinutes', {
    description: 'EMR Serverless application idle timeout in minutes',
    default: 15,
    minValue: 1,
    maxValue: 10080,
    type: 'Number',
  });

  // EMR Release Label
  const emrReleaseLabelParam = new CfnParameter(scope, 'EmrReleaseLabel', {
    description: 'EMR Serverless release label (e.g., emr-7.5.0). Must support Spark and Iceberg.',
    default: 'emr-7.5.0',
    allowedPattern: '^emr-[0-9]+\\.[0-9]+\\.[0-9]+$',
    constraintDescription: 'EMR release label must be in format emr-X.Y.Z',
    type: 'String',
  });

  const metadata = {
    'AWS::CloudFormation::Interface': {
      ParameterGroups: [
        {
          Label: { default: PARAMETER_GROUP_LABEL_VPC },
          Parameters: [
            netWorkProps.vpcId.logicalId,
            netWorkProps.privateSubnets.logicalId,
          ],
        },
        {
          Label: { default: 'Project Configuration' },
          Parameters: [
            projectIdParam.logicalId,
            appIdsParam.logicalId,
          ],
        },
        {
          Label: { default: 'S3 Tables Configuration' },
          Parameters: [
            s3TableBucketArnParam.logicalId,
            s3TableNamespaceParam.logicalId,
          ],
        },
        {
          Label: { default: 'Job Schedule' },
          Parameters: [
            scheduleExpressionParam.logicalId,
            dataRetentionDaysParam.logicalId,
          ],
        },
        {
          Label: { default: 'ODS Data Source' },
          Parameters: [
            odsS3BucketParam.logicalId,
            odsS3PrefixParam.logicalId,
            odsFileSuffixParam.logicalId,
          ],
        },
        {
          Label: { default: 'Pipeline Configuration' },
          Parameters: [
            pipelineS3BucketParam.logicalId,
            pipelineS3PrefixParam.logicalId,
          ],
        },
        {
          Label: { default: 'EMR Serverless Configuration' },
          Parameters: [
            emrApplicationIdleTimeoutMinutesParam.logicalId,
            emrReleaseLabelParam.logicalId,
          ],
        },
      ],
      ParameterLabels: {
        [netWorkProps.vpcId.logicalId]: {
          default: PARAMETER_LABEL_VPCID,
        },
        [netWorkProps.privateSubnets.logicalId]: {
          default: PARAMETER_LABEL_PRIVATE_SUBNETS,
        },
        [projectIdParam.logicalId]: {
          default: 'Project ID',
        },
        [appIdsParam.logicalId]: {
          default: 'App IDs',
        },
        [s3TableBucketArnParam.logicalId]: {
          default: 'S3 Table Bucket ARN',
        },
        [s3TableNamespaceParam.logicalId]: {
          default: 'S3 Table Namespace',
        },
        [scheduleExpressionParam.logicalId]: {
          default: 'Schedule Expression',
        },
        [dataRetentionDaysParam.logicalId]: {
          default: 'Data Retention Days',
        },
        [odsS3BucketParam.logicalId]: {
          default: 'ODS S3 Bucket',
        },
        [odsS3PrefixParam.logicalId]: {
          default: 'ODS S3 Prefix',
        },
        [odsFileSuffixParam.logicalId]: {
          default: 'ODS File Suffix',
        },
        [pipelineS3BucketParam.logicalId]: {
          default: 'Pipeline S3 Bucket',
        },
        [pipelineS3PrefixParam.logicalId]: {
          default: 'Pipeline S3 Prefix',
        },
        [emrApplicationIdleTimeoutMinutesParam.logicalId]: {
          default: 'EMR Application Idle Timeout (minutes)',
        },
        [emrReleaseLabelParam.logicalId]: {
          default: 'EMR Release Label',
        },
      },
    },
  };

  return {
    metadata,
    params: {
      vpcIdParam: netWorkProps.vpcId,
      privateSubnetIdsParam: netWorkProps.privateSubnets,
      projectIdParam,
      appIdsParam,
      s3TableBucketArnParam,
      s3TableNamespaceParam,
      scheduleExpressionParam,
      dataRetentionDaysParam,
      odsS3BucketParam,
      odsS3PrefixParam,
      odsFileSuffixParam,
      pipelineS3BucketParam,
      pipelineS3PrefixParam,
      emrApplicationIdleTimeoutMinutesParam,
      emrReleaseLabelParam,
    },
  };
}
