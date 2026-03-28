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

import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import {
  OUTPUT_S3_TABLES_MODELING_EMR_APPLICATION_ID,
  OUTPUT_S3_TABLES_MODELING_EMR_EXECUTION_ROLE_ARN,
  OUTPUT_S3_TABLES_MODELING_JOB_SUBMITTER_FUNCTION_ARN,
  S3TablesModelingStack,
} from '../../src/s3-tables-modeling-stack';
import { findFirstResourceByKeyPrefix, getParameter } from '../utils';

// Suppress unused import warning - kept for potential future use
void findFirstResourceByKeyPrefix;

const app = new App();
const stack = new S3TablesModelingStack(app, 'test-s3-tables-modeling-stack');
const template = Template.fromStack(stack);

describe('S3TablesModelingStack parameter tests', () => {
  test('Should have Parameter VpcId', () => {
    template.hasParameter('VpcId', {
      Type: 'AWS::EC2::VPC::Id',
    });
  });

  test('Should have Parameter PrivateSubnetIds', () => {
    template.hasParameter('PrivateSubnetIds', {
      Type: 'String',
    });
  });

  test('Should have Parameter ProjectId', () => {
    template.hasParameter('ProjectId', {
      Type: 'String',
    });
  });

  test('Should have Parameter AppIds', () => {
    template.hasParameter('AppIds', {
      Type: 'String',
    });
  });

  test('Should have Parameter S3TableBucketArn', () => {
    template.hasParameter('S3TableBucketArn', {
      Type: 'String',
    });
  });

  test('Should check S3TableBucketArn pattern', () => {
    const param = getParameter(template, 'S3TableBucketArn');
    const pattern = param.AllowedPattern;
    const regex = new RegExp(`${pattern}`);

    const validValues = [
      'arn:aws:s3tables:us-east-1:123456789012:bucket/my-bucket',
      'arn:aws-cn:s3tables:cn-north-1:123456789012:bucket/my-bucket',
      'arn:aws-us-gov:s3tables:us-gov-west-1:123456789012:bucket/test-bucket',
    ];

    for (const v of validValues) {
      expect(v).toMatch(regex);
    }

    const invalidValues = [
      'arn:aws:s3:us-east-1:123456789012:bucket/my-bucket',
      's3://my-bucket',
      'invalid-arn',
    ];

    for (const v of invalidValues) {
      expect(v).not.toMatch(regex);
    }
  });

  test('Should have Parameter S3TableNamespace', () => {
    template.hasParameter('S3TableNamespace', {
      Type: 'String',
      Default: '',
    });
  });

  test('Should have Parameter ScheduleExpression', () => {
    template.hasParameter('ScheduleExpression', {
      Type: 'String',
      Default: 'cron(0 2 * * ? *)',
    });
  });

  test('Should check ScheduleExpression pattern', () => {
    const param = getParameter(template, 'ScheduleExpression');
    const pattern = param.AllowedPattern;
    const regex = new RegExp(`${pattern}`);

    const validValues = [
      'rate(1 hour)',
      'rate(24 hours)',
      'cron(0 2 * * ? *)',
      'cron(0 1 * * ? *)',
    ];

    for (const v of validValues) {
      expect(v).toMatch(regex);
    }

    const invalidValues = [
      'invalid',
      '24 hours',
    ];

    for (const v of invalidValues) {
      expect(v).not.toMatch(regex);
    }
  });

  test('Should have Parameter DataRetentionDays', () => {
    template.hasParameter('DataRetentionDays', {
      Type: 'Number',
      Default: 365,
      MinValue: 1,
      MaxValue: 3650,
    });
  });

  test('Should have Parameter OdsS3Bucket', () => {
    template.hasParameter('OdsS3Bucket', {
      Type: 'String',
    });
  });

  test('Should have Parameter OdsS3Prefix', () => {
    template.hasParameter('OdsS3Prefix', {
      Type: 'String',
      Default: 'clickstream/',
    });
  });

  test('Should have Parameter PipelineS3Bucket', () => {
    template.hasParameter('PipelineS3Bucket', {
      Type: 'String',
    });
  });

  test('Should have Parameter PipelineS3Prefix', () => {
    template.hasParameter('PipelineS3Prefix', {
      Type: 'String',
      Default: 'pipeline-temp/',
    });
  });

  test('Should have Parameter EmrApplicationIdleTimeoutMinutes', () => {
    template.hasParameter('EmrApplicationIdleTimeoutMinutes', {
      Type: 'Number',
      Default: 15,
      MinValue: 1,
      MaxValue: 10080,
    });
  });

  test('Should have ParameterGroups and ParameterLabels', () => {
    const cfnInterface = template.toJSON().Metadata['AWS::CloudFormation::Interface'];
    expect(cfnInterface.ParameterGroups).toBeDefined();
    expect(cfnInterface.ParameterLabels).toBeDefined();
  });
});

describe('S3TablesModelingStack EMR Serverless Application tests', () => {
  test('Should create EMR Serverless Application', () => {
    template.resourceCountIs('AWS::EMRServerless::Application', 1);
  });

  test('EMR Serverless Application should have correct configuration', () => {
    template.hasResourceProperties('AWS::EMRServerless::Application', {
      ReleaseLabel: {
        Ref: 'EmrReleaseLabel',
      },
      Type: 'SPARK',
      AutoStartConfiguration: {
        Enabled: true,
      },
      AutoStopConfiguration: {
        Enabled: true,
        IdleTimeoutMinutes: {
          Ref: 'EmrApplicationIdleTimeoutMinutes',
        },
      },
      NetworkConfiguration: {
        SubnetIds: Match.anyValue(),
        SecurityGroupIds: Match.anyValue(),
      },
    });
  });
});

describe('S3TablesModelingStack IAM Role tests', () => {
  test('Should create EMR Execution Role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'emr-serverless.amazonaws.com',
            },
          }),
        ]),
      },
    });
  });

  test('EMR Execution Role should have S3 Tables permissions', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'S3TablesPermissions',
            Effect: 'Allow',
            Action: Match.arrayWith([
              's3tables:CreateNamespace',
              's3tables:CreateTable',
              's3tables:GetTable',
              's3tables:ListTables',
              's3tables:UpdateTableMetadataLocation',
            ]),
          }),
        ]),
      },
    });
  });

  test('EMR Execution Role should have S3 ODS read permissions', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'S3ODSReadPermissions',
            Effect: 'Allow',
            Action: Match.arrayWith([
              's3:GetObject',
              's3:ListBucket',
            ]),
          }),
        ]),
      },
    });
  });

  test('EMR Execution Role should have Glue Catalog permissions', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'GlueCatalogPermissions',
            Effect: 'Allow',
            Action: Match.arrayWith([
              'glue:GetDatabase',
              'glue:CreateDatabase',
              'glue:GetTable',
              'glue:CreateTable',
              'glue:UpdateTable',
            ]),
          }),
        ]),
      },
    });
  });

  test('Lambda Role should have EMR Serverless permissions', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'EMRServerlessPermissions',
            Effect: 'Allow',
            Action: Match.arrayWith([
              'emr-serverless:StartJobRun',
              'emr-serverless:GetJobRun',
              'emr-serverless:StartApplication',
              'emr-serverless:GetApplication',
            ]),
          }),
        ]),
      },
    });
  });

  test('Lambda Role should have PassRole permission for EMR execution role', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'PassRolePermission',
            Effect: 'Allow',
            Action: 'iam:PassRole',
            Condition: {
              StringEquals: {
                'iam:PassedToService': 'emr-serverless.amazonaws.com',
              },
            },
          }),
        ]),
      },
    });
  });
});

describe('S3TablesModelingStack Lambda Function tests', () => {
  test('Should create Lambda Functions (Job Submitter and Job Status Handler)', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
  });

  test('Lambda Function should have correct configuration', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: Match.stringLikeRegexp('nodejs'),
      MemorySize: 256,
      TracingConfig: {
        Mode: 'Active',
      },
      VpcConfig: {
        SubnetIds: Match.anyValue(),
        SecurityGroupIds: Match.anyValue(),
      },
      Environment: {
        Variables: {
          EMR_APPLICATION_ID: Match.anyValue(),
          EMR_EXECUTION_ROLE_ARN: Match.anyValue(),
          S3_TABLE_BUCKET_ARN: {
            Ref: 'S3TableBucketArn',
          },
          PROJECT_ID: {
            Ref: 'ProjectId',
          },
          APP_IDS: {
            Ref: 'AppIds',
          },
          ODS_S3_BUCKET: {
            Ref: 'OdsS3Bucket',
          },
          ODS_S3_PREFIX: {
            Ref: 'OdsS3Prefix',
          },
          PIPELINE_S3_BUCKET: {
            Ref: 'PipelineS3Bucket',
          },
          PIPELINE_S3_PREFIX: {
            Ref: 'PipelineS3Prefix',
          },
          DATA_RETENTION_DAYS: {
            Ref: 'DataRetentionDays',
          },
        },
      },
    });
  });
});

describe('S3TablesModelingStack EventBridge Rule tests', () => {
  test('Should create EventBridge Rules (Schedule and Job State Change)', () => {
    // One for schedule, one for job state change monitoring
    template.resourceCountIs('AWS::Events::Rule', 2);
  });

  test('EventBridge Schedule Rule should have correct configuration', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: {
        Ref: 'ScheduleExpression',
      },
      State: 'ENABLED',
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.anyValue(),
        }),
      ]),
    });
  });

  test('EventBridge Job State Change Rule should have correct configuration', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: Match.objectLike({
        'source': ['aws.emr-serverless'],
        'detail-type': ['EMR Serverless Job Run State Change'],
      }),
      State: 'ENABLED',
    });
  });
});

describe('S3TablesModelingStack DLQ tests', () => {
  test('Should create SQS Dead Letter Queue for job state change events', () => {
    template.resourceCountIs('AWS::SQS::Queue', 1);
  });

  test('DLQ should have correct retention period', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      MessageRetentionPeriod: 1209600, // 14 days in seconds
    });
  });

  test('EventBridge target should have DLQ configured', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: Match.objectLike({
        source: ['aws.emr-serverless'],
      }),
      Targets: Match.arrayWith([
        Match.objectLike({
          DeadLetterConfig: {
            Arn: Match.anyValue(),
          },
          RetryPolicy: {
            MaximumEventAgeInSeconds: 7200, // 2 hours
            MaximumRetryAttempts: 2,
          },
        }),
      ]),
    });
  });
});

describe('S3TablesModelingStack Security Group tests', () => {
  test('Should create Security Groups (EMR and Lambda)', () => {
    // One for EMR Serverless, Lambda functions share security groups via VPC configuration
    // The actual count depends on CDK's VPC subnet selection behavior
    const resources = template.toJSON().Resources;
    const securityGroups = Object.keys(resources).filter(
      key => resources[key].Type === 'AWS::EC2::SecurityGroup',
    );
    expect(securityGroups.length).toBeGreaterThanOrEqual(1);
  });

  test('Security Group should allow all outbound traffic', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: Match.arrayWith([
        Match.objectLike({
          CidrIp: '0.0.0.0/0',
          IpProtocol: '-1',
        }),
      ]),
    });
  });
});

describe('S3TablesModelingStack Output tests', () => {
  test('Should have EMR Application ID output', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs[OUTPUT_S3_TABLES_MODELING_EMR_APPLICATION_ID]).toBeDefined();
  });

  test('Should have Job Submitter Function ARN output', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs[OUTPUT_S3_TABLES_MODELING_JOB_SUBMITTER_FUNCTION_ARN]).toBeDefined();
  });

  test('Should have EMR Execution Role ARN output', () => {
    const outputs = template.toJSON().Outputs;
    expect(outputs[OUTPUT_S3_TABLES_MODELING_EMR_EXECUTION_ROLE_ARN]).toBeDefined();
  });
});

describe('S3TablesModelingStack Condition tests', () => {
  test('Should have UseDefaultNamespace condition', () => {
    const conditions = template.toJSON().Conditions;
    expect(conditions.UseDefaultNamespace).toBeDefined();
  });
});

describe('S3TablesModelingStack IAM Role Boundary tests', () => {
  test('Should have IamRoleBoundaryArn parameter', () => {
    template.hasParameter('IamRoleBoundaryArn', {
      Type: 'String',
      Default: '',
    });
  });

  test('Should have isEmptyPermissionBoundary condition', () => {
    const conditions = template.toJSON().Conditions;
    expect(conditions.isEmptyPermissionBoundary).toBeDefined();
  });
});
