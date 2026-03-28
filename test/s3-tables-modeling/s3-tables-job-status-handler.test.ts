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

import { EventBridgeEvent } from 'aws-lambda';

// Mock S3 functions before importing handler
const mockPutStringToS3 = jest.fn();
const mockReadS3ObjectAsJson = jest.fn();

jest.mock('../../src/common/s3', () => ({
  putStringToS3: mockPutStringToS3,
  readS3ObjectAsJson: mockReadS3ObjectAsJson,
}));

// Import handler after mocking
import { handler } from '../../src/s3-tables-modeling/lambda/job-status-handler/index';

interface EMRServerlessJobStateChangeDetail {
  applicationId: string;
  jobRunId: string;
  state: string;
  stateDetails?: string;
  createdAt?: string;
  updatedAt?: string;
}

describe('S3 Tables Job Status Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PIPELINE_S3_BUCKET: 'test-pipeline-bucket',
      PIPELINE_S3_PREFIX: 'pipeline-temp/',
      PROJECT_ID: 'test-project',
      EMR_APPLICATION_ID: 'test-app-id',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createEvent = (
    state: string,
    jobRunId: string = 'test-job-run-id',
    stateDetails?: string,
  ): EventBridgeEvent<'EMR Serverless Job Run State Change', EMRServerlessJobStateChangeDetail> => ({
    'version': '0',
    'id': 'test-event-id',
    'detail-type': 'EMR Serverless Job Run State Change',
    'source': 'aws.emr-serverless',
    'account': '123456789012',
    'time': '2024-01-01T00:00:00Z',
    'region': 'us-east-1',
    'resources': [],
    'detail': {
      applicationId: 'test-app-id',
      jobRunId,
      state,
      stateDetails,
    },
  });

  describe('Successful job state updates', () => {
    test('should update job info when job succeeds', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        startTimestamp: 1704067200000,
        endTimestamp: 1704153600000,
        state: 'RUNNING',
        startRunTime: '2024-01-01T00:00:00Z',
        triggerSource: 'schedule',
      };

      mockReadS3ObjectAsJson.mockResolvedValueOnce(existingJobInfo);
      mockPutStringToS3.mockResolvedValueOnce(undefined);

      const event = createEvent('SUCCESS', 'test-job-run-id', 'Job completed successfully');

      await handler(event);

      expect(mockReadS3ObjectAsJson).toHaveBeenCalledWith(
        'test-pipeline-bucket',
        'pipeline-temp/s3tables-job-info/test-project/job-test-job-run-id.json',
      );

      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.stringContaining('"state":"SUCCESS"'),
        'test-pipeline-bucket',
        'pipeline-temp/s3tables-job-info/test-project/job-test-job-run-id.json',
      );
    });

    test('should update job info when job fails', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        startTimestamp: 1704067200000,
        endTimestamp: 1704153600000,
        state: 'RUNNING',
        startRunTime: '2024-01-01T00:00:00Z',
        triggerSource: 'api',
      };

      mockReadS3ObjectAsJson.mockResolvedValueOnce(existingJobInfo);
      mockPutStringToS3.mockResolvedValueOnce(undefined);

      const event = createEvent('FAILED', 'test-job-run-id', 'Job failed due to error');

      await handler(event);

      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.stringContaining('"state":"FAILED"'),
        'test-pipeline-bucket',
        'pipeline-temp/s3tables-job-info/test-project/job-test-job-run-id.json',
      );

      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.stringContaining('"stateDetails":"Job failed due to error"'),
        'test-pipeline-bucket',
        expect.any(String),
      );
    });

    test('should update job info when job is cancelled', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        state: 'RUNNING',
      };

      mockReadS3ObjectAsJson.mockResolvedValueOnce(existingJobInfo);
      mockPutStringToS3.mockResolvedValueOnce(undefined);

      const event = createEvent('CANCELLED', 'test-job-run-id');

      await handler(event);

      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.stringContaining('"state":"CANCELLED"'),
        'test-pipeline-bucket',
        'pipeline-temp/s3tables-job-info/test-project/job-test-job-run-id.json',
      );
    });

    test('should include endRunTime in updated job info', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        state: 'RUNNING',
      };

      mockReadS3ObjectAsJson.mockResolvedValueOnce(existingJobInfo);
      mockPutStringToS3.mockResolvedValueOnce(undefined);

      const event = createEvent('SUCCESS');

      await handler(event);

      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.stringContaining('"endRunTime"'),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('Latest job info updates', () => {
    test('should update latest job info when timestamps match', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        startTimestamp: 1704067200000,
        endTimestamp: 1704153600000,
        state: 'RUNNING',
      };

      const latestJobInfo = {
        jobRunId: 'latest',
        startTimestamp: 1704067200000,
        endTimestamp: 1704153600000,
        state: 'LAMBDA-SUBMITTED',
      };

      mockReadS3ObjectAsJson
        .mockResolvedValueOnce(existingJobInfo)
        .mockResolvedValueOnce(latestJobInfo);
      mockPutStringToS3.mockResolvedValue(undefined);

      const event = createEvent('SUCCESS', 'test-job-run-id');

      await handler(event);

      // Should update both job info and latest job info
      expect(mockPutStringToS3).toHaveBeenCalledTimes(2);
      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.any(String),
        'test-pipeline-bucket',
        'pipeline-temp/s3tables-job-info/test-project/job-latest.json',
      );
    });

    test('should not update latest job info when timestamps do not match', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        startTimestamp: 1704067200000,
        endTimestamp: 1704153600000,
        state: 'RUNNING',
      };

      const latestJobInfo = {
        jobRunId: 'latest',
        startTimestamp: 1704240000000, // Different timestamp
        endTimestamp: 1704326400000,
        state: 'LAMBDA-SUBMITTED',
      };

      mockReadS3ObjectAsJson
        .mockResolvedValueOnce(existingJobInfo)
        .mockResolvedValueOnce(latestJobInfo);
      mockPutStringToS3.mockResolvedValue(undefined);

      const event = createEvent('SUCCESS', 'test-job-run-id');

      await handler(event);

      // Should only update job info, not latest
      expect(mockPutStringToS3).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge cases', () => {
    test('should create new record when job info not found', async () => {
      mockReadS3ObjectAsJson.mockResolvedValueOnce(null);
      mockPutStringToS3.mockResolvedValueOnce(undefined);

      const event = createEvent('SUCCESS', 'new-job-run-id');

      await handler(event);

      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.stringContaining('"jobRunId":"new-job-run-id"'),
        'test-pipeline-bucket',
        'pipeline-temp/s3tables-job-info/test-project/job-new-job-run-id.json',
      );
    });

    test('should use default state details when not provided', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        state: 'RUNNING',
      };

      mockReadS3ObjectAsJson.mockResolvedValueOnce(existingJobInfo);
      mockPutStringToS3.mockResolvedValueOnce(undefined);

      const event = createEvent('SUCCESS', 'test-job-run-id');

      await handler(event);

      expect(mockPutStringToS3).toHaveBeenCalledWith(
        expect.stringContaining('"stateDetails":"Job SUCCESS"'),
        expect.any(String),
        expect.any(String),
      );
    });

    test('should return early when missing environment variables', async () => {
      process.env.PIPELINE_S3_BUCKET = '';

      const event = createEvent('SUCCESS');

      await handler(event);

      expect(mockReadS3ObjectAsJson).not.toHaveBeenCalled();
      expect(mockPutStringToS3).not.toHaveBeenCalled();
    });

    test('should return early when project ID is missing', async () => {
      process.env.PROJECT_ID = '';

      const event = createEvent('SUCCESS');

      await handler(event);

      expect(mockReadS3ObjectAsJson).not.toHaveBeenCalled();
      expect(mockPutStringToS3).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    test('should throw error when S3 read fails', async () => {
      mockReadS3ObjectAsJson.mockRejectedValueOnce(new Error('S3 read error'));

      const event = createEvent('SUCCESS');

      await expect(handler(event)).rejects.toThrow('S3 read error');
    });

    test('should throw error when S3 write fails', async () => {
      const existingJobInfo = {
        jobRunId: 'test-job-run-id',
        state: 'RUNNING',
      };

      mockReadS3ObjectAsJson.mockResolvedValueOnce(existingJobInfo);
      mockPutStringToS3.mockRejectedValueOnce(new Error('S3 write error'));

      const event = createEvent('SUCCESS');

      await expect(handler(event)).rejects.toThrow('S3 write error');
    });
  });
});
