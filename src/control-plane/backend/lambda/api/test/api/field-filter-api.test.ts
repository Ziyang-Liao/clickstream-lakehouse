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
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import request from 'supertest';
import { clickStreamTableName } from '../../common/constants';
import { app, server } from '../../index';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);

const MOCK_PROJECT_ID = 'project_8888_8888';
const MOCK_PIPELINE_ID = '6666-6666';
const MOCK_APP_ID = 'app_7777_7777';

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
    Item: {
      id: MOCK_PROJECT_ID,
      type: `PIPELINE#${MOCK_PIPELINE_ID}#latest`,
      pipelineId: MOCK_PIPELINE_ID,
      deleted: !existed,
    },
  });
}

function filterRuleExistedMock(mock: any, existed: boolean, appId?: string): any {
  const type = appId ? `FILTER_RULE#app#${appId}` : `FILTER_RULE#pipeline#${MOCK_PIPELINE_ID}`;
  return mock.on(GetCommand, {
    TableName: clickStreamTableName,
    Key: {
      id: MOCK_PROJECT_ID,
      type: type,
    },
  }).resolves(existed ? {
    Item: {
      id: MOCK_PROJECT_ID,
      type: type,
      prefix: 'FILTER_RULE',
      projectId: MOCK_PROJECT_ID,
      pipelineId: MOCK_PIPELINE_ID,
      appId: appId,
      filterMode: 'whitelist',
      fields: ['field1', 'field2'],
      createAt: 1675321494735,
      updateAt: 1675321494735,
      operator: 'test@example.com',
      deleted: false,
    },
  } : {
    Item: undefined,
  });
}

describe('Field Filter API test', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('POST /api/filter - Create filter rule', () => {
    it('should create a pipeline-level filter rule successfully', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, false);
      ddbMock.on(PutCommand).resolves({});

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'whitelist',
          fields: ['field1', 'field2', 'user.name'],
        });

      expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(res.statusCode).toBe(201);
      expect(res.body.success).toEqual(true);
      expect(res.body.message).toEqual('Filter rule created.');
    });

    it('should create an app-level filter rule successfully', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, false, MOCK_APP_ID);
      ddbMock.on(PutCommand).resolves({});

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          appId: MOCK_APP_ID,
          filterMode: 'blacklist',
          fields: ['sensitive_field'],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toEqual(true);
    });

    it('should return 400 for invalid filterMode', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'invalid_mode',
          fields: ['field1'],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });

    it('should return 400 for invalid field names', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, false);

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'whitelist',
          fields: ['123invalid', 'valid_field'],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });

    it('should return 409 when rule already exists', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, true);

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'whitelist',
          fields: ['field1'],
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toEqual(false);
    });

    it('should return 400 when project does not exist', async () => {
      projectExistedMock(ddbMock, false);

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'whitelist',
          fields: ['field1'],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });

    it('should return 400 when pipeline does not exist', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, false);

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'whitelist',
          fields: ['field1'],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });

    it('should deduplicate fields', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, false);
      ddbMock.on(PutCommand).resolves({});

      const res = await request(app)
        .post('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'whitelist',
          fields: ['field1', 'field2', 'field1', 'field2'],
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.fields).toEqual(['field1', 'field2']);
    });
  });

  describe('GET /api/filter - List filter rules', () => {
    it('should list filter rules for a pipeline', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: MOCK_PROJECT_ID,
            type: `FILTER_RULE#pipeline#${MOCK_PIPELINE_ID}`,
            filterMode: 'whitelist',
            fields: ['field1'],
          },
          {
            id: MOCK_PROJECT_ID,
            type: `FILTER_RULE#app#${MOCK_APP_ID}`,
            filterMode: 'blacklist',
            fields: ['field2'],
          },
        ],
      });

      const res = await request(app)
        .get('/api/filter')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.totalCount).toBe(2);
    });

    it('should return empty list when no rules exist', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const res = await request(app)
        .get('/api/filter')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.totalCount).toBe(0);
    });
  });

  describe('GET /api/filter/rule - Get filter rule', () => {
    it('should get a pipeline-level filter rule', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, true);

      const res = await request(app)
        .get('/api/filter/rule')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.filterMode).toEqual('whitelist');
    });

    it('should return 404 when rule does not exist', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, false);

      const res = await request(app)
        .get('/api/filter/rule')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toEqual(false);
    });
  });

  describe('GET /api/filter/effective - Get effective filter rule', () => {
    it('should return app-level rule when it exists', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);

      // App-level rule exists
      ddbMock.on(GetCommand, {
        TableName: clickStreamTableName,
        Key: {
          id: MOCK_PROJECT_ID,
          type: `FILTER_RULE#app#${MOCK_APP_ID}`,
        },
      }).resolves({
        Item: {
          id: MOCK_PROJECT_ID,
          type: `FILTER_RULE#app#${MOCK_APP_ID}`,
          filterMode: 'blacklist',
          fields: ['app_field'],
          deleted: false,
        },
      });

      const res = await request(app)
        .get('/api/filter/effective')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          appId: MOCK_APP_ID,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.source).toEqual('app');
      expect(res.body.data.filterMode).toEqual('blacklist');
    });

    it('should fall back to pipeline-level rule when app-level does not exist', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);

      // App-level rule does not exist
      ddbMock.on(GetCommand, {
        TableName: clickStreamTableName,
        Key: {
          id: MOCK_PROJECT_ID,
          type: `FILTER_RULE#app#${MOCK_APP_ID}`,
        },
      }).resolves({
        Item: undefined,
      });

      // Pipeline-level rule exists
      ddbMock.on(GetCommand, {
        TableName: clickStreamTableName,
        Key: {
          id: MOCK_PROJECT_ID,
          type: `FILTER_RULE#pipeline#${MOCK_PIPELINE_ID}`,
        },
      }).resolves({
        Item: {
          id: MOCK_PROJECT_ID,
          type: `FILTER_RULE#pipeline#${MOCK_PIPELINE_ID}`,
          filterMode: 'whitelist',
          fields: ['pipeline_field'],
          deleted: false,
        },
      });

      const res = await request(app)
        .get('/api/filter/effective')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          appId: MOCK_APP_ID,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data.source).toEqual('pipeline');
    });

    it('should return null when no rule exists', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);

      // No rules exist
      ddbMock.on(GetCommand, {
        TableName: clickStreamTableName,
        Key: {
          id: MOCK_PROJECT_ID,
          type: `FILTER_RULE#app#${MOCK_APP_ID}`,
        },
      }).resolves({
        Item: undefined,
      });

      ddbMock.on(GetCommand, {
        TableName: clickStreamTableName,
        Key: {
          id: MOCK_PROJECT_ID,
          type: `FILTER_RULE#pipeline#${MOCK_PIPELINE_ID}`,
        },
      }).resolves({
        Item: undefined,
      });

      const res = await request(app)
        .get('/api/filter/effective')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          appId: MOCK_APP_ID,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.data).toBeNull();
    });
  });

  describe('PUT /api/filter - Update filter rule', () => {
    it('should update a filter rule successfully', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, true);
      ddbMock.on(UpdateCommand).resolves({});

      const res = await request(app)
        .put('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'blacklist',
          fields: ['new_field1', 'new_field2'],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.message).toEqual('Filter rule updated.');
    });

    it('should return 404 when rule does not exist', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, false);

      const res = await request(app)
        .put('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'blacklist',
          fields: ['field1'],
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toEqual(false);
    });

    it('should return 400 for invalid filterMode', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);

      const res = await request(app)
        .put('/api/filter')
        .send({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
          filterMode: 'invalid',
          fields: ['field1'],
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toEqual(false);
    });
  });

  describe('DELETE /api/filter - Delete filter rule', () => {
    it('should delete a filter rule successfully', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, true);
      ddbMock.on(UpdateCommand).resolves({});

      const res = await request(app)
        .delete('/api/filter')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.message).toEqual('Filter rule deleted.');
    });

    it('should return 404 when rule does not exist', async () => {
      projectExistedMock(ddbMock, true);
      pipelineExistedMock(ddbMock, true);
      filterRuleExistedMock(ddbMock, false);

      const res = await request(app)
        .delete('/api/filter')
        .query({
          projectId: MOCK_PROJECT_ID,
          pipelineId: MOCK_PIPELINE_ID,
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toEqual(false);
    });
  });

  afterAll((done) => {
    server.close();
    done();
  });
});
