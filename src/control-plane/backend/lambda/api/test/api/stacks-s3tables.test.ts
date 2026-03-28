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

import { SolutionVersion } from '@aws/clickstream-base-lib';
import { PipelineSinkType, PipelineServerProtocol, DataCollectionSDK } from '../../common/types';
import { IPipeline, CPipelineResources, S3TablesModelingConfig } from '../../model/pipeline';
import { CS3TablesModelingStack, getStackParameters } from '../../model/stacks';

/**
 * Property 2: Stack 参数生成完整性
 * For any valid S3 Tables modeling configuration, CS3TablesModelingStack should generate
 * CloudFormation parameters containing all required parameters.
 * Validates: Requirements 2.3, 2.4, 2.5, 2.6
 */
describe('CS3TablesModelingStack', () => {
  const createBasePipeline = (s3TablesConfig?: S3TablesModelingConfig): IPipeline => ({
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
    dataProcessing: {
      dataFreshnessInHour: 72,
      scheduleExpression: 'cron(0 1 * * ? *)',
      sourceS3Bucket: { name: 'source-bucket', prefix: 'source/' },
      sinkS3Bucket: { name: 'sink-bucket', prefix: 'sink/' },
      pipelineBucket: { name: 'pipeline-bucket', prefix: 'pipeline/' },
    },
    dataModeling: {
      ods: {
        bucket: { name: 'ods-bucket', prefix: 'ods/' },
        fileSuffix: '.snappy.parquet',
      },
      athena: false,
      s3Tables: s3TablesConfig,
    },
    version: '1.0.0',
    versionTag: 'v1.0.0',
    createAt: Date.now(),
    updateAt: Date.now(),
    operator: 'test@example.com',
    deleted: false,
  });

  const createBaseResources = (): CPipelineResources => ({
    appIds: ['app1', 'app2'],
    project: {
      id: 'test_project',
      type: 'project',
      prefix: 'test-prefix',
      name: 'Test Project',
      description: 'Test project description',
      emails: 'test@example.com',
      platform: 'Web',
      region: 'us-east-1',
      environment: 'Dev',
      pipelineId: 'test-pipeline-id',
      pipelineVersion: '1.0.0',
      applications: [],
      analysisStudioEnabled: false,
      status: 'Active',
      createAt: Date.now(),
      updateAt: Date.now(),
      operator: 'test@example.com',
      deleted: false,
    },
  });

  describe('Parameter Generation Completeness', () => {
    /**
     * Feature: s3-tables-data-modeling, Property 2: Stack 参数生成完整性
     * For any valid S3 Tables modeling configuration, CS3TablesModelingStack should generate
     * CloudFormation parameters containing all required parameters.
     */
    test('should generate all required parameters for valid S3 Tables configuration', () => {
      const s3TablesConfig: S3TablesModelingConfig = {
        tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-table-bucket',
        namespace: 'clickstream_test',
        scheduleExpression: 'cron(0 2 * * ? *)',
        dataRetentionDays: 365,
      };

      const pipeline = createBasePipeline(s3TablesConfig);
      const resources = createBaseResources();

      const stack = new CS3TablesModelingStack(pipeline, resources);
      const parameters = getStackParameters(stack, SolutionVersion.Of('v1.2.0'));

      // Verify all required parameters are present
      const parameterKeys = parameters.map(p => p.ParameterKey);

      // Basic parameters (Requirements 2.3)
      expect(parameterKeys).toContain('VpcId');
      expect(parameterKeys).toContain('PrivateSubnetIds');
      expect(parameterKeys).toContain('ProjectId');
      expect(parameterKeys).toContain('AppIds');

      // S3 Tables specific parameters (Requirements 2.4)
      expect(parameterKeys).toContain('S3TableBucketArn');
      expect(parameterKeys).toContain('S3TableNamespace');

      // Schedule and retention parameters (Requirements 2.5)
      expect(parameterKeys).toContain('ScheduleExpression');
      expect(parameterKeys).toContain('DataRetentionDays');

      // ODS data source parameters (Requirements 2.6)
      expect(parameterKeys).toContain('OdsS3Bucket');
      expect(parameterKeys).toContain('OdsS3Prefix');
    });

    test('should apply correct parameter values', () => {
      const s3TablesConfig: S3TablesModelingConfig = {
        tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-table-bucket',
        namespace: 'custom_namespace',
        scheduleExpression: 'cron(0 3 * * ? *)',
        dataRetentionDays: 180,
      };

      const pipeline = createBasePipeline(s3TablesConfig);
      const resources = createBaseResources();

      const stack = new CS3TablesModelingStack(pipeline, resources);
      const parameters = getStackParameters(stack, SolutionVersion.Of('v1.2.0'));

      const getParamValue = (key: string) =>
        parameters.find(p => p.ParameterKey === key)?.ParameterValue;

      expect(getParamValue('VpcId')).toBe('vpc-12345678');
      expect(getParamValue('PrivateSubnetIds')).toBe('subnet-00000000000000011,subnet-00000000000000012');
      expect(getParamValue('ProjectId')).toBe('test_project');
      expect(getParamValue('AppIds')).toBe('app1,app2');
      expect(getParamValue('S3TableBucketArn')).toBe('arn:aws:s3tables:us-east-1:123456789012:bucket/test-table-bucket');
      expect(getParamValue('S3TableNamespace')).toBe('custom_namespace');
      expect(getParamValue('ScheduleExpression')).toBe('cron(0 3 * * ? *)');
      expect(getParamValue('DataRetentionDays')).toBe('180');
    });
  });

  describe('Default Values', () => {
    test('should apply default namespace when not provided', () => {
      const s3TablesConfig: S3TablesModelingConfig = {
        tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-table-bucket',
        scheduleExpression: 'cron(0 2 * * ? *)',
      };

      const pipeline = createBasePipeline(s3TablesConfig);
      const resources = createBaseResources();

      const stack = new CS3TablesModelingStack(pipeline, resources);
      const parameters = getStackParameters(stack, SolutionVersion.Of('v1.2.0'));

      const namespaceParam = parameters.find(p => p.ParameterKey === 'S3TableNamespace');
      expect(namespaceParam?.ParameterValue).toBe('clickstream_test_project');
    });

    test('should apply default dataRetentionDays when not provided', () => {
      const s3TablesConfig: S3TablesModelingConfig = {
        tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-table-bucket',
        scheduleExpression: 'cron(0 2 * * ? *)',
      };

      const pipeline = createBasePipeline(s3TablesConfig);
      const resources = createBaseResources();

      const stack = new CS3TablesModelingStack(pipeline, resources);
      const parameters = getStackParameters(stack, SolutionVersion.Of('v1.2.0'));

      const retentionParam = parameters.find(p => p.ParameterKey === 'DataRetentionDays');
      expect(retentionParam?.ParameterValue).toBe('365');
    });

    test('should apply default ODS file suffix when not provided', () => {
      const s3TablesConfig: S3TablesModelingConfig = {
        tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-table-bucket',
        scheduleExpression: 'cron(0 2 * * ? *)',
      };

      // Create pipeline without ODS config to test default
      const pipeline: IPipeline = {
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
        dataProcessing: {
          dataFreshnessInHour: 72,
          scheduleExpression: 'cron(0 1 * * ? *)',
          sourceS3Bucket: { name: 'source-bucket', prefix: 'source/' },
          sinkS3Bucket: { name: 'sink-bucket', prefix: 'sink/' },
          pipelineBucket: { name: 'pipeline-bucket', prefix: 'pipeline/' },
        },
        dataModeling: {
          athena: false,
          s3Tables: s3TablesConfig,
          // No ODS config - testing default
        },
        version: '1.0.0',
        versionTag: 'v1.0.0',
        createAt: Date.now(),
        updateAt: Date.now(),
        operator: 'test@example.com',
        deleted: false,
      };
      const resources = createBaseResources();

      const stack = new CS3TablesModelingStack(pipeline, resources);
      const parameters = getStackParameters(stack, SolutionVersion.Of('v1.2.0'));

      const fileSuffixParam = parameters.find(p => p.ParameterKey === 'OdsFileSuffix');
      expect(fileSuffixParam?.ParameterValue).toBe('.snappy.parquet');
    });
  });

  describe('Validation', () => {
    test('should throw error when S3 Tables configuration is missing', () => {
      const pipeline = createBasePipeline(undefined);
      const resources = createBaseResources();

      expect(() => new CS3TablesModelingStack(pipeline, resources))
        .toThrow('S3 Tables configuration is required for S3 Tables data modeling.');
    });

    test('should throw error when tableBucketArn is empty', () => {
      const s3TablesConfig: S3TablesModelingConfig = {
        tableBucketArn: '',
        scheduleExpression: 'cron(0 2 * * ? *)',
      };

      const pipeline = createBasePipeline(s3TablesConfig);
      const resources = createBaseResources();

      expect(() => new CS3TablesModelingStack(pipeline, resources))
        .toThrow('S3 Table Bucket ARN is required for S3 Tables data modeling.');
    });

    test('should throw error when scheduleExpression is empty', () => {
      const s3TablesConfig: S3TablesModelingConfig = {
        tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-table-bucket',
        scheduleExpression: '',
      };

      const pipeline = createBasePipeline(s3TablesConfig);
      const resources = createBaseResources();

      expect(() => new CS3TablesModelingStack(pipeline, resources))
        .toThrow('Schedule expression is required for S3 Tables data modeling.');
    });
  });

  describe('editAllowedList', () => {
    test('should return correct editable parameters', () => {
      const allowedList = CS3TablesModelingStack.editAllowedList();

      expect(allowedList).toContain('ScheduleExpression');
      expect(allowedList).toContain('DataRetentionDays');
      expect(allowedList).toContain('AppIds');
      expect(allowedList).toHaveLength(3);
    });
  });
});
