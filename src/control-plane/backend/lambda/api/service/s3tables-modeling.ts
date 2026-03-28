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

import { aws_sdk_client_common_config } from '@aws/clickstream-base-lib';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { PipelineStackType } from '../common/model-ln';
import { logger } from '../common/powertools';
import { ApiFail, ApiSuccess, BucketPrefix } from '../common/types';
import { getStackOutputFromPipelineStatus, isEmpty, getBucketPrefix } from '../common/utils';
import { IPipeline } from '../model/pipeline';
import { ClickStreamStore } from '../store/click-stream-store';
import { DynamoDbStore } from '../store/dynamodb/dynamodb-store';

// Output constants for S3 Tables Modeling Stack
// These must match the output logical IDs in s3-tables-modeling-stack.ts
const OUTPUT_S3_TABLES_MODELING_EMR_APPLICATION_ID = 'S3TablesModelingEMRApplicationId';
const OUTPUT_S3_TABLES_MODELING_JOB_SUBMITTER_FUNCTION_ARN = 'S3TablesModelingJobSubmitterFunctionArn';

const store: ClickStreamStore = new DynamoDbStore();
const lambdaClient = new LambdaClient({
  ...aws_sdk_client_common_config,
});
const s3Client = new S3Client({
  ...aws_sdk_client_common_config,
});

/**
 * S3 Tables job trigger event structure
 */
export interface S3TablesJobTriggerEvent {
  startTimestamp?: string | number;
  endTimestamp?: string | number;
  jobName?: string;
  reRunJob?: boolean;
  triggerSource: 'schedule' | 'api' | 'manual';
}

/**
 * S3 Tables job response structure
 */
export interface S3TablesJobResponse {
  jobRunId?: string;
  status: 'SUBMITTED' | 'SKIPPED' | 'FAILED';
  message: string;
  startTimestamp?: number;
  endTimestamp?: number;
  objectCount?: number;
}

/**
 * S3 Tables modeling status
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
 * S3 Tables job history item
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

export class S3TablesModelingService {
  /**
   * Trigger a new S3 Tables data modeling job
   * Requirements: 7.2, 7.5, 6.6
   */
  public async trigger(req: any, res: any, next: any) {
    try {
      const { id } = req.params;
      const { pid } = req.query;
      const operator = res.get('X-Click-Stream-Operator') ?? '';

      logger.info('Triggering S3 Tables modeling job', { pipelineId: id, projectId: pid, operator });

      // Get pipeline
      const pipeline = await this.getPipelineWithS3TablesConfig(pid, id);
      if (!pipeline) {
        return res.status(404).json(new ApiFail('Pipeline not found'));
      }

      // Check if S3 Tables modeling is enabled
      if (isEmpty(pipeline.dataModeling?.s3Tables)) {
        return res.status(400).json(new ApiFail('S3 Tables modeling is not enabled for this pipeline'));
      }

      // Get Lambda function ARN from stack outputs
      const jobSubmitterFunctionArn = getStackOutputFromPipelineStatus(
        pipeline.stackDetails ?? pipeline.status?.stackDetails,
        PipelineStackType.DATA_MODELING_S3_TABLES,
        OUTPUT_S3_TABLES_MODELING_JOB_SUBMITTER_FUNCTION_ARN,
      );

      if (!jobSubmitterFunctionArn) {
        return res.status(400).json(new ApiFail('S3 Tables modeling stack is not deployed or job submitter function not found'));
      }

      // Prepare trigger event
      const triggerEvent: S3TablesJobTriggerEvent = {
        triggerSource: 'api',
        ...req.body,
      };

      // Invoke Lambda function
      const response = await this.invokeLambda(jobSubmitterFunctionArn, triggerEvent);

      logger.info('S3 Tables modeling job triggered', { response, operator });

      return res.status(201).json(new ApiSuccess(response, 'S3 Tables modeling job triggered.'));
    } catch (error) {
      logger.error('Failed to trigger S3 Tables modeling job', error as Error);
      next(error);
    }
  }

  /**
   * Get S3 Tables modeling status for a pipeline
   * Requirements: 7.3
   */
  public async getStatus(req: any, res: any, next: any) {
    try {
      const { id } = req.params;
      const { pid } = req.query;

      logger.info('Getting S3 Tables modeling status', { pipelineId: id, projectId: pid });

      // Get pipeline
      const pipeline = await this.getPipelineWithS3TablesConfig(pid, id);
      if (!pipeline) {
        return res.status(404).json(new ApiFail('Pipeline not found'));
      }

      const status = this.buildModelingStatus(pipeline);

      return res.json(new ApiSuccess(status));
    } catch (error) {
      logger.error('Failed to get S3 Tables modeling status', error as Error);
      next(error);
    }
  }

  /**
   * Get S3 Tables modeling job history
   * Requirements: 7.4
   */
  public async getJobs(req: any, res: any, next: any) {
    try {
      const { id } = req.params;
      const { pid, limit } = req.query;

      logger.info('Getting S3 Tables modeling jobs', { pipelineId: id, projectId: pid });

      // Get pipeline
      const pipeline = await this.getPipelineWithS3TablesConfig(pid, id);
      if (!pipeline) {
        return res.status(404).json(new ApiFail('Pipeline not found'));
      }

      // Check if S3 Tables modeling is enabled
      if (isEmpty(pipeline.dataModeling?.s3Tables)) {
        return res.status(400).json(new ApiFail('S3 Tables modeling is not enabled for this pipeline'));
      }

      // Get job history from S3
      const jobs = await this.getJobHistoryFromS3(pipeline, parseInt(limit) || 10);

      return res.json(new ApiSuccess({
        totalCount: jobs.length,
        items: jobs,
      }));
    } catch (error) {
      logger.error('Failed to get S3 Tables modeling jobs', error as Error);
      next(error);
    }
  }

  /**
   * Get job history from S3
   * Job info files are stored at: s3://{pipelineS3Bucket}/{pipelineS3Prefix}s3tables-job-info/{projectId}/job-{jobRunId}.json
   *
   * Note: The S3 bucket and prefix should match what's configured in the S3 Tables Modeling Stack.
   * The stack uses dataProcessing.pipelineBucket if available, otherwise falls back to pipeline.bucket.
   */
  private async getJobHistoryFromS3(pipeline: IPipeline, limit: number): Promise<S3TablesJobHistoryItem[]> {
    const jobs: S3TablesJobHistoryItem[] = [];

    try {
      // Use the same bucket resolution logic as CS3TablesModelingStack
      // Priority: dataProcessing.pipelineBucket > pipeline.bucket
      const pipelineS3Bucket = pipeline.dataProcessing?.pipelineBucket?.name ?? pipeline.bucket?.name;
      const pipelineS3Prefix = this.getPipelineS3Prefix(pipeline);
      const projectId = pipeline.projectId;

      if (!pipelineS3Bucket || !projectId) {
        logger.warn('Missing pipeline S3 bucket or project ID');
        return jobs;
      }

      const jobInfoPrefix = `${pipelineS3Prefix}s3tables-job-info/${projectId}/`;

      // List job info files
      const listCommand = new ListObjectsV2Command({
        Bucket: pipelineS3Bucket,
        Prefix: jobInfoPrefix,
        MaxKeys: limit + 1, // +1 to exclude 'latest' file
      });

      const listResponse = await s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return jobs;
      }

      // Sort by LastModified descending to get most recent jobs first
      const sortedObjects = listResponse.Contents
        .filter(obj => obj.Key && !obj.Key.endsWith('job-latest.json'))
        .sort((a, b) => {
          const timeA = a.LastModified?.getTime() || 0;
          const timeB = b.LastModified?.getTime() || 0;
          return timeB - timeA;
        })
        .slice(0, limit);

      // Read each job info file
      for (const obj of sortedObjects) {
        if (!obj.Key) continue;

        try {
          const getCommand = new GetObjectCommand({
            Bucket: pipelineS3Bucket,
            Key: obj.Key,
          });

          const getResponse = await s3Client.send(getCommand);
          const bodyString = await getResponse.Body?.transformToString();

          if (bodyString) {
            const jobInfo = JSON.parse(bodyString);
            jobs.push({
              jobRunId: jobInfo.jobRunId,
              state: jobInfo.state,
              startTimestamp: jobInfo.startTimestamp,
              endTimestamp: jobInfo.endTimestamp,
              startRunTime: jobInfo.startRunTime,
              endRunTime: jobInfo.endRunTime,
              triggerSource: jobInfo.triggerSource,
            });
          }
        } catch (readError) {
          logger.warn('Failed to read job info file', { key: obj.Key, error: readError });
        }
      }
    } catch (error) {
      logger.error('Failed to list job history from S3', error as Error);
    }

    return jobs;
  }

  /**
   * Get pipeline with S3 Tables configuration
   */
  private async getPipelineWithS3TablesConfig(projectId: string, pipelineId: string): Promise<IPipeline | undefined> {
    const pipelines = await store.listPipeline(projectId, 'latest', 'asc');
    if (pipelines.length === 0) {
      return undefined;
    }

    const pipeline = pipelines.find(p => p.pipelineId === pipelineId);
    return pipeline;
  }

  /**
   * Get pipeline S3 prefix for job info storage.
   * Uses the same getBucketPrefix() as CS3TablesModelingStack.PipelineS3Prefix
   * to guarantee path consistency between Lambda writer and API reader.
   */
  private getPipelineS3Prefix(pipeline: IPipeline): string {
    return getBucketPrefix(
      pipeline.projectId || '',
      BucketPrefix.DATA_PIPELINE_TEMP,
      pipeline.dataProcessing?.pipelineBucket?.prefix,
    );
  }

  /**
   * Build modeling status from pipeline
   */
  private buildModelingStatus(pipeline: IPipeline): S3TablesModelingStatus {
    const s3TablesConfig = pipeline.dataModeling?.s3Tables;

    if (isEmpty(s3TablesConfig)) {
      return {
        enabled: false,
      };
    }

    // Get EMR Application ID from stack outputs
    const emrApplicationId = getStackOutputFromPipelineStatus(
      pipeline.stackDetails ?? pipeline.status?.stackDetails,
      PipelineStackType.DATA_MODELING_S3_TABLES,
      OUTPUT_S3_TABLES_MODELING_EMR_APPLICATION_ID,
    );

    return {
      enabled: true,
      tableBucketArn: s3TablesConfig!.tableBucketArn,
      namespace: s3TablesConfig!.namespace,
      scheduleExpression: s3TablesConfig!.scheduleExpression,
      dataRetentionDays: s3TablesConfig!.dataRetentionDays,
      emrApplicationId: emrApplicationId || undefined,
    };
  }

  /**
   * Invoke Lambda function to trigger job
   */
  private async invokeLambda(functionArn: string, event: S3TablesJobTriggerEvent): Promise<S3TablesJobResponse> {
    const command = new InvokeCommand({
      FunctionName: functionArn,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(event)),
    });

    const response = await lambdaClient.send(command);

    if (response.FunctionError) {
      const errorPayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : {};
      throw new Error(`Lambda invocation failed: ${errorPayload.errorMessage || response.FunctionError}`);
    }

    if (!response.Payload) {
      throw new Error('Lambda invocation returned no payload');
    }

    const payload = JSON.parse(Buffer.from(response.Payload).toString());
    return payload as S3TablesJobResponse;
  }
}
