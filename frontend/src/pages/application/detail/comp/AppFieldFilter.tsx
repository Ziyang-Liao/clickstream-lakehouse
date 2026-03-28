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
  Alert,
  Box,
  Button,
  Container,
  FormField,
  Header,
  Modal,
  RadioGroup,
  SpaceBetween,
  Spinner,
  StatusIndicator,
} from '@cloudscape-design/components';
import {
  createFieldFilterRule,
  deleteFieldFilterRule,
  getEffectiveFieldFilterRule,
  getFieldFilterRule,
  updateFieldFilterRule,
} from 'apis/field-filter';
import FieldListEditor from 'components/field-filter/FieldListEditor';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AppFieldFilterProps {
  appInfo?: IApplication;
}

const AppFieldFilter: React.FC<AppFieldFilterProps> = (props: AppFieldFilterProps) => {
  const { appInfo } = props;
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appRule, setAppRule] = useState<IFieldFilterRule | null>(null);
  const [pipelineRule, setPipelineRule] = useState<IFieldFilterRule | null>(null);
  const [effectiveRule, setEffectiveRule] = useState<IFieldFilterRule | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('whitelist');
  const [fields, setFields] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCreatingAppRule, setIsCreatingAppRule] = useState(false);

  const loadFilterRules = useCallback(async () => {
    if (!appInfo?.projectId || !appInfo?.pipeline?.id || !appInfo?.appId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let appRuleData: IFieldFilterRule | null = null;
      let pipelineRuleData: IFieldFilterRule | null = null;
      let effectiveRuleData: IFieldFilterRule | null = null;

      // Load app-level rule
      try {
        const appRuleResponse: ApiResponse<IFieldFilterRule> = await getFieldFilterRule({
          projectId: appInfo.projectId,
          pipelineId: appInfo.pipeline.id,
          appId: appInfo.appId,
        });

        if (appRuleResponse?.success && appRuleResponse?.data) {
          appRuleData = appRuleResponse.data;
        }
      } catch (e) {
        // 404 is expected when no app rule exists
        console.log('No app-level filter rule found');
      }

      // Load pipeline-level rule
      try {
        const pipelineRuleResponse: ApiResponse<IFieldFilterRule> = await getFieldFilterRule({
          projectId: appInfo.projectId,
          pipelineId: appInfo.pipeline.id,
        });

        if (pipelineRuleResponse?.success && pipelineRuleResponse?.data) {
          pipelineRuleData = pipelineRuleResponse.data;
        }
      } catch (e) {
        // 404 is expected when no pipeline rule exists
        console.log('No pipeline-level filter rule found');
      }

      // Load effective rule
      try {
        const effectiveResponse: ApiResponse<IFieldFilterRule> = await getEffectiveFieldFilterRule({
          projectId: appInfo.projectId,
          pipelineId: appInfo.pipeline.id,
          appId: appInfo.appId,
        });

        if (effectiveResponse?.success && effectiveResponse?.data) {
          effectiveRuleData = effectiveResponse.data;
        }
      } catch (e) {
        // No effective rule
        console.log('No effective filter rule found');
      }

      // Update state
      setAppRule(appRuleData);
      setPipelineRule(pipelineRuleData);
      setEffectiveRule(effectiveRuleData);

      // Set form values based on rules
      if (appRuleData) {
        setFilterMode(appRuleData.filterMode);
        setFields(appRuleData.fields || []);
      } else if (pipelineRuleData) {
        setFilterMode(pipelineRuleData.filterMode);
        setFields(pipelineRuleData.fields || []);
      } else {
        setFilterMode('whitelist');
        setFields([]);
      }
    } catch (error) {
      console.error('Failed to load filter rules:', error);
      setAppRule(null);
      setPipelineRule(null);
      setEffectiveRule(null);
      setFilterMode('whitelist');
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [appInfo?.projectId, appInfo?.pipeline?.id, appInfo?.appId]);

  useEffect(() => {
    loadFilterRules();
  }, [loadFilterRules]);

  const handleFilterModeChange = (mode: FilterMode) => {
    setFilterMode(mode);
    setHasChanges(true);
    setSaveSuccess(false);
    setSaveError('');
  };

  const handleFieldsChange = (newFields: string[]) => {
    setFields(newFields);
    setHasChanges(true);
    setSaveSuccess(false);
    setSaveError('');
  };

  const handleCreateAppRule = () => {
    setIsCreatingAppRule(true);
    // Initialize with pipeline rule values if available
    if (pipelineRule) {
      setFilterMode(pipelineRule.filterMode);
      setFields([...pipelineRule.fields]);
    } else {
      setFilterMode('whitelist');
      setFields([]);
    }
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!appInfo?.projectId || !appInfo?.pipeline?.id || !appInfo?.appId) {
      return;
    }

    try {
      setSaving(true);
      setSaveError('');
      setSaveSuccess(false);

      const params = {
        projectId: appInfo.projectId,
        pipelineId: appInfo.pipeline.id,
        appId: appInfo.appId,
        filterMode,
        fields,
      };

      let response: ApiResponse<any>;
      if (appRule) {
        response = await updateFieldFilterRule(params);
      } else {
        response = await createFieldFilterRule(params);
      }

      if (response.success) {
        setSaveSuccess(true);
        setHasChanges(false);
        setIsCreatingAppRule(false);
        await loadFilterRules();
      } else {
        setSaveError(response.message || String(t('fieldFilter:validation.saveFailed')));
      }
    } catch (error: any) {
      console.error('Failed to save filter rule:', error);
      setSaveError(error.message || String(t('fieldFilter:validation.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!appInfo?.projectId || !appInfo?.pipeline?.id || !appInfo?.appId) {
      return;
    }

    try {
      setSaving(true);
      setSaveError('');

      const response: ApiResponse<any> = await deleteFieldFilterRule({
        projectId: appInfo.projectId,
        pipelineId: appInfo.pipeline.id,
        appId: appInfo.appId,
      });

      if (response.success) {
        setAppRule(null);
        setIsCreatingAppRule(false);
        setHasChanges(false);
        setShowDeleteModal(false);
        // Reset to pipeline rule values if available
        if (pipelineRule) {
          setFilterMode(pipelineRule.filterMode);
          setFields(pipelineRule.fields || []);
        } else {
          setFilterMode('whitelist');
          setFields([]);
        }
        await loadFilterRules();
      } else {
        setSaveError(response.message || String(t('fieldFilter:validation.deleteFailed')));
      }
    } catch (error: any) {
      console.error('Failed to delete filter rule:', error);
      setSaveError(error.message || String(t('fieldFilter:validation.deleteFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      setPendingAction(() => () => {
        if (appRule) {
          setFilterMode(appRule.filterMode);
          setFields(appRule.fields || []);
        } else if (pipelineRule) {
          setFilterMode(pipelineRule.filterMode);
          setFields(pipelineRule.fields || []);
        } else {
          setFilterMode('whitelist');
          setFields([]);
        }
        setHasChanges(false);
        setIsCreatingAppRule(false);
        setSaveError('');
        setSaveSuccess(false);
      });
      setShowUnsavedModal(true);
    }
  };

  const confirmUnsavedChanges = () => {
    if (pendingAction) {
      pendingAction();
    }
    setShowUnsavedModal(false);
    setPendingAction(null);
  };

  const showWhitelistWarning = filterMode === 'whitelist' && fields.length === 0;
  const isEditing = appRule !== null || isCreatingAppRule;

  if (loading) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          <Spinner size="large" />
        </Box>
      </Container>
    );
  }

  return (
    <SpaceBetween direction="vertical" size="l">
      <Container
        header={
          <Header
            variant="h2"
            description={t('fieldFilter:fieldFilterDesc')}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                {!isEditing && pipelineRule && (
                  <Button onClick={handleCreateAppRule}>
                    {t('fieldFilter:createRule')}
                  </Button>
                )}
                {!isEditing && !pipelineRule && (
                  <Button onClick={handleCreateAppRule}>
                    {t('fieldFilter:createRule')}
                  </Button>
                )}
                {isEditing && appRule && (
                  <Button
                    onClick={() => setShowDeleteModal(true)}
                    disabled={saving}
                  >
                    {t('fieldFilter:deleteRule')}
                  </Button>
                )}
                {isEditing && (
                  <>
                    <Button onClick={handleCancel} disabled={saving || !hasChanges}>
                      {t('button.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleSave}
                      loading={saving}
                      disabled={!hasChanges}
                    >
                      {t('button.save')}
                    </Button>
                  </>
                )}
              </SpaceBetween>
            }
          >
            {t('fieldFilter:fieldFilter')}
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          {saveError && (
            <Alert type="error" dismissible onDismiss={() => setSaveError('')}>
              {saveError}
            </Alert>
          )}

          {saveSuccess && (
            <Alert type="success" dismissible onDismiss={() => setSaveSuccess(false)}>
              {t('fieldFilter:saveSuccess')}
            </Alert>
          )}

          {/* Rule Source Indicator */}
          <Box>
            <FormField label={t('fieldFilter:ruleSource')}>
              {appRule && (
                <StatusIndicator type="success">
                  {t('fieldFilter:appLevel')}
                </StatusIndicator>
              )}
              {!appRule && pipelineRule && !isCreatingAppRule && (
                <StatusIndicator type="info">
                  {t('fieldFilter:inheritedRule')}
                </StatusIndicator>
              )}
              {!appRule && !pipelineRule && !isCreatingAppRule && (
                <StatusIndicator type="stopped">
                  {t('fieldFilter:noRule')}
                </StatusIndicator>
              )}
              {isCreatingAppRule && !appRule && (
                <StatusIndicator type="pending">
                  {t('fieldFilter:createRule')}
                </StatusIndicator>
              )}
            </FormField>
            <Box variant="small" color="text-body-secondary">
              {appRule && t('fieldFilter:appLevelDesc')}
              {!appRule && pipelineRule && !isCreatingAppRule && t('fieldFilter:inheritedRuleDesc')}
              {!appRule && !pipelineRule && !isCreatingAppRule && t('fieldFilter:noRuleDesc')}
            </Box>
          </Box>

          {/* Effective Rule Display (when not editing) */}
          {!isEditing && effectiveRule && (
            <Box>
              <FormField label={t('fieldFilter:effectiveRule')}>
                <SpaceBetween direction="vertical" size="s">
                  <Box>
                    <strong>{t('fieldFilter:filterMode')}:</strong>{' '}
                    {effectiveRule.filterMode === 'whitelist'
                      ? t('fieldFilter:whitelist')
                      : t('fieldFilter:blacklist')}
                  </Box>
                  <Box>
                    <strong>{t('fieldFilter:fieldList')}:</strong>{' '}
                    {effectiveRule.fields?.length > 0
                      ? effectiveRule.fields.join(', ')
                      : t('fieldFilter:noFields')}
                  </Box>
                </SpaceBetween>
              </FormField>
            </Box>
          )}

          {/* Edit Form */}
          {isEditing && (
            <>
              <FormField
                label={t('fieldFilter:filterMode')}
                description={t('fieldFilter:filterModeDesc')}
              >
                <RadioGroup
                  value={filterMode}
                  onChange={({ detail }) =>
                    handleFilterModeChange(detail.value as FilterMode)
                  }
                  items={[
                    {
                      value: 'whitelist',
                      label: t('fieldFilter:whitelist'),
                      description: t('fieldFilter:whitelistDesc'),
                    },
                    {
                      value: 'blacklist',
                      label: t('fieldFilter:blacklist'),
                      description: t('fieldFilter:blacklistDesc'),
                    },
                  ]}
                />
              </FormField>

              {showWhitelistWarning && (
                <Alert type="warning">{t('fieldFilter:whitelistWarning')}</Alert>
              )}

              <FormField
                label={t('fieldFilter:fieldList')}
                description={t('fieldFilter:fieldListDesc')}
              >
                <FieldListEditor
                  fields={fields}
                  onChange={handleFieldsChange}
                  disabled={saving}
                />
              </FormField>
            </>
          )}
        </SpaceBetween>
      </Container>

      {/* Unsaved Changes Modal */}
      <Modal
        visible={showUnsavedModal}
        onDismiss={() => setShowUnsavedModal(false)}
        header={t('fieldFilter:unsavedChanges') ?? ''}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowUnsavedModal(false)}>
                {t('button.cancel')}
              </Button>
              <Button variant="primary" onClick={confirmUnsavedChanges}>
                {t('button.confirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('fieldFilter:unsavedChangesDesc')}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        onDismiss={() => setShowDeleteModal(false)}
        header={t('fieldFilter:deleteRule') ?? ''}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setShowDeleteModal(false)}>
                {t('button.cancel')}
              </Button>
              <Button variant="primary" onClick={handleDelete} loading={saving}>
                {t('button.delete')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('fieldFilter:deleteRuleConfirm')}
      </Modal>
    </SpaceBetween>
  );
};

export default AppFieldFilter;
