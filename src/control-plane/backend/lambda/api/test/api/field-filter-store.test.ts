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

// Mock the user service to avoid circular dependency
// This must be before any imports that trigger the circular dependency
jest.mock('../../service/user', () => ({
  UserService: jest.fn().mockImplementation(() => ({
    list: jest.fn(),
    details: jest.fn(),
    add: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
}));

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IFieldFilterRule } from '../../model/field-filter';
import { ClickStreamStore } from '../../store/click-stream-store';
import { DynamoDbStore } from '../../store/dynamodb/dynamodb-store';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);
const store: ClickStreamStore = new DynamoDbStore();

const MOCK_PROJECT_ID = 'project_test_001';
const MOCK_PIPELINE_ID = 'pipeline_test_001';
const MOCK_APP_ID = 'app_test_001';
const MOCK_OPERATOR = 'test@example.com';

const createMockPipelineRule = (): IFieldFilterRule => ({
  id: MOCK_PROJECT_ID,
  type: `FILTER_RULE#pipeline#${MOCK_PIPELINE_ID}`,
  prefix: 'FILTER_RULE',
  projectId: MOCK_PROJECT_ID,
  pipelineId: MOCK_PIPELINE_ID,
  filterMode: 'whitelist',
  fields: ['event_id', 'event_name', 'user_id'],
  createAt: Date.now(),
  updateAt: Date.now(),
  operator: MOCK_OPERATOR,
  deleted: false,
});

const createMockAppRule = (): IFieldFilterRule => ({
  id: MOCK_PROJECT_ID,
  type: `FILTER_RULE#app#${MOCK_APP_ID}`,
  prefix: 'FILTER_RULE',
  projectId: MOCK_PROJECT_ID,
  pipelineId: MOCK_PIPELINE_ID,
  appId: MOCK_APP_ID,
  filterMode: 'blacklist',
  fields: ['sensitive_field', 'private_data'],
  createAt: Date.now(),
  updateAt: Date.now(),
  operator: MOCK_OPERATOR,
  deleted: false,
});

describe('Field Filter Rule Store Tests', () => {

  beforeEach(() => {
    ddbMock.reset();
  });

  describe('addFieldFilterRule', () => {
    it('should add a pipeline-level filter rule', async () => {
      ddbMock.on(PutCommand).resolves({});

      const rule = createMockPipelineRule();
      const result = await store.addFieldFilterRule(rule);

      expect(result).toBe(`FILTER_RULE#pipeline#${MOCK_PIPELINE_ID}`);
      expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
    });

    it('should add an app-level filter rule', async () => {
      ddbMock.on(PutCommand).resolves({});

      const rule = createMockAppRule();
      const result = await store.addFieldFilterRule(rule);

      expect(result).toBe(`FILTER_RULE#app#${MOCK_APP_ID}`);
      expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
    });
  });

  describe('getFieldFilterRule', () => {
    it('should return undefined when rule does not exist', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await store.getFieldFilterRule(MOCK_PROJECT_ID, MOCK_PIPELINE_ID);

      expect(result).toBeUndefined();
      expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 1);
    });

    it('should return undefined when rule is deleted', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { ...createMockPipelineRule(), deleted: true },
      });

      const result = await store.getFieldFilterRule(MOCK_PROJECT_ID, MOCK_PIPELINE_ID);

      expect(result).toBeUndefined();
    });

    it('should return pipeline-level rule when it exists', async () => {
      const mockRule = createMockPipelineRule();
      ddbMock.on(GetCommand).resolves({ Item: mockRule });

      const result = await store.getFieldFilterRule(MOCK_PROJECT_ID, MOCK_PIPELINE_ID);

      expect(result).toEqual(mockRule);
      expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 1);
    });

    it('should return app-level rule when appId is provided', async () => {
      const mockRule = createMockAppRule();
      ddbMock.on(GetCommand).resolves({ Item: mockRule });

      const result = await store.getFieldFilterRule(MOCK_PROJECT_ID, MOCK_PIPELINE_ID, MOCK_APP_ID);

      expect(result).toEqual(mockRule);
      expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 1);
    });
  });

  describe('updateFieldFilterRule', () => {
    it('should update a pipeline-level filter rule', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const rule: IFieldFilterRule = {
        ...createMockPipelineRule(),
        filterMode: 'blacklist',
        fields: ['new_field_1', 'new_field_2'],
      };

      await store.updateFieldFilterRule(rule);

      expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
    });

    it('should update an app-level filter rule', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const rule: IFieldFilterRule = {
        ...createMockAppRule(),
        filterMode: 'whitelist',
        fields: ['allowed_field'],
      };

      await store.updateFieldFilterRule(rule);

      expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
    });
  });

  describe('deleteFieldFilterRule', () => {
    it('should soft delete a pipeline-level filter rule', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      await store.deleteFieldFilterRule(MOCK_PROJECT_ID, MOCK_PIPELINE_ID, undefined, MOCK_OPERATOR);

      expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
    });

    it('should soft delete an app-level filter rule', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      await store.deleteFieldFilterRule(MOCK_PROJECT_ID, MOCK_PIPELINE_ID, MOCK_APP_ID, MOCK_OPERATOR);

      expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
    });
  });

  describe('listFieldFilterRules', () => {
    it('should return empty array when no rules exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await store.listFieldFilterRules(MOCK_PROJECT_ID, MOCK_PIPELINE_ID);

      expect(result).toEqual([]);
      expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });

    it('should return all filter rules for a pipeline', async () => {
      const pipelineRule = createMockPipelineRule();
      const appRule = createMockAppRule();

      ddbMock.on(QueryCommand).resolves({
        Items: [pipelineRule, appRule],
      });

      const result = await store.listFieldFilterRules(MOCK_PROJECT_ID, MOCK_PIPELINE_ID);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(pipelineRule);
      expect(result).toContainEqual(appRule);
      expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });
  });
});
