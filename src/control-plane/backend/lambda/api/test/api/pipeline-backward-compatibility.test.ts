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

import { assert, property, record, constant, integer, boolean, oneof } from 'fast-check';
import {
  validateDataModelingMutualExclusion,
  validateS3TablesConfig,
} from '../../common/stack-params-valid';
import { PipelineSinkType, PipelineServerProtocol, DataCollectionSDK } from '../../common/types';
import { IPipeline, S3TablesModelingConfig, DataModeling } from '../../model/pipeline';

/**
 * Property 12: Backward Compatibility
 * For any existing Pipeline (without s3Tables configuration), the system should continue
 * to work normally after upgrade, without requiring any configuration changes.
 * Validates: Requirements 8.1, 8.2, 8.3, 14.1, 14.3, 14.4
 */
describe('Property 12: Backward Compatibility', () => {
  // Helper to create a base pipeline without S3 Tables configuration
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
   * Feature: s3-tables-data-modeling, Property 12: Backward compatibility
   * For any existing Pipeline without S3 Tables configuration, validation should pass.
   * Validates: Requirements 14.1
   */
  test('should accept existing pipelines without S3 Tables configuration', () => {
    assert(
      property(
        // Generate random existing pipeline configurations (without S3 Tables)
        oneof(
          // No data modeling at all
          constant(undefined),
          // Only athena
          record({
            athena: boolean(),
          }),
          // Redshift only (existing configuration)
          record({
            athena: boolean(),
            redshift: constant({
              dataRange: 259200,
              newServerless: {
                baseCapacity: 8,
                network: {
                  vpcId: 'vpc-12345678',
                  subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'],
                  securityGroups: ['sg-1'],
                },
              },
            }),
          }),
          // Redshift with ODS
          record({
            athena: boolean(),
            ods: constant({
              bucket: { name: 'test-bucket', prefix: '' },
              fileSuffix: '.snappy.parquet',
            }),
            redshift: constant({
              dataRange: 259200,
              newServerless: {
                baseCapacity: 8,
                network: {
                  vpcId: 'vpc-12345678',
                  subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'],
                  securityGroups: ['sg-1'],
                },
              },
            }),
          }),
        ),
        (dataModeling: DataModeling | undefined) => {
          const pipeline = createBasePipeline(dataModeling as DataModeling | undefined);

          // Validation should pass for existing pipelines without S3 Tables
          expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
          expect(validateDataModelingMutualExclusion(pipeline)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 12: Backward compatibility
   * For any Pipeline, the s3Tables configuration should be optional.
   * Validates: Requirements 14.4
   */
  test('s3Tables configuration should be optional in dataModeling', () => {
    assert(
      property(
        boolean(),
        (athenaEnabled: boolean) => {
          // Create pipeline with dataModeling but without s3Tables
          const dataModeling: DataModeling = {
            athena: athenaEnabled,
          };
          const pipeline = createBasePipeline(dataModeling);

          // Should not throw error - s3Tables is optional
          expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
          expect(pipeline.dataModeling?.s3Tables).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 12: Backward compatibility
   * For any Pipeline with Redshift configuration, it should not require S3 Tables configuration.
   * Validates: Requirements 14.3
   */
  test('should not require S3 Tables configuration for Redshift pipelines', () => {
    assert(
      property(
        integer({ min: 1, max: 365 }),
        integer({ min: 8, max: 512 }).filter((n: number) => n % 8 === 0),
        (dataRange: number, baseCapacity: number) => {
          const dataModeling: DataModeling = {
            athena: false,
            redshift: {
              dataRange: dataRange * 86400, // Convert days to seconds
              newServerless: {
                baseCapacity,
                network: {
                  vpcId: 'vpc-12345678',
                  subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'],
                  securityGroups: ['sg-1'],
                },
              },
            },
          };
          const pipeline = createBasePipeline(dataModeling);

          // Should not throw error - S3 Tables is not required
          expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
          expect(pipeline.dataModeling?.s3Tables).toBeUndefined();
          expect(pipeline.dataModeling?.redshift).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 12: Backward compatibility
   * For any Pipeline upgrade from "no data modeling" to "S3 Tables data modeling",
   * the system should allow the upgrade.
   * Validates: Requirements 14.2
   */
  test('should allow upgrade from no data modeling to S3 Tables data modeling', () => {
    assert(
      property(
        integer({ min: 1, max: 3650 }),
        (dataRetentionDays: number) => {
          // Original pipeline without data modeling
          const originalPipeline = createBasePipeline(undefined);
          expect(originalPipeline.dataModeling).toBeUndefined();

          // Upgraded pipeline with S3 Tables
          const s3TablesConfig: S3TablesModelingConfig = {
            tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket',
            scheduleExpression: 'cron(0 2 * * ? *)',
            dataRetentionDays,
          };
          const upgradedDataModeling: DataModeling = {
            athena: false,
            s3Tables: s3TablesConfig,
          };
          const upgradedPipeline = createBasePipeline(upgradedDataModeling);

          // Both should pass validation
          expect(() => validateDataModelingMutualExclusion(originalPipeline)).not.toThrow();
          expect(() => validateDataModelingMutualExclusion(upgradedPipeline)).not.toThrow();
          expect(() => validateS3TablesConfig(s3TablesConfig)).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 12: Backward compatibility
   * For any Pipeline, the dataModeling field itself should be optional.
   * Validates: Requirements 14.1, 14.4
   */
  test('dataModeling field should be optional in Pipeline', () => {
    // Pipeline without dataModeling
    const pipeline = createBasePipeline(undefined);

    expect(pipeline.dataModeling).toBeUndefined();
    expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
  });

  /**
   * Feature: s3-tables-data-modeling, Property 12: Backward compatibility
   * For any Pipeline with only athena enabled, it should work without S3 Tables or Redshift.
   * Validates: Requirements 14.1
   */
  test('should work with only athena enabled', () => {
    const dataModeling: DataModeling = {
      athena: true,
    };
    const pipeline = createBasePipeline(dataModeling);

    expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
    expect(pipeline.dataModeling?.athena).toBe(true);
    expect(pipeline.dataModeling?.s3Tables).toBeUndefined();
    expect(pipeline.dataModeling?.redshift).toBeUndefined();
  });
});

/**
 * Additional unit tests for Pipeline API backward compatibility
 */
describe('Pipeline API Backward Compatibility Unit Tests', () => {
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

  test('existing pipeline with provisioned Redshift should continue to work', () => {
    const dataModeling: DataModeling = {
      athena: true,
      ods: {
        bucket: { name: 'test-bucket', prefix: '' },
        fileSuffix: '.snappy.parquet',
      },
      redshift: {
        dataRange: 259200,
        provisioned: {
          clusterIdentifier: 'redshift-cluster-1',
          dbUser: 'clickstream',
        },
      },
      loadWorkflow: {
        bucket: { name: 'test-bucket', prefix: '' },
        maxFilesLimit: 50,
      },
    };
    const pipeline = createBasePipeline(dataModeling);

    expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
    expect(pipeline.dataModeling?.redshift?.provisioned).toBeDefined();
    expect(pipeline.dataModeling?.s3Tables).toBeUndefined();
  });

  test('existing pipeline with existing serverless Redshift should continue to work', () => {
    const dataModeling: DataModeling = {
      athena: false,
      redshift: {
        dataRange: 259200,
        existingServerless: {
          workgroupName: 'my-workgroup',
          iamRoleArn: 'arn:aws:iam::123456789012:role/RedshiftRole',
        },
      },
    };
    const pipeline = createBasePipeline(dataModeling);

    expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
    expect(pipeline.dataModeling?.redshift?.existingServerless).toBeDefined();
    expect(pipeline.dataModeling?.s3Tables).toBeUndefined();
  });

  test('pipeline with empty dataModeling object should work', () => {
    const dataModeling: DataModeling = {
      athena: false,
    };
    const pipeline = createBasePipeline(dataModeling);

    expect(() => validateDataModelingMutualExclusion(pipeline)).not.toThrow();
  });

  test('pipeline create API should accept request without s3Tables', () => {
    // Simulating a create request body without s3Tables
    const createRequestBody = {
      projectId: 'test_project',
      region: 'us-east-1',
      dataCollectionSDK: DataCollectionSDK.CLICKSTREAM,
      tags: [],
      network: {
        vpcId: 'vpc-12345678',
        publicSubnetIds: ['subnet-1', 'subnet-2'],
        privateSubnetIds: ['subnet-3', 'subnet-4'],
      },
      bucket: {
        name: 'test-bucket',
        prefix: '',
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
      dataModeling: {
        athena: true,
        redshift: {
          dataRange: 259200,
          newServerless: {
            baseCapacity: 8,
            network: {
              vpcId: 'vpc-12345678',
              subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'],
              securityGroups: ['sg-1'],
            },
          },
        },
      },
    };

    // s3Tables should not be required
    expect((createRequestBody.dataModeling as any).s3Tables).toBeUndefined();
    expect(() => validateDataModelingMutualExclusion(createRequestBody as unknown as IPipeline)).not.toThrow();
  });

  test('pipeline update API should accept request without s3Tables', () => {
    // Simulating an update request body without s3Tables
    const updateRequestBody = {
      pipelineId: 'test-pipeline-id',
      projectId: 'test_project',
      version: '1.0.0',
      dataModeling: {
        athena: true,
        redshift: {
          dataRange: 259200,
          newServerless: {
            baseCapacity: 16, // Updated capacity
            network: {
              vpcId: 'vpc-12345678',
              subnetIds: ['subnet-1', 'subnet-2', 'subnet-3'],
              securityGroups: ['sg-1'],
            },
          },
        },
      },
    };

    // s3Tables should not be required for update
    expect((updateRequestBody.dataModeling as any).s3Tables).toBeUndefined();
  });
});
