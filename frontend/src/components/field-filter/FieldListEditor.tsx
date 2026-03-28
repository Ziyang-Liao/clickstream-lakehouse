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
  Checkbox,
  ExpandableSection,
  Input,
  SpaceBetween,
  Spinner,
  StatusIndicator,
} from '@cloudscape-design/components';
import { getAvailableFields } from 'apis/field-filter';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface EventField {
  name: string;
  category: string;
  isSystemRequired: boolean;
  displayName: {
    'en-US': string;
    'zh-CN': string;
  };
  description: {
    'en-US': string;
    'zh-CN': string;
  };
}

export interface FieldListEditorProps {
  fields: string[];
  onChange: (fields: string[]) => void;
  disabled?: boolean;
}

const MAX_FIELD_COUNT = 500;

const FieldListEditor: React.FC<FieldListEditorProps> = ({
  fields,
  onChange,
  disabled = false,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US';

  const [loading, setLoading] = useState(true);
  const [fieldsByCategory, setFieldsByCategory] = useState<Record<string, EventField[]>>({});
  const [categoryDisplayNames, setCategoryDisplayNames] = useState<Record<string, { 'en-US': string; 'zh-CN': string }>>({});
  const [searchText, setSearchText] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Load available fields from API
  const loadAvailableFields = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getAvailableFields();
      if (response?.success && response?.data) {
        setFieldsByCategory(response.data.fieldsByCategory || {});
        setCategoryDisplayNames(response.data.categoryDisplayNames || {});
        // Expand all categories by default
        setExpandedCategories(new Set(Object.keys(response.data.fieldsByCategory || {})));
      } else {
        console.error('Failed to load available fields: Invalid response');
      }
    } catch (error) {
      console.error('Failed to load available fields:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAvailableFields();
  }, [loadAvailableFields]);

  // Filter fields based on search text
  const filteredFieldsByCategory = useMemo(() => {
    if (!searchText.trim()) {
      return fieldsByCategory;
    }

    const searchLower = searchText.toLowerCase();
    const result: Record<string, EventField[]> = {};

    for (const [category, categoryFields] of Object.entries(fieldsByCategory)) {
      const filtered = categoryFields.filter(field => {
        const nameMatch = field.name.toLowerCase().includes(searchLower);
        const displayNameMatch = field.displayName[currentLang]?.toLowerCase().includes(searchLower);
        const descMatch = field.description[currentLang]?.toLowerCase().includes(searchLower);
        return nameMatch || displayNameMatch || descMatch;
      });

      if (filtered.length > 0) {
        result[category] = filtered;
      }
    }

    return result;
  }, [fieldsByCategory, searchText, currentLang]);

  // Handle field selection
  const handleFieldToggle = (fieldName: string, isSystemRequired: boolean) => {
    if (disabled || isSystemRequired) return;

    const newFields = fields.includes(fieldName)
      ? fields.filter(f => f !== fieldName)
      : [...fields, fieldName];

    onChange(newFields);
  };

  // Handle category select all / deselect all
  const handleCategoryToggle = (category: string, categoryFields: EventField[]) => {
    if (disabled) return;

    const selectableFields = categoryFields.filter(f => !f.isSystemRequired);
    const selectableFieldNames = selectableFields.map(f => f.name);
    const allSelected = selectableFieldNames.every(name => fields.includes(name));

    let newFields: string[];
    if (allSelected) {
      // Deselect all in this category
      newFields = fields.filter(f => !selectableFieldNames.includes(f));
    } else {
      // Select all in this category
      const fieldsToAdd = selectableFieldNames.filter(name => !fields.includes(name));
      newFields = [...fields, ...fieldsToAdd];
    }

    onChange(newFields);
  };

  // Check if all selectable fields in a category are selected
  const isCategoryAllSelected = (categoryFields: EventField[]) => {
    const selectableFields = categoryFields.filter(f => !f.isSystemRequired);
    if (selectableFields.length === 0) return false;
    return selectableFields.every(f => fields.includes(f.name));
  };

  // Check if some (but not all) selectable fields in a category are selected
  const isCategoryPartialSelected = (categoryFields: EventField[]) => {
    const selectableFields = categoryFields.filter(f => !f.isSystemRequired);
    if (selectableFields.length === 0) return false;
    const selectedCount = selectableFields.filter(f => fields.includes(f.name)).length;
    return selectedCount > 0 && selectedCount < selectableFields.length;
  };

  // Toggle category expansion
  const toggleCategoryExpansion = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  if (loading) {
    return (
      <Box textAlign="center" padding="l">
        <Spinner size="large" />
      </Box>
    );
  }

  const selectedCount = fields.length;

  return (
    <SpaceBetween direction="vertical" size="s">
      {/* Search and count */}
      <Box>
        <SpaceBetween direction="horizontal" size="s">
          <Box>
            <Input
              type="search"
              placeholder={String(t('fieldFilter:searchPlaceholder') || 'Search fields...')}
              value={searchText}
              onChange={({ detail }) => setSearchText(detail.value)}
              disabled={disabled}
            />
          </Box>
          <Box>
            <StatusIndicator type="info">
              {t('fieldFilter:fieldCount', { count: selectedCount, max: MAX_FIELD_COUNT })}
            </StatusIndicator>
          </Box>
        </SpaceBetween>
      </Box>

      {/* Field categories */}
      <Box className="field-list-container" padding={{ vertical: 's' }}>
        {Object.entries(filteredFieldsByCategory).length === 0 ? (
          <Box textAlign="center" color="text-body-secondary" padding="l">
            {searchText ? t('fieldFilter:noSearchResults') : t('fieldFilter:noFields')}
          </Box>
        ) : (
          <SpaceBetween direction="vertical" size="xs">
            {Object.entries(filteredFieldsByCategory).map(([category, categoryFields]) => {
              const categoryName = categoryDisplayNames[category]?.[currentLang] || category;
              const isExpanded = expandedCategories.has(category);
              const allSelected = isCategoryAllSelected(categoryFields);
              const partialSelected = isCategoryPartialSelected(categoryFields);

              return (
                <ExpandableSection
                  key={category}
                  expanded={isExpanded}
                  onChange={() => toggleCategoryExpansion(category)}
                  headerText={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={partialSelected}
                        onChange={() => handleCategoryToggle(category, categoryFields)}
                        disabled={disabled}
                      />
                      <span>{categoryName}</span>
                      <Box color="text-body-secondary" fontSize="body-s">
                        ({categoryFields.length})
                      </Box>
                    </SpaceBetween>
                  }
                >
                  <Box padding={{ left: 'l' }}>
                    <SpaceBetween direction="vertical" size="xxs">
                      {categoryFields.map(field => {
                        const isSelected = fields.includes(field.name);
                        const isSystemRequired = field.isSystemRequired;

                        return (
                          <Box key={field.name} padding={{ vertical: 'xxs' }}>
                            <Checkbox
                              checked={isSelected || isSystemRequired}
                              disabled={disabled || isSystemRequired}
                              onChange={() => handleFieldToggle(field.name, isSystemRequired)}
                            >
                              <SpaceBetween direction="horizontal" size="xs">
                                <span>{field.name}</span>
                                {isSystemRequired && (
                                  <Box color="text-status-info" fontSize="body-s">
                                    ({t('fieldFilter:systemField')})
                                  </Box>
                                )}
                              </SpaceBetween>
                              <Box color="text-body-secondary" fontSize="body-s">
                                {field.displayName[currentLang]} - {field.description[currentLang]}
                              </Box>
                            </Checkbox>
                          </Box>
                        );
                      })}
                    </SpaceBetween>
                  </Box>
                </ExpandableSection>
              );
            })}
          </SpaceBetween>
        )}
      </Box>
    </SpaceBetween>
  );
};

export default FieldListEditor;
