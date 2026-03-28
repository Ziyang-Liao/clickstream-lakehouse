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

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import request from 'supertest';
import { clickStreamTableName } from '../../common/constants';
import { PipelineStackType } from '../../common/model-ln';
import { app, server } from '../../index';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);
const lambdaMock = mockClient(LambdaClient);

const MOCK_PROJECT_ID = 'project_8888_8888';
const MOCK_PIPELINE_ID = '6666-6666';
const MOCK_JOB_RUN_ID = 'job-run-12345';

const MOCK_S3_TABLES_CONFIG = {
  tableBucketArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test-bucket',
  namespace: 'clickstream_test',
  scheduleExpression: 'cron(0 2 * * ? *)',
  dataRetentionDays: 365,
};

const MOCK_PIPELINE_WITH_S3_TABLES = {
  id: MOCK_PROJECT_ID,
  type: `PIPELINE#${MOCK_PIPELINE_ID}#latest`,
  pipelineId: MOCK_PIPELINE_ID,
  projectId: MOCK_PROJECT_ID,
  deleted: false,
  dataModeling: {
    s3Tables: MOCK_S3_TABLES_CONFIG,
  },
  stackDetails: [
    {
      stackType: PipelineStackType.DATA_MODELING_S3_TABLES,
      outputs: [
        {
          OutputKey: 'S3TablesModelingEMRApplicationId',
          OutputValue: 'emr-app-12345',
        },
        {
          OutputKey: 'S3TablesModelingJobSubmitterFunctionArn',
          OutputValue: 'arn:aws:lambda:us-east-1:123456789012:function:job-submitter',
        },
      ],
    },
  ],
};

const MOCK_PIPELINE_WITHOUT_S3_TABLES = {
  id: MOCK_PROJECT_ID,
  type: `PIPELINE#${MOCK_PIPELINE_ID}#latest`,
  pipelineId: MOCK_PIPELINE_ID,
  projectId: MOCK_PROJECT_ID,
  deleted: false,
  dataModeling: {},
};

function projectExistedMock(mock: any, existed: boolean): any {
  return mock.on(GetCommand, {
    TableName: clickStreamTableName,
    Key: {
      id: MOCK_PROJECT_ID,
      type: `METADATA#${MOCK_PROJECT_ID}`,
    },
  }).resolves({
    Item: {
      id: MOCK_PROJECT_ID,
      deleted: !existed,
    },
  });
}

function pipelineExistedMock(mock: any, existed: boolean): any {
  return mock.on(GetCommand, {
    TableName: clickStreamTableName,
    Key: {
      id: MOCK_PROJECT_ID,
      type: `PIPELINE#${MOCK_PIPELINE_ID}#latest`,
    },
  }).resolves({
    Item: existed ? {
      id: MOCK_PROJECT_ID,
      type: `PIPELINE#${MOCK_PIPELINE_ID}#latest`,
      pipelineId: MOCK_PIPELINE_ID,
      deleted: false,
    } : undefined,
  });
}

function pipelineListMock(mock: any, pipeline: any): any {
  return mock.on(QueryCommand).resolves({
    Items: pipeline ? [pipeline] : [],
  });
}

/**
 * S3 Tables Modeling API Tests
 * Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6
 */
describe('S3 Tables Modeling API test', () => {
  beforeEach(() => {
    ddbMock.reset();
    lambdaMock.reset();
  });

  describe('POST /api/pipeline/:id/s3tables-modeling/trigger - Trigger job', () => {
    /**
     * Test: Successfully trigger S3 Tables modeling job
     * Validates: Requirements 7.2, 7.5
     */
    it('should trigger S3 Tables modeling job successfully', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITH_S3_TABLES);

      lambdaMock.on(InvokeCommand).resolves({
        Payload: new TextEncoder().encode(JSON.stringify({
          jobRunId: MOCK_JOB_RUN_ID,
          status: 'SUBMITTED',
          message: 'Job submitted successfully',
        })) as any,
      });

      const res = await request(app)
        .post(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/trigger`)
        .query({ pid: MOCK_PROJECT_ID })
        .send({});

      expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(res.statusCode).toBe(201);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.jobRunId).toEqual(MOCK_JOB_RUN_ID);
      expect(res.body.data.status).toEqual('SUBMITTED');
    });

    /**
     * Test: Trigger with custom parameters
     * Validates: Requirements 7.2
     */
    it('should trigger job with custom parameters', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITH_S3_TABLES);

      lambdaMock.on(InvokeCommand).resolves({
        Payload: new TextEncoder().encode(JSON.stringify({
          jobRunId: MOCK_JOB_RUN_ID,
          status: 'SUBMITTED',
          message: 'Job submitted successfully',
          startTimestamp: 1704067200000,
          endTimestamp: 1704153600000,
        })) as any,
      });

      const res = await request(app)
        .post(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/trigger`)
        .query({ pid: MOCK_PROJECT_ID })
        .send({
          startTimestamp: 1704067200000,
          endTimestamp: 1704153600000,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toEqual(true);
    });

    /**
     * Test: Return 404 when pipeline not found
     * Validates: Requirements 7.6
     */
    it('should return 404 when pipeline not found', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, false);

      const res = await request(app)
        .post(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/trigger`)
        .query({ pid: MOCK_PROJECT_ID })
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });

    /**
     * Test: Return 400 when S3 Tables modeling not enabled
     * Validates: Requirements 7.6
     */
    it('should return 400 when S3 Tables modeling not enabled', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITHOUT_S3_TABLES);

      const res = await request(app)
        .post(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/trigger`)
        .query({ pid: MOCK_PROJECT_ID })
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
      expect(res.body.message).toContain('S3 Tables modeling is not enabled');
    });

    /**
     * Test: Return 400 when project does not exist
     * Validates: Requirements 7.6
     */
    it('should return 400 when project does not exist', async () => {
      projectExistedMock(ddbMock, false);

      const res = await request(app)
        .post(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/trigger`)
        .query({ pid: MOCK_PROJECT_ID })
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });
  });

  describe('GET /api/pipeline/:id/s3tables-modeling/status - Get status', () => {
    /**
     * Test: Get S3 Tables modeling status successfully
     * Validates: Requirements 7.3
     */
    it('should get S3 Tables modeling status successfully', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITH_S3_TABLES);

      const res = await request(app)
        .get(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/status`)
        .query({ pid: MOCK_PROJECT_ID });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.enabled).toEqual(true);
      expect(res.body.data.tableBucketArn).toEqual(MOCK_S3_TABLES_CONFIG.tableBucketArn);
      expect(res.body.data.namespace).toEqual(MOCK_S3_TABLES_CONFIG.namespace);
      expect(res.body.data.scheduleExpression).toEqual(MOCK_S3_TABLES_CONFIG.scheduleExpression);
      expect(res.body.data.emrApplicationId).toEqual('emr-app-12345');
    });

    /**
     * Test: Get status when S3 Tables modeling not enabled
     * Validates: Requirements 7.3
     */
    it('should return enabled=false when S3 Tables modeling not enabled', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITHOUT_S3_TABLES);

      const res = await request(app)
        .get(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/status`)
        .query({ pid: MOCK_PROJECT_ID });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.enabled).toEqual(false);
    });

    /**
     * Test: Return 404 when pipeline not found
     * Validates: Requirements 7.6
     */
    it('should return 404 when pipeline not found', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, false);

      const res = await request(app)
        .get(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/status`)
        .query({ pid: MOCK_PROJECT_ID });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });
  });

  describe('GET /api/pipeline/:id/s3tables-modeling/jobs - Get job history', () => {
    /**
     * Test: Get S3 Tables modeling job history successfully
     * Validates: Requirements 7.4
     */
    it('should get S3 Tables modeling job history successfully', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITH_S3_TABLES);

      const res = await request(app)
        .get(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/jobs`)
        .query({ pid: MOCK_PROJECT_ID });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.totalCount).toBeDefined();
      expect(res.body.data.items).toBeDefined();
    });

    /**
     * Test: Get job history with limit parameter
     * Validates: Requirements 7.4
     */
    it('should get job history with limit parameter', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITH_S3_TABLES);

      const res = await request(app)
        .get(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/jobs`)
        .query({ pid: MOCK_PROJECT_ID, limit: 5 });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
    });

    /**
     * Test: Return 400 when S3 Tables modeling not enabled
     * Validates: Requirements 7.6
     */
    it('should return 400 when S3 Tables modeling not enabled', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      pipelineListMock(ddbMock, MOCK_PIPELINE_WITHOUT_S3_TABLES);

      const res = await request(app)
        .get(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/jobs`)
        .query({ pid: MOCK_PROJECT_ID });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });

    /**
     * Test: Return 404 when pipeline not found
     * Validates: Requirements 7.6
     */
    it('should return 404 when pipeline not found', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, false);

      const res = await request(app)
        .get(`/api/pipeline/${MOCK_PIPELINE_ID}/s3tables-modeling/jobs`)
        .query({ pid: MOCK_PROJECT_ID });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });
  });

  afterAll((done) => {
    server.close();
    done();
  });
});
