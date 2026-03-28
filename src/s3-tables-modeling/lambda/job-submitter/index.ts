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

import { logger } from '@aws/clickstream-base-lib';
import { Context } from 'aws-lambda';
import { S3TablesJobSubmitter } from './s3-tables-job-submitter';

/**
 * Lambda handler for S3 Tables data modeling job submission.
 * This function is triggered by EventBridge schedule or manual API invocation.
 */
export const handler = async (event: S3TablesJobEvent, context: Context): Promise<S3TablesJobResponse> => {
  logger.info('S3 Tables Job Submitter triggered', { event, requestId: context.awsRequestId });

  try {
    const submitter = new S3TablesJobSubmitter();
    const result = await submitter.submitJob(event, context);

    logger.info('Job submission completed', { result });
    return result;
  } catch (error) {
    logger.error('Failed to submit S3 Tables modeling job', error as Error);
    throw error;
  }
};

/**
 * Event structure for S3 Tables job submission.
 */
export interface S3TablesJobEvent {
  /** Optional start timestamp for data processing range */
  startTimestamp?: string | number;
  /** Optional end timestamp for data processing range */
  endTimestamp?: string | number;
  /** Optional job name override */
  jobName?: string;
  /** Flag indicating if this is a re-run of a previous job */
  reRunJob?: boolean;
  /** Source of the trigger: 'schedule' | 'api' | 'manual' */
  triggerSource?: 'schedule' | 'api' | 'manual';
}

/**
 * Response structure for S3 Tables job submission.
 */
export interface S3TablesJobResponse {
  /** EMR Serverless job run ID */
  jobRunId?: string;
  /** Status of the submission */
  status: 'SUBMITTED' | 'SKIPPED' | 'FAILED';
  /** Message describing the result */
  message: string;
  /** Start timestamp used for the job */
  startTimestamp?: number;
  /** End timestamp used for the job */
  endTimestamp?: number;
  /** Number of ODS files to process */
  objectCount?: number;
}
