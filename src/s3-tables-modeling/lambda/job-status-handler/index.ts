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
import { EventBridgeEvent } from 'aws-lambda';
import { putStringToS3, readS3ObjectAsJson } from '../../../common/s3';

/**
 * EMR Serverless Job Run State Change event detail
 */
interface EMRServerlessJobStateChangeDetail {
  applicationId: string;
  jobRunId: string;
  state: string;
  stateDetails?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Handler for EMR Serverless job state change events.
 * Updates job info in S3 when job completes, fails, or is cancelled.
 *
 * Issue 2.2: EMR Serverless job status listener
 */
export const handler = async (
  event: EventBridgeEvent<'EMR Serverless Job Run State Change', EMRServerlessJobStateChangeDetail>,
): Promise<void> => {
  logger.info('Received EMR Serverless job state change event', { event });

  const { jobRunId, state, stateDetails } = event.detail;
  const pipelineS3Bucket = process.env.PIPELINE_S3_BUCKET;
  const pipelineS3Prefix = process.env.PIPELINE_S3_PREFIX || '';
  const projectId = process.env.PROJECT_ID;

  if (!pipelineS3Bucket || !projectId) {
    logger.error('Missing required environment variables: PIPELINE_S3_BUCKET or PROJECT_ID');
    throw new Error('Missing required environment variables: PIPELINE_S3_BUCKET or PROJECT_ID');
  }

  const jobInfoKey = `${pipelineS3Prefix}s3tables-job-info/${projectId}/job-${jobRunId}.json`;

  try {
    // Read existing job info
    const existingJobInfo = await readS3ObjectAsJson(pipelineS3Bucket, jobInfoKey);

    if (!existingJobInfo) {
      logger.warn('Job info not found, creating new record', { jobRunId });
    }

    // Update job info with final state
    const updatedJobInfo = {
      ...existingJobInfo,
      jobRunId,
      state,
      stateDetails: stateDetails || `Job ${state}`,
      endRunTime: new Date().toISOString(),
    };

    await putStringToS3(
      JSON.stringify(updatedJobInfo),
      pipelineS3Bucket,
      jobInfoKey,
    );

    logger.info('Job info updated successfully', { jobRunId, state });

    // Update the latest marker — only if this job is newer than the current latest
    if (existingJobInfo?.jobRunId !== 'latest') {
      const latestJobKey = `${pipelineS3Prefix}s3tables-job-info/${projectId}/job-latest.json`;
      const latestJobInfo = await readS3ObjectAsJson(pipelineS3Bucket, latestJobKey);

      const thisEndTs = existingJobInfo?.endTimestamp || 0;
      const latestEndTs = latestJobInfo?.endTimestamp || 0;

      // Only update if this job covers a newer or equal time range
      if (thisEndTs >= latestEndTs) {
        const updatedLatestInfo = {
          ...updatedJobInfo,
          endRunTime: new Date().toISOString(),
        };

        await putStringToS3(
          JSON.stringify(updatedLatestInfo),
          pipelineS3Bucket,
          latestJobKey,
        );

        logger.info('Latest job info updated', { state, thisEndTs, latestEndTs });
      }
    }
  } catch (error) {
    logger.error('Failed to update job info', error as Error);
    throw error;
  }
};
