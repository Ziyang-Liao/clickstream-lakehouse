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

import { SolutionInfo } from '@aws/clickstream-base-lib';
import { Aspects, CfnCondition, CfnOutput, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import { SecurityGroup, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { CfnApplication } from 'aws-cdk-lib/aws-emrserverless';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { RolePermissionBoundaryAspect } from './common/aspects';
import {
  addCfnNagForLogRetention,
  addCfnNagToStack,
  ruleRolePolicyWithWildcardResources,
} from './common/cfn-nag';
import { createLambdaRole } from './common/lambda';
import { Parameters } from './common/parameters';
import { createDLQueue } from './common/sqs';
import { getExistVpc } from './common/vpc-utils';
import { SolutionNodejsFunction } from './private/function';
import { createStackParameters } from './s3-tables-modeling/parameter';
import { uploadS3TablesModelingJar } from './s3-tables-modeling/utils/s3-asset';

// Output constants for S3 Tables Modeling Stack
export const OUTPUT_S3_TABLES_MODELING_EMR_APPLICATION_ID = 'S3TablesModelingEMRApplicationId';
export const OUTPUT_S3_TABLES_MODELING_JOB_SUBMITTER_FUNCTION_ARN = 'S3TablesModelingJobSubmitterFunctionArn';
export const OUTPUT_S3_TABLES_MODELING_EMR_EXECUTION_ROLE_ARN = 'S3TablesModelingEMRExecutionRoleArn';

export interface S3TablesModelingStackProps extends StackProps {
}

export class S3TablesModelingStack extends Stack {
  public readonly emrApplicationId: string;
  public readonly jobSubmitterFunctionArn: string;

  constructor(scope: Construct, id: string, props: S3TablesModelingStackProps = {}) {
    super(scope, id, props);

    const featureName = 'S3TablesModeling';
    this.templateOptions.description = `(${SolutionInfo.SOLUTION_ID}-s3t) ${SolutionInfo.SOLUTION_NAME} - ${featureName} ${SolutionInfo.SOLUTION_VERSION_DETAIL}`;

    const { metadata, params } = createStackParameters(this);
    this.templateOptions.metadata = metadata;

    // Get VPC
    const vpc = getExistVpc(this, 'from-vpc-for-s3-tables-modeling', {
      vpcId: params.vpcIdParam.valueAsString,
      availabilityZones: Fn.getAzs(),
      privateSubnetIds: Fn.split(',', params.privateSubnetIdsParam.valueAsString),
    });

    const subnetSelection: SubnetSelection = {
      subnets: vpc.privateSubnets,
    };

    // Get S3 Buckets
    const odsS3Bucket = Bucket.fromBucketName(
      this,
      'from-odsS3Bucket',
      params.odsS3BucketParam.valueAsString,
    );

    const pipelineS3Bucket = Bucket.fromBucketName(
      this,
      'from-pipelineS3Bucket',
      params.pipelineS3BucketParam.valueAsString,
    );

    // Upload S3 Tables Modeling JAR to pipeline bucket
    const { jarPath, icebergRuntimeJarPath } = uploadS3TablesModelingJar(
      this,
      pipelineS3Bucket,
      params.pipelineS3PrefixParam.valueAsString,
    );

    // Create Security Group for EMR Serverless
    const emrSecurityGroup = new SecurityGroup(this, 'EMRServerlessSecurityGroup', {
      vpc,
      description: 'Security group for EMR Serverless S3 Tables Modeling',
      allowAllOutbound: true,
    });

    // Create EMR Serverless Application
    // Issue 3.3: EMR Application name has max 64 characters limit
    // Use shorter prefix 'cs-s3t-' (7 chars) + projectId to stay within limit
    const emrApp = new CfnApplication(this, 'S3TablesModelingEMRApp', {
      releaseLabel: params.emrReleaseLabelParam.valueAsString,
      type: 'SPARK',
      name: Fn.join('-', ['cs-s3t', params.projectIdParam.valueAsString]),
      networkConfiguration: {
        subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
        securityGroupIds: [emrSecurityGroup.securityGroupId],
      },
      autoStartConfiguration: {
        enabled: true,
      },
      autoStopConfiguration: {
        enabled: true,
        idleTimeoutMinutes: params.emrApplicationIdleTimeoutMinutesParam.valueAsNumber,
      },
    });

    this.emrApplicationId = emrApp.attrApplicationId;

    // Create EMR Execution Role
    const emrExecutionRole = new Role(this, 'EMRExecutionRole', {
      assumedBy: new ServicePrincipal('emr-serverless.amazonaws.com'),
      description: 'Execution role for EMR Serverless S3 Tables Modeling jobs',
    });

    // S3 Tables permissions (minimal required permissions)
    emrExecutionRole.addToPolicy(new PolicyStatement({
      sid: 'S3TablesPermissions',
      effect: Effect.ALLOW,
      actions: [
        's3tables:CreateNamespace',
        's3tables:CreateTable',
        's3tables:GetNamespace',
        's3tables:GetTable',
        's3tables:GetTableBucket',
        's3tables:GetTableMetadataLocation',
        's3tables:ListNamespaces',
        's3tables:ListTableBuckets',
        's3tables:ListTables',
        's3tables:UpdateTableMetadataLocation',
        's3tables:PutTableMaintenanceConfiguration',
        's3tables:GetTableMaintenanceConfiguration',
      ],
      resources: [
        params.s3TableBucketArnParam.valueAsString,
        Fn.join('', [params.s3TableBucketArnParam.valueAsString, '/*']),
      ],
    }));

    // S3 ODS read permissions
    emrExecutionRole.addToPolicy(new PolicyStatement({
      sid: 'S3ODSReadPermissions',
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:ListBucket',
        's3:GetBucketLocation',
      ],
      resources: [
        odsS3Bucket.bucketArn,
        Fn.join('', [odsS3Bucket.bucketArn, '/*']),
      ],
    }));

    // Pipeline S3 bucket permissions for temp files
    emrExecutionRole.addToPolicy(new PolicyStatement({
      sid: 'S3PipelinePermissions',
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetBucketLocation',
      ],
      resources: [
        pipelineS3Bucket.bucketArn,
        Fn.join('', [pipelineS3Bucket.bucketArn, '/*']),
      ],
    }));

    // Create CfnCondition for default namespace (needed for Glue permissions)
    const useDefaultNamespaceCondition = new CfnCondition(this, 'UseDefaultNamespace', {
      expression: Fn.conditionEquals(params.s3TableNamespaceParam.valueAsString, ''),
    });

    // Glue Catalog permissions - restricted to clickstream databases
    // Issue 4.2: Restrict Glue permissions to specific database pattern
    const glueDbPattern = Fn.conditionIf(
      useDefaultNamespaceCondition.logicalId,
      Fn.join('_', ['clickstream', params.projectIdParam.valueAsString]),
      params.s3TableNamespaceParam.valueAsString,
    ).toString();

    emrExecutionRole.addToPolicy(new PolicyStatement({
      sid: 'GlueCatalogPermissions',
      effect: Effect.ALLOW,
      actions: [
        'glue:GetDatabase',
        'glue:GetDatabases',
        'glue:CreateDatabase',
        'glue:UpdateDatabase',
        'glue:GetTable',
        'glue:GetTables',
        'glue:CreateTable',
        'glue:UpdateTable',
        'glue:GetPartition',
        'glue:GetPartitions',
        'glue:CreatePartition',
        'glue:BatchCreatePartition',
        'glue:UpdatePartition',
        'glue:DeletePartition',
        'glue:BatchDeletePartition',
        'glue:GetUserDefinedFunctions',
      ],
      resources: [
        Fn.join('', ['arn:', this.partition, ':glue:', this.region, ':', this.account, ':catalog']),
        Fn.join('', ['arn:', this.partition, ':glue:', this.region, ':', this.account, ':database/', glueDbPattern]),
        Fn.join('', ['arn:', this.partition, ':glue:', this.region, ':', this.account, ':database/', glueDbPattern, '*']),
        Fn.join('', ['arn:', this.partition, ':glue:', this.region, ':', this.account, ':table/', glueDbPattern, '/*']),
        Fn.join('', ['arn:', this.partition, ':glue:', this.region, ':', this.account, ':table/', glueDbPattern, '*/*']),
      ],
    }));

    // CloudWatch Logs permissions for EMR Serverless
    emrExecutionRole.addToPolicy(new PolicyStatement({
      sid: 'CloudWatchLogsPermissions',
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
      ],
      resources: [
        Fn.join('', ['arn:', this.partition, ':logs:', this.region, ':', this.account, ':log-group:/aws/emr-serverless/*']),
      ],
    }));

    // Create Lambda Execution Role
    const lambdaRole = createLambdaRole(this, 'JobSubmitterLambdaRole', true, []);

    // EMR Serverless permissions for Lambda
    lambdaRole.addToPolicy(new PolicyStatement({
      sid: 'EMRServerlessPermissions',
      effect: Effect.ALLOW,
      actions: [
        'emr-serverless:StartJobRun',
        'emr-serverless:GetJobRun',
        'emr-serverless:CancelJobRun',
        'emr-serverless:ListJobRuns',
        'emr-serverless:StartApplication',
        'emr-serverless:GetApplication',
        'emr-serverless:TagResource',
      ],
      resources: [
        Fn.join('', [
          'arn:', this.partition, ':emr-serverless:', this.region, ':', this.account,
          ':/applications/', emrApp.attrApplicationId,
        ]),
        Fn.join('', [
          'arn:', this.partition, ':emr-serverless:', this.region, ':', this.account,
          ':/applications/', emrApp.attrApplicationId, '/jobruns/*',
        ]),
      ],
    }));

    // PassRole permission for EMR execution role
    lambdaRole.addToPolicy(new PolicyStatement({
      sid: 'PassRolePermission',
      effect: Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [emrExecutionRole.roleArn],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'emr-serverless.amazonaws.com',
        },
      },
    }));

    // S3 read permissions for Lambda to check ODS data
    lambdaRole.addToPolicy(new PolicyStatement({
      sid: 'S3ReadPermissions',
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:ListBucket',
        's3:GetBucketLocation',
      ],
      resources: [
        odsS3Bucket.bucketArn,
        Fn.join('', [odsS3Bucket.bucketArn, '/*']),
      ],
    }));

    // S3 read/write permissions for Lambda to manage job info in pipeline bucket
    lambdaRole.addToPolicy(new PolicyStatement({
      sid: 'S3PipelinePermissions',
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
        's3:GetBucketLocation',
      ],
      resources: [
        pipelineS3Bucket.bucketArn,
        Fn.join('', [pipelineS3Bucket.bucketArn, '/*']),
      ],
    }));

    // Create Job Submitter Lambda Function
    // Issue 5: Add explicit timeout for ODS object calculation which may take time
    const jobSubmitterFunction = new SolutionNodejsFunction(this, 'JobSubmitterFunction', {
      entry: './src/s3-tables-modeling/lambda/job-submitter/index.ts',
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.minutes(5),
      reservedConcurrentExecutions: 1,
      logRetention: RetentionDays.ONE_MONTH,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      vpc,
      vpcSubnets: subnetSelection,
      environment: {
        EMR_APPLICATION_ID: emrApp.attrApplicationId,
        EMR_EXECUTION_ROLE_ARN: emrExecutionRole.roleArn,
        S3_TABLE_BUCKET_ARN: params.s3TableBucketArnParam.valueAsString,
        S3_TABLE_NAMESPACE: Fn.conditionIf(
          useDefaultNamespaceCondition.logicalId,
          Fn.join('_', ['clickstream', params.projectIdParam.valueAsString]),
          params.s3TableNamespaceParam.valueAsString,
        ).toString(),
        PROJECT_ID: params.projectIdParam.valueAsString,
        APP_IDS: params.appIdsParam.valueAsString,
        ODS_S3_BUCKET: params.odsS3BucketParam.valueAsString,
        ODS_S3_PREFIX: params.odsS3PrefixParam.valueAsString,
        ODS_FILE_SUFFIX: params.odsFileSuffixParam.valueAsString,
        PIPELINE_S3_BUCKET: params.pipelineS3BucketParam.valueAsString,
        PIPELINE_S3_PREFIX: params.pipelineS3PrefixParam.valueAsString,
        DATA_RETENTION_DAYS: params.dataRetentionDaysParam.valueAsString,
        DATA_BUFFERED_SECONDS: '30',
        SPARK_JAR_PATH: jarPath,
        ICEBERG_RUNTIME_JAR_PATH: icebergRuntimeJarPath,
      },
    });

    this.jobSubmitterFunctionArn = jobSubmitterFunction.functionArn;

    // Create EventBridge Rule for scheduling
    const scheduleRule = new Rule(this, 'ScheduleRule', {
      schedule: Schedule.expression(params.scheduleExpressionParam.valueAsString),
      description: 'Schedule rule for S3 Tables data modeling job',
    });

    scheduleRule.addTarget(new LambdaFunction(jobSubmitterFunction));

    // Create EventBridge Rule for EMR Serverless job state changes
    // Issue 2.2: Add EMR Serverless job status listener
    const jobStateChangeRule = new Rule(this, 'JobStateChangeRule', {
      eventPattern: {
        source: ['aws.emr-serverless'],
        detailType: ['EMR Serverless Job Run State Change'],
        detail: {
          applicationId: [emrApp.attrApplicationId],
          state: ['SUCCESS', 'FAILED', 'CANCELLED'],
        },
      },
      description: 'Rule to capture EMR Serverless job state changes for S3 Tables modeling',
    });

    // Issue 4: Create Dead Letter Queue for EventBridge rule failures
    const jobStateChangeDlq = createDLQueue(this, 'JobStateChangeDLQ');

    // Create Job Status Handler Lambda Function
    const jobStatusHandlerFunction = new SolutionNodejsFunction(this, 'JobStatusHandlerFunction', {
      entry: './src/s3-tables-modeling/lambda/job-status-handler/index.ts',
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(60),
      logRetention: RetentionDays.ONE_MONTH,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      vpc,
      vpcSubnets: subnetSelection,
      environment: {
        EMR_APPLICATION_ID: emrApp.attrApplicationId,
        PIPELINE_S3_BUCKET: params.pipelineS3BucketParam.valueAsString,
        PIPELINE_S3_PREFIX: params.pipelineS3PrefixParam.valueAsString,
        PROJECT_ID: params.projectIdParam.valueAsString,
      },
    });

    // Add Lambda target with DLQ for failed invocations
    jobStateChangeRule.addTarget(new LambdaFunction(jobStatusHandlerFunction, {
      deadLetterQueue: jobStateChangeDlq,
      maxEventAge: Duration.hours(2),
      retryAttempts: 2,
    }));

    // Stack Outputs
    new CfnOutput(this, OUTPUT_S3_TABLES_MODELING_EMR_APPLICATION_ID, {
      value: emrApp.attrApplicationId,
      description: 'EMR Serverless Application ID for S3 Tables Modeling',
    }).overrideLogicalId(OUTPUT_S3_TABLES_MODELING_EMR_APPLICATION_ID);

    new CfnOutput(this, OUTPUT_S3_TABLES_MODELING_JOB_SUBMITTER_FUNCTION_ARN, {
      value: jobSubmitterFunction.functionArn,
      description: 'Job Submitter Lambda Function ARN',
    }).overrideLogicalId(OUTPUT_S3_TABLES_MODELING_JOB_SUBMITTER_FUNCTION_ARN);

    new CfnOutput(this, OUTPUT_S3_TABLES_MODELING_EMR_EXECUTION_ROLE_ARN, {
      value: emrExecutionRole.roleArn,
      description: 'EMR Execution Role ARN',
    }).overrideLogicalId(OUTPUT_S3_TABLES_MODELING_EMR_EXECUTION_ROLE_ARN);

    // Add IAM role permission boundary aspect
    const { iamRoleBoundaryArnParam } = Parameters.createIAMRolePrefixAndBoundaryParameters(this);
    Aspects.of(this).add(new RolePermissionBoundaryAspect(iamRoleBoundaryArnParam.valueAsString));

    // Add CFN Nag suppressions
    addCfnNag(this);
  }
}

function addCfnNag(stack: Stack) {
  addCfnNagForLogRetention(stack);
  addCfnNagToStack(stack, [
    ruleRolePolicyWithWildcardResources('JobSubmitterLambdaRole/DefaultPolicy/Resource', 'Lambda', 'emr-serverless'),
    ruleRolePolicyWithWildcardResources('EMRExecutionRole/DefaultPolicy/Resource', 'EMR', 'glue'),
  ]);

  NagSuppressions.addStackSuppressions(stack, [
    {
      id: 'AwsSolutions-SQS3',
      reason: 'The SQS is a dead-letter queue (DLQ), and does not need a DLQ enabled',
    },
  ]);
}
