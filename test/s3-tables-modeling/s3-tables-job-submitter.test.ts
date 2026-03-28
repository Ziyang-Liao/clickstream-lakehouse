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

//@ts-nocheck

/**
 * Test suite for S3 Tables Job Submitter Lambda
 *
 * Property 10: 作业提交重试逻辑
 * For any job submission failure, Lambda should use exponential backoff strategy,
 * retry interval should grow by 2^n seconds (n is retry count).
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5
 */

class TimeoutError extends Error {
  constructor() {
    super();
    this.name = 'TimeoutError';
  }
}

const startTimestamp = '2023-03-12T09:33:26.572Z';
const endTimestamp = '2023-03-13T09:33:26.572Z';

const emrMock = {
  EMRServerlessClient: jest.fn(() => {
    return {
      send: jest.fn(() => {
        return {
          jobRunId: 's3tables-job-001',
          applicationId: 'testS3TablesAppId',
          jobRun: {
            state: 'SUCCESS',
            stateDetails: 'Job completed successfully',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };
      }),
    };
  }),
  StartJobRunCommand: jest.fn(() => { return { name: 'StartJobRunCommand' }; }),
  GetJobRunCommand: jest.fn(() => { return { name: 'GetJobRunCommand' }; }),
};

jest.mock('@aws-sdk/client-emr-serverless', () => {
  return emrMock;
});

const putStringToS3Mock = jest.fn(() => { });

const mockS3Functions = {
  readS3ObjectAsJson: jest.fn(() => undefined),
  putStringToS3: putStringToS3Mock,
  listObjectsByPrefix: jest.fn((_b, _k, f) => {
    [
      {
        Key: 'test/event_v2/file1.snappy.parquet',
        Size: 1024,
        LastModified: new Date(startTimestamp),
      },
      {
        Key: 'test/event_v2/file2.snappy.parquet',
        Size: 2048,
        LastModified: new Date(startTimestamp),
      },
    ].forEach(o => f(o));
  }),
};

jest.mock('../../src/common/s3', () => {
  return mockS3Functions;
});

import { LambdaClient, ListTagsCommand } from '@aws-sdk/client-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler, S3TablesJobEvent } from '../../src/s3-tables-modeling/lambda/job-submitter/index';
import { S3TablesJobSubmitter } from '../../src/s3-tables-modeling/lambda/job-submitter/s3-tables-job-submitter';
import { getMockContext } from '../common/lambda-context';
import 'aws-sdk-client-mock-jest';

// Set up environment variables
process.env.EMR_APPLICATION_ID = 'testS3TablesAppId';
process.env.EMR_EXECUTION_ROLE_ARN = 'arn:aws:iam::123456789012:role/emr-execution-role';
process.env.S3_TABLE_BUCKET_ARN = 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket';
process.env.S3_TABLE_NAMESPACE = 'clickstream_test_project';
process.env.PROJECT_ID = 'test_project_001';
process.env.APP_IDS = 'app1,app2';
process.env.ODS_S3_BUCKET = 'test-ods-bucket';
process.env.ODS_S3_PREFIX = 'ods-prefix/';
process.env.ODS_FILE_SUFFIX = '.snappy.parquet';
process.env.PIPELINE_S3_BUCKET = 'test-pipeline-bucket';
process.env.PIPELINE_S3_PREFIX = 'pipeline-prefix/';
process.env.DATA_RETENTION_DAYS = '365';
process.env.DATA_BUFFERED_SECONDS = '30';

describe('S3 Tables Job Submitter - Basic Functionality', () => {
  const context = getMockContext();
  const lambdaMock = mockClient(LambdaClient);

  beforeEach(() => {
    lambdaMock.reset();
    jest.clearAllMocks();
  });

  /**
   * Test: Job submission with valid timestamps
   * Validates: Requirement 6.2 - Read ODS layer latest data timestamp to determine processing range
   */
  test('should submit job with valid timestamps', async () => {
    lambdaMock.on(ListTagsCommand).resolves({ Tags: {} });

    const event: S3TablesJobEvent = {
      startTimestamp,
      endTimestamp,
      triggerSource: 'schedule',
    };

    const result = await handler(event, context);

    expect(result.status).toBe('SUBMITTED');
    expect(result.jobRunId).toBe('s3tables-job-001');
    expect(result.startTimestamp).toBeDefined();
    expect(result.endTimestamp).toBeDefined();
    expect(emrMock.StartJobRunCommand.mock.calls.length).toBeGreaterThan(0);
  });

  /**
   * Test: Job submission builds correct Spark parameters
   * Validates: Requirement 6.3 - Build Spark job parameters and submit job
   */
  test('should build correct Spark job parameters', async () => {
    lambdaMock.on(ListTagsCommand).resolves({ Tags: {} });

    const event: S3TablesJobEvent = {
      startTimestamp,
      endTimestamp,
    };

    await handler(event, context);

    expect(emrMock.StartJobRunCommand.mock.calls.length).toBeGreaterThan(0);
    const jobParams = emrMock.StartJobRunCommand.mock.calls[0][0];

    expect(jobParams.applicationId).toBe('testS3TablesAppId');
    expect(jobParams.executionRoleArn).toBe('arn:aws:iam::123456789012:role/emr-execution-role');
    expect(jobParams.jobDriver.sparkSubmit).toBeDefined();
    expect(jobParams.jobDriver.sparkSubmit.entryPointArguments).toBeDefined();
    expect(jobParams.jobDriver.sparkSubmit.sparkSubmitParameters).toContain('spark.sql.catalog.s3tablesbucket');
  });

  /**
   * Test: Skip job when no ODS files found
   * Validates: Requirement 6.2 - Determine processing range
   */
  test('should skip job when no ODS files found', async () => {
    lambdaMock.on(ListTagsCommand).resolves({ Tags: {} });

    // Mock empty file list
    mockS3Functions.listObjectsByPrefix.mockImplementationOnce(() => {});

    const event: S3TablesJobEvent = {
      startTimestamp: new Date(startTimestamp).getTime() + 100000000,
      endTimestamp: new Date(endTimestamp).getTime() + 100000000,
    };

    const result = await handler(event, context);

    expect(result.status).toBe('SKIPPED');
    expect(result.message).toContain('No ODS files');
    expect(result.objectCount).toBe(0);
  });

  /**
   * Test: Skip job when no app IDs configured
   */
  test('should skip job when no app IDs configured', async () => {
    const originalAppIds = process.env.APP_IDS;
    process.env.APP_IDS = '';

    const event: S3TablesJobEvent = {
      startTimestamp,
      endTimestamp,
    };

    const result = await handler(event, context);

    expect(result.status).toBe('SKIPPED');
    expect(result.message).toContain('No app IDs');

    process.env.APP_IDS = originalAppIds;
  });

  /**
   * Test: Record job info to S3
   * Validates: Requirement 6.4 - Handle job status callback and update execution state
   */
  test('should record job info to S3', async () => {
    lambdaMock.on(ListTagsCommand).resolves({ Tags: {} });

    const event: S3TablesJobEvent = {
      startTimestamp,
      endTimestamp,
    };

    await handler(event, context);

    // Should write job info and latest job info
    expect(putStringToS3Mock.mock.calls.length).toBe(2);

    // Check job info key format
    const jobInfoKey = putStringToS3Mock.mock.calls[0][2];
    expect(jobInfoKey).toContain('s3tables-job-info');
    expect(jobInfoKey).toContain('test_project_001');

    // Check latest job info key
    const latestJobKey = putStringToS3Mock.mock.calls[1][2];
    expect(latestJobKey).toContain('job-latest.json');
  });

  /**
   * Test: Do not update latest job info on re-run
   */
  test('should not update latest job info on re-run', async () => {
    lambdaMock.on(ListTagsCommand).resolves({ Tags: {} });

    const event: S3TablesJobEvent = {
      startTimestamp,
      endTimestamp,
      reRunJob: true,
    };

    await handler(event, context);

    // Should only write job info, not latest
    expect(putStringToS3Mock.mock.calls.length).toBe(1);
    const jobInfoKey = putStringToS3Mock.mock.calls[0][2];
    expect(jobInfoKey).not.toContain('job-latest.json');
  });
});

describe('S3 Tables Job Submitter - Exponential Backoff Retry', () => {
  const context = getMockContext();
  const lambdaMock = mockClient(LambdaClient);

  beforeEach(() => {
    lambdaMock.reset();
    jest.clearAllMocks();
  });

  /**
   * Property 10: 作业提交重试逻辑
   * For any job submission failure, Lambda should use exponential backoff strategy,
   * retry interval should grow by 2^n seconds (n is retry count).
   *
   * Validates: Requirement 6.5 - Implement exponential backoff retry logic on job submission failure
   */
  test('Property 10: should use exponential backoff on retry', async () => {
    const submitter = new S3TablesJobSubmitter();

    // Track sleep calls to verify exponential backoff
    const sleepCalls: number[] = [];
    const originalSleep = (submitter as any).sleep.bind(submitter);
    (submitter as any).sleep = jest.fn(async (ms: number) => {
      sleepCalls.push(ms);
      // Don't actually sleep in tests
    });

    // Mock EMR client to fail first 2 times, succeed on 3rd
    let callCount = 0;
    const mockEmrSend = jest.fn(() => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Simulated EMR submission failure');
      }
      return 'retry-success-job-id';
    });

    (submitter as any).submitEmrJob = mockEmrSend;

    const result = await submitter.submitJobWithRetry(
      { startTimestamp, endTimestamp },
      new Date(startTimestamp).getTime(),
      new Date(endTimestamp).getTime(),
      { objectCount: 10, sizeTotal: 1024 },
      {},
      3,
    );

    expect(result).toBe('retry-success-job-id');
    expect(mockEmrSend).toHaveBeenCalledTimes(3);

    // Verify exponential backoff: 2^0 * 1000 = 1000ms, 2^1 * 1000 = 2000ms
    expect(sleepCalls).toHaveLength(2);
    expect(sleepCalls[0]).toBe(1000); // 2^0 * 1000
    expect(sleepCalls[1]).toBe(2000); // 2^1 * 1000
  });

  /**
   * Test: Should throw after max retries exceeded
   */
  test('should throw after max retries exceeded', async () => {
    const submitter = new S3TablesJobSubmitter();

    // Mock sleep to not actually wait
    (submitter as any).sleep = jest.fn(async () => {});

    // Mock EMR client to always fail
    const mockEmrSend = jest.fn(() => {
      throw new Error('Persistent EMR failure');
    });

    (submitter as any).submitEmrJob = mockEmrSend;

    await expect(
      submitter.submitJobWithRetry(
        { startTimestamp, endTimestamp },
        new Date(startTimestamp).getTime(),
        new Date(endTimestamp).getTime(),
        { objectCount: 10, sizeTotal: 1024 },
        {},
        3,
      ),
    ).rejects.toThrow('Persistent EMR failure');

    expect(mockEmrSend).toHaveBeenCalledTimes(3);
  });

  /**
   * Test: Verify exponential backoff formula 2^n
   */
  test('should follow 2^n exponential backoff formula', async () => {
    const submitter = new S3TablesJobSubmitter();

    const sleepCalls: number[] = [];
    (submitter as any).sleep = jest.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    // Mock to fail 4 times then succeed
    let callCount = 0;
    (submitter as any).submitEmrJob = jest.fn(() => {
      callCount++;
      if (callCount < 5) {
        throw new Error('Failure');
      }
      return { jobRunId: 'success' };
    });

    await submitter.submitJobWithRetry(
      {},
      Date.now(),
      Date.now() + 1000,
      { objectCount: 1, sizeTotal: 100 },
      {},
      5,
    );

    // Verify exponential backoff: 1s, 2s, 4s, 8s
    expect(sleepCalls).toEqual([1000, 2000, 4000, 8000]);
  });
});

describe('S3 Tables Job Submitter - Job Status Callback', () => {
  const context = getMockContext();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test: Get job status
   * Validates: Requirement 6.4 - Handle job status callback
   */
  test('should get job status from EMR', async () => {
    const submitter = new S3TablesJobSubmitter();

    const status = await submitter.getJobStatus('test-job-id');

    expect(status.jobRunId).toBe('test-job-id');
    expect(status.state).toBeDefined();
  });

  /**
   * Test: Handle job callback and update state
   * Validates: Requirement 6.4 - Update execution state
   */
  test('should handle job callback and update state', async () => {
    const submitter = new S3TablesJobSubmitter();

    // Mock existing job info
    mockS3Functions.readS3ObjectAsJson.mockResolvedValueOnce({
      jobRunId: 'callback-test-job',
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 1000,
      state: 'LAMBDA-SUBMITTED',
    });

    const result = await submitter.handleJobCallback('callback-test-job');

    expect(result.jobRunId).toBe('callback-test-job');
    expect(result.state).toBeDefined();
    expect(result.success).toBeDefined();
    expect(result.message).toBeDefined();
  });
});

describe('S3 Tables Job Submitter - Timestamp Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test: Parse ISO timestamp string
   */
  test('should parse ISO timestamp string', async () => {
    const submitter = new S3TablesJobSubmitter();

    const timestamp = (submitter as any).parseTimestamp('2023-03-12T09:33:26.572Z');
    expect(timestamp).toBe(new Date('2023-03-12T09:33:26.572Z').getTime());
  });

  /**
   * Test: Parse numeric timestamp string
   */
  test('should parse numeric timestamp string', async () => {
    const submitter = new S3TablesJobSubmitter();

    const timestamp = (submitter as any).parseTimestamp('1678613606572');
    expect(timestamp).toBe(1678613606572);
  });

  /**
   * Test: Parse numeric timestamp
   */
  test('should parse numeric timestamp', async () => {
    const submitter = new S3TablesJobSubmitter();

    const timestamp = (submitter as any).parseTimestamp(1678613606572);
    expect(timestamp).toBe(1678613606572);
  });

  /**
   * Test: Throw on invalid timestamp format
   */
  test('should throw on invalid timestamp format', async () => {
    const submitter = new S3TablesJobSubmitter();

    expect(() => {
      (submitter as any).parseTimestamp('invalid-timestamp');
    }).toThrow('Invalid timestamp format');
  });

  /**
   * Test: Throw when endTimestamp is before startTimestamp
   */
  test('should throw when endTimestamp is before startTimestamp', async () => {
    const lambdaMock = mockClient(LambdaClient);
    lambdaMock.on(ListTagsCommand).resolves({ Tags: {} });

    const event: S3TablesJobEvent = {
      startTimestamp: new Date(endTimestamp).getTime(),
      endTimestamp: new Date(startTimestamp).getTime(),
    };

    await expect(handler(event, getMockContext())).rejects.toThrow(
      'endTimestamp must be greater than startTimestamp',
    );
  });
});

describe('S3 Tables Job Submitter - Spark Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test: Generate appropriate Spark config for small data
   */
  test('should generate appropriate Spark config for small data', async () => {
    const submitter = new S3TablesJobSubmitter();

    const config = (submitter as any).getSparkConfig({
      objectCount: 10,
      sizeTotal: 500 * 1024 * 1024, // 500MB
    });

    expect(config.driverCores).toBe(2);
    expect(config.driverMemory).toBe(7);
    expect(config.executorCores).toBe(4);
    expect(config.executorMemory).toBe(14);
    expect(config.initialExecutors).toBe(2);
  });

  /**
   * Test: Generate appropriate Spark config for medium data
   */
  test('should generate appropriate Spark config for medium data', async () => {
    const submitter = new S3TablesJobSubmitter();

    const config = (submitter as any).getSparkConfig({
      objectCount: 100,
      sizeTotal: 5 * 1024 * 1024 * 1024, // 5GB
    });

    expect(config.executorCores).toBe(8);
    expect(config.executorMemory).toBe(50);
    expect(config.initialExecutors).toBe(3);
  });

  /**
   * Test: Generate appropriate Spark config for large data
   */
  test('should generate appropriate Spark config for large data', async () => {
    const submitter = new S3TablesJobSubmitter();

    const config = (submitter as any).getSparkConfig({
      objectCount: 1000,
      sizeTotal: 100 * 1024 * 1024 * 1024, // 100GB
    });

    expect(config.driverCores).toBe(16);
    expect(config.driverMemory).toBe(60);
    expect(config.executorCores).toBe(16);
    expect(config.executorMemory).toBe(100);
    expect(config.initialExecutors).toBe(10);
  });

  /**
   * Test: Build Spark submit parameters with Iceberg config
   */
  test('should build Spark submit parameters with Iceberg config', async () => {
    const submitter = new S3TablesJobSubmitter();

    const params = (submitter as any).buildSparkSubmitParameters({
      driverCores: 4,
      driverMemory: 14,
      executorCores: 4,
      executorMemory: 14,
      initialExecutors: 2,
    });

    expect(params).toContain('--class software.aws.solution.clickstream.s3tables.S3TablesModelingRunner');
    expect(params).toContain('spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions');
    expect(params).toContain('spark.sql.catalog.s3tablesbucket=org.apache.iceberg.spark.SparkCatalog');
    expect(params).toContain('spark.sql.catalog.s3tablesbucket.catalog-impl=software.amazon.s3tables.iceberg.S3TablesCatalog');
    expect(params).toContain('spark.driver.cores=4');
    expect(params).toContain('spark.executor.memory=14g');
  });
});

describe('S3 Tables Job Submitter - Date Prefix Generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test: Generate date prefix list for single day
   */
  test('should generate date prefix list for single day', async () => {
    const submitter = new S3TablesJobSubmitter();

    const prefixList = (submitter as any).getDatePrefixList(
      new Date('2023-11-20T01:00:00.000Z').getTime(),
      new Date('2023-11-20T23:00:00.000Z').getTime(),
    );

    expect(prefixList).toEqual([
      'ods-prefix/year=2023/month=11/day=20/',
    ]);
  });

  /**
   * Test: Generate date prefix list for multiple days
   */
  test('should generate date prefix list for multiple days', async () => {
    const submitter = new S3TablesJobSubmitter();

    const prefixList = (submitter as any).getDatePrefixList(
      new Date('2023-11-20T01:00:00.000Z').getTime(),
      new Date('2023-11-22T23:00:00.000Z').getTime(),
    );

    expect(prefixList).toEqual([
      'ods-prefix/year=2023/month=11/day=20/',
      'ods-prefix/year=2023/month=11/day=21/',
      'ods-prefix/year=2023/month=11/day=22/',
    ]);
  });

  /**
   * Test: Generate YMD prefix correctly
   */
  test('should generate YMD prefix correctly', async () => {
    const submitter = new S3TablesJobSubmitter();

    const prefix = (submitter as any).getYMDPrefix(
      new Date('2023-01-05T12:00:00.000Z').getTime(),
    );

    expect(prefix).toBe('year=2023/month=01/day=05/');
  });
});

