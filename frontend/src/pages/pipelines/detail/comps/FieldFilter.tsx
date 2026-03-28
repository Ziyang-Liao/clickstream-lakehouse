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
  getFieldFilterRule,
  updateFieldFilterRule,
} from 'apis/field-filter';
import FieldListEditor from 'components/field-filter/FieldListEditor';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FieldFilterProps {
  pipelineInfo?: IExtPipeline;
}

const FieldFilter: React.FC<FieldFilterProps> = (props: FieldFilterProps) => {
  const { pipelineInfo } = props;
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingRule, setExistingRule] = useState<IFieldFilterRule | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('whitelist');
  const [fields, setFields] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadFilterRule = useCallback(async () => {
    if (!pipelineInfo?.projectId || !pipelineInfo?.pipelineId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response: ApiResponse<IFieldFilterRule> = await getFieldFilterRule({
        projectId: pipelineInfo.projectId,
        pipelineId: pipelineInfo.pipelineId,
      });

      if (response?.success && response?.data) {
        setExistingRule(response.data);
        setFilterMode(response.data.filterMode);
        setFields(response.data.fields || []);
      } else {
        // No rule exists or API returned error - this is normal for new pipelines
        setExistingRule(null);
        setFilterMode('whitelist');
        setFields([]);
      }
    } catch (error) {
      // 404 is expected when no rule exists - treat as no rule
      console.log('No filter rule found or error loading:', error);
      setExistingRule(null);
      setFilterMode('whitelist');
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [pipelineInfo?.projectId, pipelineInfo?.pipelineId]);

  useEffect(() => {
    loadFilterRule();
  }, [loadFilterRule]);

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

  const handleSave = async () => {
    if (!pipelineInfo?.projectId || !pipelineInfo?.pipelineId) {
      return;
    }

    try {
      setSaving(true);
      setSaveError('');
      setSaveSuccess(false);

      const params = {
        projectId: pipelineInfo.projectId,
        pipelineId: pipelineInfo.pipelineId,
        filterMode,
        fields,
      };

      let response: ApiResponse<any>;
      if (existingRule) {
        response = await updateFieldFilterRule(params);
      } else {
        response = await createFieldFilterRule(params);
      }

      if (response.success) {
        setSaveSuccess(true);
        setHasChanges(false);
        await loadFilterRule();
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
    if (!pipelineInfo?.projectId || !pipelineInfo?.pipelineId) {
      return;
    }

    try {
      setSaving(true);
      setSaveError('');

      const response: ApiResponse<any> = await deleteFieldFilterRule({
        projectId: pipelineInfo.projectId,
        pipelineId: pipelineInfo.pipelineId,
      });

      if (response.success) {
        setExistingRule(null);
        setFilterMode('whitelist');
        setFields([]);
        setHasChanges(false);
        setShowDeleteModal(false);
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
        if (existingRule) {
          setFilterMode(existingRule.filterMode);
          setFields(existingRule.fields || []);
        } else {
          setFilterMode('whitelist');
          setFields([]);
        }
        setHasChanges(false);
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
                {existingRule && (
                  <Button
                    onClick={() => setShowDeleteModal(true)}
                    disabled={saving}
                  >
                    {t('fieldFilter:deleteRule')}
                  </Button>
                )}
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

          {existingRule && (
            <Box>
              <StatusIndicator type="success">
                {t('fieldFilter:pipelineLevel')}
              </StatusIndicator>
              <Box variant="small" color="text-body-secondary">
                {t('fieldFilter:pipelineLevelDesc')}
              </Box>
            </Box>
          )}

          {!existingRule && (
            <Box>
              <StatusIndicator type="info">
                {t('fieldFilter:noRule')}
              </StatusIndicator>
              <Box variant="small" color="text-body-secondary">
                {t('fieldFilter:noRuleDesc')}
              </Box>
            </Box>
          )}

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

export default FieldFilter;
