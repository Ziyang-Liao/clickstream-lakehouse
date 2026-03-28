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

import { assert, property, record, constant, integer, tuple, constantFrom, stringOf, oneof } from 'fast-check';
import {
  validateDataModelingMutualExclusion,
  validateS3TablesConfig,
  validateScheduleExpression,
  S3_TABLE_BUCKET_ARN_PATTERN,
} from '../../common/stack-params-valid';
import { PipelineSinkType, PipelineServerProtocol, DataCollectionSDK } from '../../common/types';
import { IPipeline, S3TablesModelingConfig, DataModeling } from '../../model/pipeline';

/**
 * Property 1: S3 Tables and Redshift configuration mutual exclusion
 * For any Pipeline configuration, if both dataModeling.s3Tables and dataModeling.redshift
 * configurations are provided, the system should reject the configuration and return an error.
 * Validates: Requirements 1.6, 8.5
 */
describe('Property 1: S3 Tables and Redshift Mutual Exclusion', () => {
  // Helper to create a base pipeline
  const createBasePipeline = (dataModeling?: DataModeling): IPipeline => ({
    id: 'test-pipeline-id',
    type: 'pipeline',
    prefix: 'test-prefix',
    projectId: 'test_project',
    pipelineId: 'test-pipeline-id',
    region: 'us-east-1',
    dataCollectionSDK: DataCollectionSDK.CLICKSTREAM,
    tags: [],
    network: {
      vpcId: 'vpc-12345678',
      publicSubnetIds: ['subnet-00000000000000021', 'subnet-00000000000000022'],
      privateSubnetIds: ['subnet-00000000000000011', 'subnet-00000000000000012'],
    },
    bucket: {
      name: 'test-bucket',
      prefix: 'test-prefix/',
    },
    ingestionServer: {
      size: {
        serverMin: 1,
        serverMax: 4,
        warmPoolSize: 0,
        scaleOnCpuUtilizationPercent: 50,
      },
      loadBalancer: {
        serverEndpointPath: '/collect',
        serverCorsOrigin: '',
        protocol: PipelineServerProtocol.HTTP,
        enableGlobalAccelerator: false,
        enableApplicationLoadBalancerAccessLog: false,
      },
      sinkType: PipelineSinkType.S3,
    },
    dataModeling,
    version: '1.0.0',
    versionTag: 'v1.0.0',
    createAt: Date.now(),
    updateAt: Date.now(),
    operator: 'test@example.com',
    deleted: false,
  });

  /**
   * Feature: s3-tables-data-modeling, Property 1: S3 Tables and Redshift configuration mutual exclusion
   * For any Pipeline with both S3 Tables and Redshift configurations, validation should fail.
   */
  test('should reject pipeline with both S3 Tables and Redshift configurations', () => {
    assert(
      property(
        // Generate random S3 Tables config
        record({
          tableBucketArn: constant('arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket'),
          scheduleExpression: constant('cron(0 2 * * ? *)'),
          dataRetentionDays: integer({ min: 1, max: 3650 }),
        }),
        // Generate random Redshift config
        record({
          dataRange: integer({ min: 1, max: 365 }),
          newServerless: constant({
            baseCapacity: 8,
            network: {
              vpcId: 'vpc-12345678',
              subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'],
              securityGroups: ['sg-1'],
            },
          }),
        }),
        (s3TablesConfig: { tableBucketArn: string; scheduleExpression: string; dataRetentionDays: number }, redshiftConfig: { dataRange: number; newServerless: any }) => {
          const dataModeling: DataModeling = {
            athena: false,
            s3Tables: s3TablesConfig as S3TablesModelingConfig,
            redshift: redshiftConfig,
          };
          const pipeline = createBasePipeline(dataModeling);

          // Should throw error when both are present
          expect(() => validateDataModelingMutualExclusion(pipeline))
            .toThrow('Redshift and S3 Tables data modeling are mutually exclusive');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 1: S3 Tables and Redshift configuration mutual exclusion
   * For any Pipeline with only S3 Tables configuration, validation should pass.
   */
  test('should accept pipeline with only S3 Tables configuration', () => {
    assert(
      property(
        record({
          tableBucketArn: constant('arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket'),
          scheduleExpression: constant('cron(0 2 * * ? *)'),
          dataRetentionDays: integer({ min: 1, max: 3650 }),
        }),
        (s3TablesConfig: { tableBucketArn: string; scheduleExpression: string; dataRetentionDays: number }) => {
          const dataModeling: DataModeling = {
            athena: false,
            s3Tables: s3TablesConfig as S3TablesModelingConfig,
          };
          const pipeline = createBasePipeline(dataModeling);

          // Should not throw error
          expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
          expect(validateDataModelingMutualExclusion(pipeline)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 1: S3 Tables and Redshift configuration mutual exclusion
   * For any Pipeline with only Redshift configuration, validation should pass.
   */
  test('should accept pipeline with only Redshift configuration', () => {
    assert(
      property(
        record({
          dataRange: integer({ min: 1, max: 365 }),
          newServerless: constant({
            baseCapacity: 8,
            network: {
              vpcId: 'vpc-12345678',
              subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'],
              securityGroups: ['sg-1'],
            },
          }),
        }),
        (redshiftConfig: { dataRange: number; newServerless: any }) => {
          const dataModeling: DataModeling = {
            athena: false,
            redshift: redshiftConfig,
          };
          const pipeline = createBasePipeline(dataModeling);

          // Should not throw error
          expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
          expect(validateDataModelingMutualExclusion(pipeline)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 1: S3 Tables and Redshift configuration mutual exclusion
   * For any Pipeline with no data modeling configuration, validation should pass.
   */
  test('should accept pipeline with no data modeling configuration', () => {
    const pipeline = createBasePipeline(undefined);
    expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
    expect(validateDataModelingMutualExclusion(pipeline)).toBe(true);
  });
});

/**
 * Property 11: API configuration validation
 * For any Pipeline create or update request, if s3Tables.tableBucketArn format is invalid
 * (does not conform to ARN format), the system should return a validation error.
 * Validates: Requirements 8.4
 */
describe('Property 11: API Configuration Validation', () => {
  // Valid ARN generator
  const validArnArbitrary = tuple(
    constantFrom('aws', 'aws-cn', 'aws-us-gov'),
    constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1', 'cn-north-1'),
    stringOf(constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 12, maxLength: 12 }),
    stringOf(constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.-'.split('')), { minLength: 3, maxLength: 60 }),
  ).map(([partition, region, accountId, bucketName]: [string, string, string, string]) => {
    // Ensure bucket name starts and ends with alphanumeric
    const cleanBucketName = bucketName.replace(/^[.-]+/, 'a').replace(/[.-]+$/, 'z');
    const partitionStr = partition === 'aws' ? 'aws' : partition;
    return `arn:${partitionStr}:s3tables:${region}:${accountId}:bucket/${cleanBucketName}`;
  });

  // Invalid ARN generator
  const invalidArnArbitrary = oneof(
    // Missing arn: prefix
    constant('aws:s3tables:us-east-1:123456789012:bucket/test-bucket'),
    // Wrong service
    constant('arn:aws:s3:us-east-1:123456789012:bucket/test-bucket'),
    // Missing bucket path
    constant('arn:aws:s3tables:us-east-1:123456789012:test-bucket'),
    // Invalid account ID (not 12 digits)
    constant('arn:aws:s3tables:us-east-1:12345:bucket/test-bucket'),
    // Empty string
    constant(''),
    // Random string
    stringOf(constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 50 }),
  );

  // Valid schedule expression generator
  const validScheduleExpressionArbitrary = oneof(
    // Cron expressions
    tuple(
      integer({ min: 0, max: 59 }),
      integer({ min: 0, max: 23 }),
    ).map(([minute, hour]: [number, number]) => `cron(${minute} ${hour} * * ? *)`),
    // Rate expressions
    tuple(
      integer({ min: 1, max: 24 }),
      constantFrom('minute', 'minutes', 'hour', 'hours', 'day', 'days'),
    ).map(([value, unit]: [number, string]) => `rate(${value} ${unit})`),
  );

  // Invalid schedule expression generator
  const invalidScheduleExpressionArbitrary = oneof(
    // Missing parentheses
    constant('cron 0 2 * * ? *'),
    // Wrong format
    constant('schedule(0 2 * * ? *)'),
    // Invalid cron (wrong number of fields)
    constant('cron(0 2 * *)'),
    // Invalid rate (missing unit)
    constant('rate(5)'),
    // Empty string
    constant(''),
    // Random string
    stringOf(constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 20 }),
  );

  /**
   * Feature: s3-tables-data-modeling, Property 11: API configuration validation
   * For any valid S3 Table Bucket ARN, validation should pass.
   */
  test('should accept valid S3 Table Bucket ARN format', () => {
    assert(
      property(
        validArnArbitrary,
        validScheduleExpressionArbitrary,
        integer({ min: 1, max: 3650 }),
        (tableBucketArn: string, scheduleExpression: string, dataRetentionDays: number) => {
          const config: S3TablesModelingConfig = {
            tableBucketArn,
            scheduleExpression,
            dataRetentionDays,
          };

          // Should not throw error for valid config
          expect(() => validateS3TablesConfig(config)).not.toThrow();
          expect(validateS3TablesConfig(config)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 11: API configuration validation
   * For any invalid S3 Table Bucket ARN, validation should fail.
   */
  test('should reject invalid S3 Table Bucket ARN format', () => {
    assert(
      property(
        invalidArnArbitrary,
        (tableBucketArn: string) => {
          const config: S3TablesModelingConfig = {
            tableBucketArn,
            scheduleExpression: 'cron(0 2 * * ? *)',
            dataRetentionDays: 365,
          };

          // Should throw error for invalid ARN
          expect(() => validateS3TablesConfig(config)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 11: API configuration validation
   * For any valid schedule expression, validation should pass.
   */
  test('should accept valid schedule expression format', () => {
    assert(
      property(
        validScheduleExpressionArbitrary,
        (scheduleExpression: string) => {
          // Should not throw error for valid schedule expression
          expect(() => validateScheduleExpression(scheduleExpression)).not.toThrow();
          expect(validateScheduleExpression(scheduleExpression)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 11: API configuration validation
   * For any invalid schedule expression, validation should fail.
   */
  test('should reject invalid schedule expression format', () => {
    assert(
      property(
        invalidScheduleExpressionArbitrary,
        (scheduleExpression: string) => {
          // Should throw error for invalid schedule expression
          expect(() => validateScheduleExpression(scheduleExpression)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 11: API configuration validation
   * For any dataRetentionDays within valid range (1-3650), validation should pass.
   */
  test('should accept dataRetentionDays within valid range', () => {
    assert(
      property(
        integer({ min: 1, max: 3650 }),
        (dataRetentionDays: number) => {
          const config: S3TablesModelingConfig = {
            tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket',
            scheduleExpression: 'cron(0 2 * * ? *)',
            dataRetentionDays,
          };

          // Should not throw error for valid range
          expect(() => validateS3TablesConfig(config)).not.toThrow();
          expect(validateS3TablesConfig(config)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 11: API configuration validation
   * For any dataRetentionDays outside valid range, validation should fail.
   */
  test('should reject dataRetentionDays outside valid range', () => {
    assert(
      property(
        oneof(
          integer({ min: -1000, max: 0 }),
          integer({ min: 3651, max: 10000 }),
        ),
        (dataRetentionDays: number) => {
          const config: S3TablesModelingConfig = {
            tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket',
            scheduleExpression: 'cron(0 2 * * ? *)',
            dataRetentionDays,
          };

          // Should throw error for invalid range
          expect(() => validateS3TablesConfig(config)).toThrow('Data retention days must be between 1 and 3650');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 11: API configuration validation
   * When dataRetentionDays is undefined, validation should pass (uses default).
   */
  test('should accept undefined dataRetentionDays (uses default)', () => {
    const config: S3TablesModelingConfig = {
      tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket',
      scheduleExpression: 'cron(0 2 * * ? *)',
    };

    expect(() => validateS3TablesConfig(config)).not.toThrow();
    expect(validateS3TablesConfig(config)).toBe(true);
  });
});

/**
 * Additional unit tests for edge cases
 */
describe('S3 Tables Validation Edge Cases', () => {
  test('should validate ARN pattern correctly', () => {
    const validArns = [
      'arn:aws:s3tables:us-east-1:123456789012:bucket/my-bucket',
      'arn:aws:s3tables:us-west-2:123456789012:bucket/test-bucket-123',
      'arn:aws-cn:s3tables:cn-north-1:123456789012:bucket/china-bucket',
      'arn:aws-us-gov:s3tables:us-gov-west-1:123456789012:bucket/gov-bucket',
    ];

    const invalidArns = [
      'arn:aws:s3:us-east-1:123456789012:bucket/my-bucket', // wrong service
      'arn:aws:s3tables:us-east-1:12345:bucket/my-bucket', // wrong account id length
      'arn:aws:s3tables:us-east-1:123456789012:my-bucket', // missing bucket/ prefix
      'invalid-arn',
      '',
    ];

    const arnRegex = new RegExp(S3_TABLE_BUCKET_ARN_PATTERN);

    validArns.forEach(arn => {
      expect(arnRegex.test(arn)).toBe(true);
    });

    invalidArns.forEach(arn => {
      expect(arnRegex.test(arn)).toBe(false);
    });
  });

  test('should validate rate expressions correctly', () => {
    const validRates = [
      'rate(1 minute)',
      'rate(5 minutes)',
      'rate(1 hour)',
      'rate(24 hours)',
      'rate(1 day)',
      'rate(7 days)',
    ];

    const invalidRates = [
      'rate(0 minutes)', // zero value
      'rate(-1 hours)', // negative value
      'rate(5 weeks)', // invalid unit
      'rate(5)', // missing unit
      'rate(minutes)', // missing value
    ];

    validRates.forEach(rate => {
      expect(() => validateScheduleExpression(rate)).not.toThrow();
    });

    invalidRates.forEach(rate => {
      expect(() => validateScheduleExpression(rate)).toThrow();
    });
  });

  test('should validate cron expressions correctly', () => {
    const validCrons = [
      'cron(0 2 * * ? *)',
      'cron(30 8 * * ? *)',
      'cron(0 0 1 * ? *)',
      'cron(0 12 ? * MON-FRI *)',
    ];

    const invalidCrons = [
      'cron(0 2 * * ?)', // missing year field
      'cron(0 2 * *)', // missing fields
      'cron()', // empty
    ];

    validCrons.forEach(cron => {
      expect(() => validateScheduleExpression(cron)).not.toThrow();
    });

    invalidCrons.forEach(cron => {
      expect(() => validateScheduleExpression(cron)).toThrow();
    });
  });
});
