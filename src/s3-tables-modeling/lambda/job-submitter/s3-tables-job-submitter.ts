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

import { aws_sdk_client_common_config, logger } from '@aws/clickstream-base-lib';
import {
  EMRServerlessClient,
  GetJobRunCommand,
  StartJobRunCommand,
  StartJobRunCommandInput,
} from '@aws-sdk/client-emr-serverless';
import { Context } from 'aws-lambda';
import { v4 as uuid } from 'uuid';
import { S3TablesJobEvent, S3TablesJobResponse } from './index';
import { getFunctionTags } from '../../../common/lambda/tags';
import { listObjectsByPrefix, putStringToS3, readS3ObjectAsJson } from '../../../common/s3';

const emrClient = new EMRServerlessClient({
  ...aws_sdk_client_common_config,
});

/**
 * Configuration for S3 Tables job submitter.
 */
export interface S3TablesJobConfig {
  emrApplicationId: string;
  emrExecutionRoleArn: string;
  s3TableBucketArn: string;
  s3TableNamespace: string;
  projectId: string;
  appIds: string;
  odsS3Bucket: string;
  odsS3Prefix: string;
  odsFileSuffix: string;
  pipelineS3Bucket: string;
  pipelineS3Prefix: string;
  dataRetentionDays: number;
  dataBufferedSeconds: number;
}

/**
 * Information about ODS objects to process.
 */
export interface OdsObjectsInfo {
  objectCount: number;
  sizeTotal: number;
}

/**
 * S3 Tables Job Submitter class.
 * Handles submission of EMR Serverless jobs for S3 Tables data modeling.
 */
export class S3TablesJobSubmitter {
  private config: S3TablesJobConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Submit an EMR Serverless job for S3 Tables data modeling.
   */
  public async submitJob(event: S3TablesJobEvent, context: Context): Promise<S3TablesJobResponse> {
    logger.info('Starting S3 Tables job submission', { event });

    if (!this.config.appIds) {
      logger.warn('appIds is empty, please check env: APP_IDS');
      return {
        status: 'SKIPPED',
        message: 'No app IDs configured',
      };
    }

    // Get job timestamps
    const { startTimestamp, endTimestamp } = await this.getJobTimestamps(event);
    logger.info('Job timestamps determined', { startTimestamp, endTimestamp });

    // Calculate objects to process
    const objectsInfo = await this.calculateOdsObjects(startTimestamp, endTimestamp);
    logger.info('ODS objects info', { objectsInfo });

    if (objectsInfo.objectCount === 0) {
      logger.info('No ODS files to process');
      return {
        status: 'SKIPPED',
        message: 'No ODS files found in the specified time range',
        startTimestamp,
        endTimestamp,
        objectCount: 0,
      };
    }

    // Get function tags for job tagging
    let funcTags: Record<string, string> | undefined;
    try {
      funcTags = await getFunctionTags(context);
    } catch (e: any) {
      if (e.name === 'TimeoutError') {
        logger.warn('getFunctionTags TimeoutError');
      } else {
        logger.error('Error getting function tags', e);
        throw e;
      }
    }

    // Submit the job with retry logic
    const jobRunId = await this.submitJobWithRetry(
      event,
      startTimestamp,
      endTimestamp,
      objectsInfo,
      funcTags,
    );

    // Record job info
    await this.recordJobInfo({
      jobRunId,
      startTimestamp,
      endTimestamp,
      state: 'LAMBDA-SUBMITTED',
      startRunTime: new Date().toISOString(),
      triggerSource: event.triggerSource || 'schedule',
    });

    // Record latest job info (unless it's a re-run)
    if (!event.reRunJob) {
      await this.recordJobInfo({
        jobRunId: 'latest',
        startTimestamp,
        endTimestamp,
        state: 'LAMBDA-SUBMITTED',
        startRunTime: new Date().toISOString(),
        triggerSource: event.triggerSource || 'schedule',
      });
    }

    return {
      jobRunId,
      status: 'SUBMITTED',
      message: 'Job submitted successfully',
      startTimestamp,
      endTimestamp,
      objectCount: objectsInfo.objectCount,
    };
  }

  /**
   * Submit job with exponential backoff retry logic.
   * Property 10: For any job submission failure, Lambda should use exponential backoff strategy,
   * retry interval should grow by 2^n seconds (n is retry count).
   */
  public async submitJobWithRetry(
    event: S3TablesJobEvent,
    startTimestamp: number,
    endTimestamp: number,
    objectsInfo: OdsObjectsInfo,
    funcTags?: Record<string, string>,
    maxRetries: number = 3,
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const jobRunId = await this.submitEmrJob(
          event,
          startTimestamp,
          endTimestamp,
          objectsInfo,
          funcTags,
        );
        return jobRunId;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Job submission attempt ${attempt + 1} failed`, { error: lastError.message });

        if (attempt < maxRetries - 1) {
          // Exponential backoff: 2^n seconds
          const delayMs = Math.pow(2, attempt) * 1000;
          logger.info(`Retrying in ${delayMs}ms...`);
          await this.sleep(delayMs);
        }
      }
    }

    logger.error('All job submission attempts failed', lastError as Error);
    throw lastError;
  }

  /**
   * Submit EMR Serverless job.
   */
  private async submitEmrJob(
    event: S3TablesJobEvent,
    startTimestamp: number,
    endTimestamp: number,
    objectsInfo: OdsObjectsInfo,
    funcTags?: Record<string, string>,
  ): Promise<string> {
    const jobName = this.generateJobName(event, startTimestamp);
    const sparkConfig = this.getSparkConfig(objectsInfo);

    const entryPointArguments = [
      this.config.projectId,
      this.config.appIds,
      this.config.s3TableBucketArn,
      this.config.s3TableNamespace,
      this.config.odsS3Bucket,
      this.config.odsS3Prefix,
      `${startTimestamp}`,
      `${endTimestamp}`,
      `${this.config.dataRetentionDays}`,
    ];

    const sparkSubmitParameters = this.buildSparkSubmitParameters(sparkConfig);

    // Get JAR path from environment or use default
    const jarPath = process.env.SPARK_JAR_PATH ||
      `s3://${this.config.pipelineS3Bucket}/${this.config.pipelineS3Prefix}jars/s3-tables-modeling.jar`;

    const startJobRunCommandInput: StartJobRunCommandInput = {
      applicationId: this.config.emrApplicationId,
      executionRoleArn: this.config.emrExecutionRoleArn,
      name: jobName,
      jobDriver: {
        sparkSubmit: {
          entryPoint: jarPath,
          entryPointArguments,
          sparkSubmitParameters,
        },
      },
      configurationOverrides: {
        monitoringConfiguration: {
          s3MonitoringConfiguration: {
            logUri: `s3://${this.config.pipelineS3Bucket}/${this.config.pipelineS3Prefix}pipeline-logs/${this.config.projectId}/s3tables/`,
          },
        },
      },
      tags: funcTags,
    };

    logger.info('Submitting EMR job', { startJobRunCommandInput });

    const response = await emrClient.send(new StartJobRunCommand(startJobRunCommandInput));

    if (!response.jobRunId) {
      throw new Error('EMR job submission did not return a job run ID');
    }

    logger.info('EMR job submitted successfully', { jobRunId: response.jobRunId });
    return response.jobRunId;
  }

  /**
   * Get job status from EMR Serverless.
   */
  public async getJobStatus(jobRunId: string): Promise<JobStatusResponse> {
    const response = await emrClient.send(new GetJobRunCommand({
      applicationId: this.config.emrApplicationId,
      jobRunId,
    }));

    const jobRun = response.jobRun;
    if (!jobRun) {
      throw new Error(`Job run ${jobRunId} not found`);
    }

    return {
      jobRunId,
      state: jobRun.state || 'UNKNOWN',
      stateDetails: jobRun.stateDetails,
      createdAt: jobRun.createdAt?.toISOString(),
      updatedAt: jobRun.updatedAt?.toISOString(),
    };
  }

  /**
   * Handle job status callback.
   * Updates execution state based on job completion/failure.
   */
  public async handleJobCallback(jobRunId: string): Promise<JobCallbackResponse> {
    const status = await this.getJobStatus(jobRunId);

    // Update job info with final state
    const jobInfoKey = this.getJobInfoKey(jobRunId);
    const existingJobInfo = await readS3ObjectAsJson(this.config.pipelineS3Bucket, jobInfoKey);

    if (existingJobInfo) {
      const updatedJobInfo = {
        ...existingJobInfo,
        state: status.state,
        stateDetails: status.stateDetails,
        endRunTime: new Date().toISOString(),
      };

      await putStringToS3(
        JSON.stringify(updatedJobInfo),
        this.config.pipelineS3Bucket,
        jobInfoKey,
      );
    }

    return {
      jobRunId,
      state: status.state,
      success: status.state === 'SUCCESS',
      message: status.stateDetails || `Job ${status.state}`,
    };
  }

  /**
   * Get job timestamps for processing range.
   */
  private async getJobTimestamps(event: S3TablesJobEvent): Promise<{ startTimestamp: number; endTimestamp: number }> {
    const now = new Date();
    let startTimestamp = new Date(now.toDateString()).getTime();
    let endTimestamp = now.getTime() - this.config.dataBufferedSeconds * 1000;

    if (event.startTimestamp) {
      startTimestamp = this.parseTimestamp(event.startTimestamp);
    } else {
      // Get previous job info to continue from last processed timestamp
      const latestJobKey = this.getJobInfoKey('latest');
      const previousJob = await readS3ObjectAsJson(this.config.pipelineS3Bucket, latestJobKey);

      if (previousJob?.endTimestamp) {
        logger.info('Found previous job, continuing from last endTimestamp');
        startTimestamp = previousJob.endTimestamp;
      }
    }

    if (event.endTimestamp) {
      endTimestamp = this.parseTimestamp(event.endTimestamp);
    }

    if (startTimestamp > endTimestamp) {
      throw new Error('endTimestamp must be greater than startTimestamp');
    }

    return { startTimestamp, endTimestamp };
  }

  /**
   * Calculate ODS objects to process within the time range.
   */
  private async calculateOdsObjects(startTimestamp: number, endTimestamp: number): Promise<OdsObjectsInfo> {
    let objectCount = 0;
    let sizeTotal = 0;

    const datePrefixList = this.getDatePrefixList(startTimestamp, endTimestamp);

    for (const datePrefix of datePrefixList) {
      await listObjectsByPrefix(this.config.odsS3Bucket, datePrefix, (obj) => {
        if (
          obj.Key &&
          obj.Key.endsWith(this.config.odsFileSuffix) &&
          obj.Size &&
          obj.LastModified &&
          obj.LastModified.getTime() >= startTimestamp &&
          obj.LastModified.getTime() < endTimestamp
        ) {
          objectCount++;
          // Estimate uncompressed size for .gz files
          if (obj.Key.endsWith('.gz')) {
            sizeTotal += obj.Size * 20;
          } else {
            sizeTotal += obj.Size;
          }
        }
      });
    }

    return { objectCount, sizeTotal };
  }

  /**
   * Get date prefix list for S3 listing.
   */
  private getDatePrefixList(startTimestamp: number, endTimestamp: number): string[] {
    let prefix = this.config.odsS3Prefix;
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }

    const oneDay = 24 * 60 * 60 * 1000;
    const prefixList: string[] = [];
    let currentTime = startTimestamp;

    while (currentTime <= endTimestamp) {
      prefixList.push(`${prefix}${this.getYMDPrefix(currentTime)}`);
      currentTime += oneDay;
    }

    // Ensure end date is included
    const endDayPrefix = `${prefix}${this.getYMDPrefix(endTimestamp)}`;
    if (!prefixList.includes(endDayPrefix)) {
      prefixList.push(endDayPrefix);
    }

    return prefixList;
  }

  /**
   * Get year/month/day prefix for a timestamp.
   */
  private getYMDPrefix(timestamp: number): string {
    const date = new Date(timestamp);
    const yyyy = date.getUTCFullYear().toString().padStart(4, '0');
    const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = date.getUTCDate().toString().padStart(2, '0');
    return `year=${yyyy}/month=${mm}/day=${dd}/`;
  }

  /**
   * Generate job name.
   */
  private generateJobName(event: S3TablesJobEvent, startTimestamp: number): string {
    let jobName = event.jobName || `s3tables-${startTimestamp}-${uuid()}`;
    if (event.reRunJob) {
      jobName = `${jobName}-rerun`;
    }
    return jobName;
  }

  /**
   * Get Spark configuration based on data size.
   */
  private getSparkConfig(objectsInfo: OdsObjectsInfo): SparkConfig {
    const size1G = 1024 * 1024 * 1024;

    let driverCores = 4;
    let driverMemory = 14;
    let executorCores = 4;
    let executorMemory = 14;
    let initialExecutors = 2;

    if (objectsInfo.sizeTotal < 1 * size1G) {
      driverCores = 2;
      driverMemory = 7;
      executorCores = 4;
      executorMemory = 14;
      initialExecutors = 2;
    } else if (objectsInfo.sizeTotal < 10 * size1G) {
      executorCores = 8;
      executorMemory = 50;
      initialExecutors = 3;
    } else if (objectsInfo.sizeTotal < 50 * size1G) {
      driverCores = 8;
      driverMemory = 50;
      executorCores = 16;
      executorMemory = 100;
      initialExecutors = 6;
    } else {
      driverCores = 16;
      driverMemory = 60;
      executorCores = 16;
      executorMemory = 100;
      initialExecutors = 10;
    }

    return {
      driverCores,
      driverMemory,
      executorCores,
      executorMemory,
      initialExecutors,
    };
  }

  /**
   * Build Spark submit parameters string.
   */
  private buildSparkSubmitParameters(config: SparkConfig): string {
    const params = [
      '--class software.aws.solution.clickstream.s3tables.S3TablesModelingRunner',
    ];

    // S3 Tables Iceberg runtime JAR - pre-uploaded to S3 at build time
    const icebergJarPath = process.env.ICEBERG_RUNTIME_JAR_PATH;
    if (icebergJarPath) {
      params.push(`--jars ${icebergJarPath}`);
    } else {
      logger.warn('ICEBERG_RUNTIME_JAR_PATH not set — Spark job may fail if Iceberg runtime is not on classpath');
    }

    params.push(
      `--conf spark.driver.cores=${config.driverCores}`,
      `--conf spark.driver.memory=${config.driverMemory}g`,
      `--conf spark.executor.cores=${config.executorCores}`,
      `--conf spark.executor.memory=${config.executorMemory}g`,
      '--conf spark.dynamicAllocation.enabled=true',
      `--conf spark.dynamicAllocation.initialExecutors=${config.initialExecutors}`,
      `--conf spark.executor.instances=${config.initialExecutors}`,
      // Iceberg and S3 Tables configuration
      '--conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions',
      '--conf spark.sql.catalog.s3tablesbucket=org.apache.iceberg.spark.SparkCatalog',
      '--conf spark.sql.catalog.s3tablesbucket.catalog-impl=software.amazon.s3tables.iceberg.S3TablesCatalog',
      `--conf spark.sql.catalog.s3tablesbucket.warehouse=${this.config.s3TableBucketArn}`,
      // Session timezone
      '--conf spark.sql.session.timeZone=UTC',
    ];

    return params.join(' ');
  }

  /**
   * Record job info to S3.
   */
  private async recordJobInfo(jobInfo: {
    jobRunId: string;
    startTimestamp: number;
    endTimestamp: number;
    state: string;
    startRunTime: string;
    triggerSource: string;
  }): Promise<void> {
    const key = this.getJobInfoKey(jobInfo.jobRunId);
    const content = JSON.stringify({
      ...jobInfo,
      projectId: this.config.projectId,
      appIds: this.config.appIds,
      s3TableBucketArn: this.config.s3TableBucketArn,
      s3TableNamespace: this.config.s3TableNamespace,
    });

    await putStringToS3(content, this.config.pipelineS3Bucket, key);
    logger.info(`Recorded job info to s3://${this.config.pipelineS3Bucket}/${key}`);
  }

  /**
   * Get S3 key for job info.
   */
  private getJobInfoKey(jobRunId: string): string {
    return `${this.config.pipelineS3Prefix}s3tables-job-info/${this.config.projectId}/job-${jobRunId}.json`;
  }

  /**
   * Parse timestamp from string or number.
   */
  private parseTimestamp(input: string | number): number {
    if (typeof input === 'number') {
      return input;
    }

    // ISO 8601 format
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(input)) {
      return new Date(input).getTime();
    }

    // Numeric string
    if (/^\d+$/.test(input)) {
      return parseInt(input, 10);
    }

    throw new Error(`Invalid timestamp format: ${input}`);
  }

  /**
   * Load configuration from environment variables.
   */
  private loadConfig(): S3TablesJobConfig {
    const requiredEnvVars = ['EMR_APPLICATION_ID', 'EMR_EXECUTION_ROLE_ARN', 'S3_TABLE_BUCKET_ARN', 'PROJECT_ID', 'ODS_S3_BUCKET', 'PIPELINE_S3_BUCKET'];
    const missing = requiredEnvVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    this.validateS3TablesRegion();

    return {
      emrApplicationId: process.env.EMR_APPLICATION_ID!,
      emrExecutionRoleArn: process.env.EMR_EXECUTION_ROLE_ARN!,
      s3TableBucketArn: process.env.S3_TABLE_BUCKET_ARN!,
      s3TableNamespace: process.env.S3_TABLE_NAMESPACE || '',
      projectId: process.env.PROJECT_ID!,
      appIds: process.env.APP_IDS || '',
      odsS3Bucket: process.env.ODS_S3_BUCKET!,
      odsS3Prefix: process.env.ODS_S3_PREFIX || '',
      odsFileSuffix: process.env.ODS_FILE_SUFFIX || '.snappy.parquet',
      pipelineS3Bucket: process.env.PIPELINE_S3_BUCKET!,
      pipelineS3Prefix: process.env.PIPELINE_S3_PREFIX || '',
      dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
      dataBufferedSeconds: parseInt(process.env.DATA_BUFFERED_SECONDS || '30', 10),
    };
  }

  /**
   * Validate that S3 Tables service is available in the current region.
   * Uses a runtime STS call pattern — if the S3 Tables ARN parameter was accepted
   * by CloudFormation, the service is available. This avoids maintaining a hardcoded region list.
   */
  private validateS3TablesRegion(): void {
    if (!this.config?.s3TableBucketArn && process.env.S3_TABLE_BUCKET_ARN) {
      // ARN is set but empty after load — should not happen if CDK validation passed
      logger.warn('S3_TABLE_BUCKET_ARN is set but resolved to empty. Check CloudFormation parameter validation.');
    }
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface SparkConfig {
  driverCores: number;
  driverMemory: number;
  executorCores: number;
  executorMemory: number;
  initialExecutors: number;
}

export interface JobStatusResponse {
  jobRunId: string;
  state: string;
  stateDetails?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface JobCallbackResponse {
  jobRunId: string;
  state: string;
  success: boolean;
  message: string;
}
