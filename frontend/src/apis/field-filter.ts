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

import { apiRequest } from 'ts/request';

/**
 * Create a new field filter rule
 * Requirements: 1.1
 */
const createFieldFilterRule = async (params: {
  projectId: string;
  pipelineId: string;
  appId?: string;
  filterMode: FilterMode;
  fields: string[];
}) => {
  const result: any = await apiRequest('post', '/filter', params);
  return result;
};

/**
 * Get a specific field filter rule
 * Requirements: 1.2
 */
const getFieldFilterRule = async (params: {
  projectId: string;
  pipelineId: string;
  appId?: string;
}) => {
  let url = `/filter/rule?projectId=${params.projectId}&pipelineId=${params.pipelineId}`;
  if (params.appId) {
    url += `&appId=${params.appId}`;
  }
  const result: any = await apiRequest('get', url);
  return result;
};

/**
 * Update a field filter rule
 * Requirements: 1.3
 */
const updateFieldFilterRule = async (params: {
  projectId: string;
  pipelineId: string;
  appId?: string;
  filterMode: FilterMode;
  fields: string[];
}) => {
  const result: any = await apiRequest('put', '/filter', params);
  return result;
};

/**
 * Delete a field filter rule
 * Requirements: 1.4
 */
const deleteFieldFilterRule = async (params: {
  projectId: string;
  pipelineId: string;
  appId?: string;
}) => {
  let url = `/filter?projectId=${params.projectId}&pipelineId=${params.pipelineId}`;
  if (params.appId) {
    url += `&appId=${params.appId}`;
  }
  const result: any = await apiRequest('delete', url);
  return result;
};

/**
 * List field filter rules for a pipeline
 * Requirements: 1.2
 */
const listFieldFilterRules = async (params: {
  projectId: string;
  pipelineId: string;
  pageNumber?: number;
  pageSize?: number;
}) => {
  const result: any = await apiRequest('get', '/filter', params);
  return result;
};

/**
 * Get the effective filter rule for an application
 * Priority: app-level rule > pipeline-level rule
 * Requirements: 5.2, 5.3, 5.4
 */
const getEffectiveFieldFilterRule = async (params: {
  projectId: string;
  pipelineId: string;
  appId: string;
}) => {
  const url = `/filter/effective?projectId=${params.projectId}&pipelineId=${params.pipelineId}&appId=${params.appId}`;
  const result: any = await apiRequest('get', url);
  return result;
};

/**
 * Get all available fields for filtering
 */
const getAvailableFields = async () => {
  const result: any = await apiRequest('get', '/filter/available-fields');
  return result;
};

export {
  createFieldFilterRule,
  getFieldFilterRule,
  updateFieldFilterRule,
  deleteFieldFilterRule,
  listFieldFilterRules,
  getEffectiveFieldFilterRule,
  getAvailableFields,
};
