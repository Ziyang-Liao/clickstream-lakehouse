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
  Box,
  Button,
  ColumnLayout,
  Link,
  SpaceBetween,
  StatusIndicator,
  Table,
  Alert,
} from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExecutionType } from 'ts/const';
import {
  buildRedshiftLink,
  buildSFNExecutionLink,
  buildSecurityGroupLink,
  buildSubnetLink,
  buildVPCLink,
} from 'ts/url';
import { defaultStr, getLocaleLngDescription, ternary } from 'ts/utils';
import {
  getS3TablesModelingStatus,
  getS3TablesModelingJobs,
  triggerS3TablesModeling,
  S3TablesModelingStatus,
  S3TablesJobHistoryItem,
} from 'apis/s3tables-modeling';

interface TabContentProps {
  displayPipelineExtend: boolean;
  pipelineInfo?: IExtPipeline;
  pipelineExtend?: IPipelineExtend;
}
const Processing: React.FC<TabContentProps> = (props: TabContentProps) => {
  const { pipelineInfo, pipelineExtend, displayPipelineExtend } = props;
  const { t } = useTranslation();

  // S3 Tables modeling state
  const [s3TablesStatus, setS3TablesStatus] = useState<S3TablesModelingStatus | null>(null);
  const [s3TablesJobs, setS3TablesJobs] = useState<S3TablesJobHistoryItem[]>([]);
  const [loadingS3TablesStatus, setLoadingS3TablesStatus] = useState(false);
  const [loadingS3TablesJobs, setLoadingS3TablesJobs] = useState(false);
  const [triggeringJob, setTriggeringJob] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null);

  // Load S3 Tables modeling status and jobs
  useEffect(() => {
    if (pipelineInfo?.pipelineId && pipelineInfo?.dataModeling?.s3Tables) {
      loadS3TablesStatus();
      loadS3TablesJobs();
    }
  }, [pipelineInfo?.pipelineId, pipelineInfo?.dataModeling?.s3Tables]);

  const loadS3TablesStatus = async () => {
    if (!pipelineInfo?.projectId || !pipelineInfo?.pipelineId) return;
    setLoadingS3TablesStatus(true);
    try {
      const response = await getS3TablesModelingStatus(
        pipelineInfo.projectId,
        pipelineInfo.pipelineId
      );
      if (response.success) {
        setS3TablesStatus(response.data);
      }
    } catch (error) {
      console.error('Failed to load S3 Tables status:', error);
    } finally {
      setLoadingS3TablesStatus(false);
    }
  };

  const loadS3TablesJobs = async () => {
    if (!pipelineInfo?.projectId || !pipelineInfo?.pipelineId) return;
    setLoadingS3TablesJobs(true);
    try {
      const response = await getS3TablesModelingJobs(
        pipelineInfo.projectId,
        pipelineInfo.pipelineId,
        10
      );
      if (response.success && response.data?.items) {
        setS3TablesJobs(response.data.items);
      }
    } catch (error) {
      console.error('Failed to load S3 Tables jobs:', error);
    } finally {
      setLoadingS3TablesJobs(false);
    }
  };

  const handleTriggerS3TablesJob = async () => {
    if (!pipelineInfo?.projectId || !pipelineInfo?.pipelineId) return;
    setTriggeringJob(true);
    setTriggerError(null);
    setTriggerSuccess(null);
    try {
      const response = await triggerS3TablesModeling(
        pipelineInfo.projectId,
        pipelineInfo.pipelineId
      );
      if (response.success) {
        setTriggerSuccess(t('pipeline:detail.s3TablesJobTriggered') || 'Job triggered successfully');
        // Reload jobs after triggering
        setTimeout(() => {
          loadS3TablesJobs();
          loadS3TablesStatus();
        }, 2000);
      } else {
        setTriggerError(response.message || 'Failed to trigger job');
      }
    } catch (error: any) {
      setTriggerError(error.message || 'Failed to trigger job');
    } finally {
      setTriggeringJob(false);
    }
  };

  const isS3TablesEnabled = () => {
    // Pipeline Detail
    if (pipelineInfo?.pipelineId) {
      if (pipelineInfo.dataModeling?.s3Tables) {
        return true;
      }
    } else {
      // Create Pipeline
      if (pipelineInfo?.enableS3TablesModeling) {
        return true;
      }
    }
    return false;
  };

  const getS3TablesJobStatusIndicator = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'SUCCEEDED':
      case 'SUCCESS':
        return <StatusIndicator type="success">{status}</StatusIndicator>;
      case 'FAILED':
      case 'CANCELLED':
        return <StatusIndicator type="error">{status}</StatusIndicator>;
      case 'RUNNING':
      case 'PENDING':
      case 'SUBMITTED':
        return <StatusIndicator type="in-progress">{status}</StatusIndicator>;
      default:
        return <StatusIndicator type="info">{status || '-'}</StatusIndicator>;
    }
  };

  const buildRedshiftDisplay = (pipelineInfo?: IExtPipeline) => {
    // in creating process
    if (!pipelineInfo?.pipelineId) {
      if (pipelineInfo?.redshiftType === 'serverless') {
        return 'New Serverless';
      } else {
        return (
          <Link
            external
            href={buildRedshiftLink(
              pipelineInfo?.region || '',
              pipelineInfo?.dataModeling?.redshift?.provisioned
                ?.clusterIdentifier || '',
              'provisioned'
            )}
          >
            {
              pipelineInfo?.dataModeling?.redshift?.provisioned
                ?.clusterIdentifier
            }
          </Link>
        );
      }
    } else {
      // in detail page
      if (pipelineInfo?.dataModeling?.redshift?.newServerless) {
        return (
          <Link
            external
            href={buildRedshiftLink(
              pipelineInfo?.region || '',
              '',
              'serverless'
            )}
          >
            {t('pipeline:detail.redshiftServerless')}
          </Link>
        );
      } else {
        return (
          <Link
            external
            href={buildRedshiftLink(
              pipelineInfo?.region || '',
              pipelineInfo?.dataModeling?.redshift?.provisioned
                ?.clusterIdentifier || '',
              'provisioned'
            )}
          >
            {
              pipelineInfo?.dataModeling?.redshift?.provisioned
                ?.clusterIdentifier
            }
          </Link>
        );
      }
    }
  };

  const buildProcessingIntevalFixedRateDisplay = () => {
    if (
      pipelineInfo?.selectedExcutionType?.value === ExecutionType.FIXED_RATE
    ) {
      return `${pipelineInfo.excutionFixedValue} ${pipelineInfo.selectedExcutionUnit?.label} `;
    } else {
      return `${pipelineInfo?.exeCronExp}`;
    }
  };

  const buildProcessingIntevalCronDisplay = () => {
    if (pipelineInfo?.dataProcessing.scheduleExpression.startsWith('cron')) {
      return pipelineInfo?.dataProcessing.scheduleExpression;
    } else {
      const pattern = /rate\((\d+\s\w+)\)/;
      const match =
        pipelineInfo?.dataProcessing.scheduleExpression.match(pattern);

      if (match) {
        const rateValue = match[1];
        const formattedRateValue = rateValue.replace(/\b\s+(\w)/, (match) =>
          match.toUpperCase()
        );
        return formattedRateValue;
      }
    }
  };

  const getDataProcessingIntervalDisplay = () => {
    if (pipelineInfo) {
      if (pipelineInfo.selectedExcutionType) {
        return buildProcessingIntevalFixedRateDisplay();
      } else if (pipelineInfo?.dataProcessing?.scheduleExpression) {
        if (pipelineInfo.dataProcessing.scheduleExpression) {
          return buildProcessingIntevalCronDisplay();
        } else {
          return '-';
        }
      }
    }
    return '-';
  };

  const getRefreshDataDisplay = () => {
    if (pipelineInfo) {
      if (pipelineInfo.selectedEventFreshUnit?.value) {
        return `${pipelineInfo.eventFreshValue} ${pipelineInfo.selectedEventFreshUnit.label}`;
      } else {
        if (pipelineInfo.dataProcessing.dataFreshnessInHour) {
          const hours = pipelineInfo.dataProcessing.dataFreshnessInHour;
          if (hours >= 24 && hours % 24 === 0) {
            const days = hours / 24;
            return `${days} Days`;
          } else {
            return `${hours} Hours`;
          }
        } else {
          return '3 Days';
        }
      }
    }
    return '-';
  };

  const getRedshiftDataRangeDisplay = () => {
    if (pipelineInfo) {
      if (pipelineInfo.selectedRedshiftExecutionUnit?.value) {
        return `${pipelineInfo.redshiftExecutionValue} ${pipelineInfo.selectedRedshiftExecutionUnit.label}`;
      } else {
        const minutes = pipelineInfo?.dataModeling?.redshift?.dataRange;
        if (minutes >= 60 * 24 * 30 && minutes % (60 * 24 * 30) === 0) {
          const months = minutes / (60 * 24 * 30);
          return `${months} Months`;
        } else if (minutes >= 60 * 24 && minutes % (60 * 24) === 0) {
          const days = minutes / (60 * 24);
          return `${days} Days`;
        } else {
          return `${minutes} Minutes`;
        }
      }
    }
  };

  const getEnrichPluginDisplay = () => {
    let renderEnrichPlugins: any = [];
    if (pipelineInfo?.selectedEnrichPlugins) {
      // Create Pipeline
      renderEnrichPlugins = pipelineInfo?.selectedEnrichPlugins;
    } else {
      // Pipeline detail
      renderEnrichPlugins = pipelineInfo?.dataProcessing?.enrichPlugin || [];
    }
    if (renderEnrichPlugins.length > 0) {
      const returnElement = renderEnrichPlugins.map((element: IPlugin) => {
        return (
          <div key={element.name}>
            {element.name}{' '}
            <Box variant="small">
              {getLocaleLngDescription(element.description)}
            </Box>
          </div>
        );
      });
      return returnElement;
    } else {
      return '-';
    }
  };

  const getTransformPluginDisplay = () => {
    let renderTransformPlugins: any = [];
    if (pipelineInfo?.selectedTransformPlugins) {
      // Create Pipeline
      renderTransformPlugins = pipelineInfo?.selectedTransformPlugins;
    } else if (pipelineInfo?.dataProcessing?.transformPlugin) {
      // Pipeline detail
      renderTransformPlugins = [pipelineInfo?.dataProcessing?.transformPlugin];
    }
    if (renderTransformPlugins.length > 0) {
      const returnElement = renderTransformPlugins.map((element: IPlugin) => {
        return (
          <div key={element.name}>
            {element.name}{' '}
            <Box variant="small">
              {getLocaleLngDescription(element.description)}
            </Box>
          </div>
        );
      });
      return returnElement;
    } else {
      return '-';
    }
  };

  const isDataProcessingEnable = () => {
    // Pipeline Detail
    if (pipelineInfo?.pipelineId) {
      if (
        pipelineInfo.dataProcessing?.dataFreshnessInHour &&
        pipelineInfo.dataProcessing?.scheduleExpression
      ) {
        return true;
      }
    } else {
      // Create Pipeline
      if (pipelineInfo?.enableDataProcessing) {
        return true;
      }
    }
    return false;
  };

  const isRedshiftEnable = () => {
    // Pipeline Detail
    if (pipelineInfo?.pipelineId) {
      if (pipelineInfo.dataModeling?.redshift) {
        return true;
      }
    } else {
      // Create pipeline
      if (pipelineInfo?.enableRedshift) {
        return true;
      }
    }
    return false;
  };

  const appSchemasStatus = (status?: string) => {
    switch (status) {
      case 'ABORTED':
        return <StatusIndicator type="stopped">{status}</StatusIndicator>;
      case 'FAILED':
      case 'TIMED_OUT':
        return <StatusIndicator type="error">{status}</StatusIndicator>;
      case 'PENDING_REDRIVE':
        return <StatusIndicator type="pending">{status}</StatusIndicator>;
      case 'RUNNING':
        return <StatusIndicator type="in-progress">{status}</StatusIndicator>;
      case 'SUCCEEDED':
        return <StatusIndicator type="success">{status}</StatusIndicator>;
      default:
        return <StatusIndicator type="pending">{status}</StatusIndicator>;
    }
  };

  const appSchemasExecution = (appId: string, executionArn?: string) => {
    return (
      <Link
        external
        href={buildSFNExecutionLink(
          defaultStr(pipelineInfo?.region),
          defaultStr(executionArn)
        )}
      >
        {appId}
      </Link>
    );
  };

  return (
    <SpaceBetween direction="vertical" size="l">
      <ColumnLayout columns={3} variant="text-grid">
        <SpaceBetween direction="vertical" size="l">
          <div>
            <Box variant="awsui-key-label">{t('pipeline:detail.status')}</Box>
            <div>
              {isDataProcessingEnable() ? (
                <StatusIndicator type="success">{t('enabled')}</StatusIndicator>
              ) : (
                <StatusIndicator type="stopped">{t('disabled')}</StatusIndicator>
              )}
            </div>
          </div>

          {isDataProcessingEnable() && (
            <>
              <div>
                <Box variant="awsui-key-label">
                  {t('pipeline:detail.dataProcessingInt')}
                </Box>
                <div>{getDataProcessingIntervalDisplay()}</div>
              </div>

              <div>
                <Box variant="awsui-key-label">
                  {t('pipeline:detail.eventFreshness')}
                </Box>
                <div>{getRefreshDataDisplay()}</div>
              </div>

              <div>
                <Box variant="awsui-key-label">
                  {t('pipeline:detail.transform')}
                </Box>
                {getTransformPluginDisplay()}
              </div>

              <div>
                <Box variant="awsui-key-label">
                  {t('pipeline:detail.enrichment')}
                </Box>
                <div>{getEnrichPluginDisplay()}</div>
              </div>
            </>
          )}
        </SpaceBetween>

        {isDataProcessingEnable() && (
          <>
            <SpaceBetween direction="vertical" size="l">
              <div>
                <Box variant="awsui-key-label">
                  {t('pipeline:detail.redshift')}
                </Box>
                <div>
                  {isRedshiftEnable() ? (
                    <StatusIndicator type="success">
                      {t('enabled')}
                    </StatusIndicator>
                  ) : (
                    <StatusIndicator type="stopped">
                      {t('disabled')}
                    </StatusIndicator>
                  )}
                </div>
              </div>

              {isRedshiftEnable() && (
                <>
                  <div>
                    <Box variant="awsui-key-label">
                      {t('pipeline:detail.analyticEngine')}
                    </Box>
                    <div>{buildRedshiftDisplay(pipelineInfo)}</div>
                  </div>

                  {ternary(
                    pipelineInfo?.redshiftType === 'serverless' ||
                      (pipelineInfo?.pipelineId &&
                        pipelineInfo?.dataModeling?.redshift?.newServerless),
                    <>
                      <div>
                        <Box variant="awsui-key-label">
                          {t('pipeline:create.redshiftBaseCapacity')}
                        </Box>
                        <div>
                          {
                            pipelineInfo?.dataModeling?.redshift?.newServerless
                              ?.baseCapacity
                          }
                        </div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">
                          {t('pipeline:create.vpc')}
                        </Box>
                        <div>
                          <Link
                            external
                            href={buildVPCLink(
                              pipelineInfo?.region ?? '',
                              pipelineInfo?.dataModeling?.redshift?.newServerless
                                ?.network?.vpcId ?? ''
                            )}
                          >
                            {
                              pipelineInfo?.dataModeling?.redshift?.newServerless
                                ?.network?.vpcId
                            }
                          </Link>
                        </div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">
                          {t('pipeline:create.securityGroup')}
                        </Box>
                        <div>
                          {pipelineInfo?.dataModeling?.redshift?.newServerless
                            ?.network?.securityGroups &&
                          pipelineInfo?.dataModeling?.redshift?.newServerless
                            ?.network.securityGroups.length > 0
                            ? pipelineInfo?.dataModeling?.redshift?.newServerless?.network?.securityGroups?.map(
                                (element) => {
                                  return (
                                    <div key={element}>
                                      <Link
                                        external
                                        href={buildSecurityGroupLink(
                                          pipelineInfo.region || '',
                                          element
                                        )}
                                      >
                                        {element}
                                      </Link>
                                    </div>
                                  );
                                }
                              )
                            : '-'}
                        </div>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">
                          {t('pipeline:create.subnet')}
                        </Box>
                        <div>
                          {pipelineInfo?.dataModeling?.redshift?.newServerless
                            ?.network?.subnetIds &&
                          pipelineInfo?.dataModeling?.redshift?.newServerless
                            ?.network?.subnetIds?.length > 0
                            ? pipelineInfo?.dataModeling?.redshift.newServerless.network.subnetIds?.map(
                                (element) => {
                                  return (
                                    <div key={element}>
                                      <Link
                                        external
                                        href={buildSubnetLink(
                                          pipelineInfo.region || '',
                                          element
                                        )}
                                      >
                                        {element}
                                      </Link>
                                    </div>
                                  );
                                }
                              )
                            : '-'}
                        </div>
                      </div>
                    </>,
                    <div>
                      <Box variant="awsui-key-label">
                        {t('pipeline:detail.redshiftPermission')}
                      </Box>
                      <div>
                        {defaultStr(
                          pipelineInfo?.dataModeling?.redshift?.provisioned
                            ?.dbUser,
                          '-'
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <Box variant="awsui-key-label">
                      {t('pipeline:detail.dataRange')}
                    </Box>
                    <div>{getRedshiftDataRangeDisplay()}</div>
                  </div>

                  <div>
                    <Box variant="awsui-key-label">
                      {t('pipeline:detail.analyticSchemaStatus')}
                    </Box>
                    <div>
                      {displayPipelineExtend &&
                        pipelineExtend?.createApplicationSchemasStatus.map(
                          (element) => {
                            return (
                              <div key={element.appId}>
                                {appSchemasExecution(
                                  element.appId,
                                  element.executionArn
                                )}
                                :{appSchemasStatus(element.status)}
                              </div>
                            );
                          }
                        )}
                    </div>
                  </div>
                </>
              )}
            </SpaceBetween>

            <SpaceBetween direction="vertical" size="l">
              <div>
                <Box variant="awsui-key-label">{t('pipeline:detail.athena')}</Box>
                <div>
                  {pipelineInfo?.dataModeling.athena ? (
                    <StatusIndicator type="success">
                      {t('enabled')}
                    </StatusIndicator>
                  ) : (
                    <StatusIndicator type="stopped">
                      {t('disabled')}
                    </StatusIndicator>
                  )}
                </div>
              </div>
            </SpaceBetween>
          </>
        )}
      </ColumnLayout>

      {/* S3 Tables Modeling Section - Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6 */}
      {isDataProcessingEnable() && isS3TablesEnabled() && (
        <SpaceBetween direction="vertical" size="l">
          <Box variant="h3">{t('pipeline:detail.s3TablesModeling')}</Box>
          
          {/* Trigger alerts */}
          {triggerError && (
            <Alert type="error" dismissible onDismiss={() => setTriggerError(null)}>
              {triggerError}
            </Alert>
          )}
          {triggerSuccess && (
            <Alert type="success" dismissible onDismiss={() => setTriggerSuccess(null)}>
              {triggerSuccess}
            </Alert>
          )}

          <ColumnLayout columns={3} variant="text-grid">
            {/* S3 Tables Configuration - Requirement 11.1 */}
            <SpaceBetween direction="vertical" size="l">
              <div>
                <Box variant="awsui-key-label">{t('pipeline:detail.s3TablesStatus')}</Box>
                <div>
                  {loadingS3TablesStatus ? (
                    <StatusIndicator type="loading">{t('loading')}</StatusIndicator>
                  ) : s3TablesStatus?.enabled ? (
                    <StatusIndicator type="success">{t('enabled')}</StatusIndicator>
                  ) : (
                    <StatusIndicator type="stopped">{t('disabled')}</StatusIndicator>
                  )}
                </div>
              </div>

              <div>
                <Box variant="awsui-key-label">{t('pipeline:create.s3TableBucket')}</Box>
                <div>{pipelineInfo?.dataModeling?.s3Tables?.tableBucketArn || '-'}</div>
              </div>

              <div>
                <Box variant="awsui-key-label">{t('pipeline:create.s3TablesNamespace')}</Box>
                <div>{pipelineInfo?.dataModeling?.s3Tables?.namespace || '-'}</div>
              </div>

              <div>
                <Box variant="awsui-key-label">{t('pipeline:create.s3TablesSchedule')}</Box>
                <div>{pipelineInfo?.dataModeling?.s3Tables?.scheduleExpression || '-'}</div>
              </div>

              <div>
                <Box variant="awsui-key-label">{t('pipeline:create.s3TablesDataRetention')}</Box>
                <div>
                  {pipelineInfo?.dataModeling?.s3Tables?.dataRetentionDays 
                    ? `${pipelineInfo.dataModeling.s3Tables.dataRetentionDays} ${t('pipeline:detail.days')}`
                    : '-'}
                </div>
              </div>

              {s3TablesStatus?.emrApplicationId && (
                <div>
                  <Box variant="awsui-key-label">{t('pipeline:detail.s3TablesEmrAppId')}</Box>
                  <div>{s3TablesStatus.emrApplicationId}</div>
                </div>
              )}
            </SpaceBetween>

            {/* S3 Tables Status and Actions - Requirements 11.2, 11.4, 11.5 */}
            <SpaceBetween direction="vertical" size="l">
              <div>
                <Box variant="awsui-key-label">{t('pipeline:detail.s3TablesLastJobStatus')}</Box>
                <div>
                  {s3TablesStatus?.lastJobStatus 
                    ? getS3TablesJobStatusIndicator(s3TablesStatus.lastJobStatus)
                    : '-'}
                </div>
              </div>

              {s3TablesStatus?.lastJobTimestamp && (
                <div>
                  <Box variant="awsui-key-label">{t('pipeline:detail.s3TablesLastJobTime')}</Box>
                  <div>{new Date(s3TablesStatus.lastJobTimestamp).toLocaleString()}</div>
                </div>
              )}

              {/* Manual Trigger Button - Requirement 11.4 */}
              <div>
                <Button
                  variant="primary"
                  loading={triggeringJob}
                  onClick={handleTriggerS3TablesJob}
                >
                  {t('pipeline:detail.s3TablesTriggerJob')}
                </Button>
              </div>
            </SpaceBetween>

            {/* Job History - Requirements 11.3, 11.6 */}
            <SpaceBetween direction="vertical" size="l">
              <div>
                <Box variant="awsui-key-label">{t('pipeline:detail.s3TablesJobHistory')}</Box>
                {loadingS3TablesJobs ? (
                  <StatusIndicator type="loading">{t('loading')}</StatusIndicator>
                ) : s3TablesJobs.length > 0 ? (
                  <Table
                    columnDefinitions={[
                      {
                        id: 'jobRunId',
                        header: t('pipeline:detail.s3TablesJobId'),
                        cell: (item: S3TablesJobHistoryItem) => item.jobRunId?.substring(0, 8) || '-',
                      },
                      {
                        id: 'state',
                        header: t('pipeline:detail.status'),
                        cell: (item: S3TablesJobHistoryItem) => getS3TablesJobStatusIndicator(item.state),
                      },
                      {
                        id: 'startTime',
                        header: t('pipeline:detail.s3TablesJobStartTime'),
                        cell: (item: S3TablesJobHistoryItem) => 
                          item.startRunTime 
                            ? new Date(item.startRunTime).toLocaleString() 
                            : item.startTimestamp 
                              ? new Date(item.startTimestamp).toLocaleString()
                              : '-',
                      },
                    ]}
                    items={s3TablesJobs.slice(0, 5)}
                    variant="embedded"
                    empty={
                      <Box textAlign="center" color="inherit">
                        {t('pipeline:detail.s3TablesNoJobs')}
                      </Box>
                    }
                  />
                ) : (
                  <Box color="text-status-inactive">{t('pipeline:detail.s3TablesNoJobs')}</Box>
                )}
              </div>
            </SpaceBetween>
          </ColumnLayout>
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
};

export default Processing;
