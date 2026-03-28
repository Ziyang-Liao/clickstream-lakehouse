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
 * S3 Tables modeling status interface
 * Requirements: 12.2
 */
export interface S3TablesModelingStatus {
  enabled: boolean;
  tableBucketArn?: string;
  namespace?: string;
  scheduleExpression?: string;
  dataRetentionDays?: number;
  lastJobStatus?: string;
  lastJobTimestamp?: string;
  emrApplicationId?: string;
}

/**
 * S3 Tables job history item interface
 * Requirements: 12.3
 */
export interface S3TablesJobHistoryItem {
  jobRunId: string;
  state: string;
  startTimestamp?: number;
  endTimestamp?: number;
  startRunTime?: string;
  endRunTime?: string;
  triggerSource?: string;
}

/**
 * S3 Tables job trigger response interface
 * Requirements: 12.1
 */
export interface S3TablesJobTriggerResponse {
  jobRunId?: string;
  status: 'SUBMITTED' | 'SKIPPED' | 'FAILED';
  message: string;
  startTimestamp?: number;
  endTimestamp?: number;
  objectCount?: number;
}

/**
 * S3 Tables jobs list response interface
 * Requirements: 12.3
 */
export interface S3TablesJobsListResponse {
  totalCount: number;
  items: S3TablesJobHistoryItem[];
}

/**
 * Trigger S3 Tables data modeling job
 * Requirements: 12.1
 * 
 * @param projectId - The project ID
 * @param pipelineId - The pipeline ID
 * @param options - Optional trigger options
 * @returns Promise with the trigger response
 */
const triggerS3TablesModeling = async (
  projectId: string,
  pipelineId: string,
  options?: {
    startTimestamp?: string | number;
    endTimestamp?: string | number;
    jobName?: string;
    reRunJob?: boolean;
  }
) => {
  const result: any = await apiRequest(
    'post',
    `/pipeline/${pipelineId}/s3tables-modeling/trigger?pid=${projectId}`,
    options || {}
  );
  return result;
};

/**
 * Get S3 Tables modeling status for a pipeline
 * Requirements: 12.2
 * 
 * @param projectId - The project ID
 * @param pipelineId - The pipeline ID
 * @returns Promise with the modeling status
 */
const getS3TablesModelingStatus = async (
  projectId: string,
  pipelineId: string
) => {
  const result: any = await apiRequest(
    'get',
    `/pipeline/${pipelineId}/s3tables-modeling/status?pid=${projectId}`
  );
  return result;
};

/**
 * Get S3 Tables modeling job history
 * Requirements: 12.3
 * 
 * @param projectId - The project ID
 * @param pipelineId - The pipeline ID
 * @param limit - Maximum number of jobs to return (default: 10)
 * @returns Promise with the job history
 */
const getS3TablesModelingJobs = async (
  projectId: string,
  pipelineId: string,
  limit = 10
) => {
  const result: any = await apiRequest(
    'get',
    `/pipeline/${pipelineId}/s3tables-modeling/jobs?pid=${projectId}&limit=${limit}`
  );
  return result;
};

export {
  triggerS3TablesModeling,
  getS3TablesModelingStatus,
  getS3TablesModelingJobs,
};
