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
  EVENT_FIELDS,
  FIELD_CATEGORIES,
  CATEGORY_DISPLAY_NAMES,
  SYSTEM_REQUIRED_FIELDS,
  getFieldsByCategory,
} from '../common/event-fields';
import { ApiFail, ApiSuccess } from '../common/types';
import { paginateData } from '../common/utils';
import { FilterMode, IFieldFilterRule } from '../model/field-filter';
import { ClickStreamStore } from '../store/click-stream-store';
import { DynamoDbStore } from '../store/dynamodb/dynamodb-store';

const store: ClickStreamStore = new DynamoDbStore();

/**
 * Maximum number of fields allowed in a filter rule
 */
export const MAX_FIELD_COUNT = 500;

/**
 * Regular expression pattern for valid field names
 * Must start with a letter or underscore, followed by letters, numbers, underscores, or dots
 */
export const FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

/**
 * Valid filter modes
 */
export const VALID_FILTER_MODES: FilterMode[] = ['whitelist', 'blacklist'];

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Validates a field name against the allowed pattern
 * @param fieldName The field name to validate
 * @returns true if valid, false otherwise
 */
export function isValidFieldName(fieldName: string): boolean {
  return FIELD_NAME_PATTERN.test(fieldName);
}

/**
 * Validates the filter mode
 * @param filterMode The filter mode to validate
 * @returns true if valid, false otherwise
 */
export function isValidFilterMode(filterMode: string): boolean {
  return VALID_FILTER_MODES.includes(filterMode as FilterMode);
}

/**
 * Deduplicates a list of field names, preserving the first occurrence order
 * @param fields The list of field names
 * @returns Deduplicated list of field names
 */
export function deduplicateFields(fields: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    if (!seen.has(field)) {
      seen.add(field);
      result.push(field);
    }
  }
  return result;
}

/**
 * Validates a filter rule
 * @param rule The filter rule to validate
 * @returns Validation result with errors and warnings
 */
export function validateFilterRule(rule: Partial<IFieldFilterRule>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Validate filterMode
  if (!rule.filterMode) {
    errors.push({
      field: 'filterMode',
      message: 'filterMode is required',
    });
  } else if (!isValidFilterMode(rule.filterMode)) {
    errors.push({
      field: 'filterMode',
      message: 'Invalid filterMode. Must be \'whitelist\' or \'blacklist\'',
    });
  }

  // Validate fields array
  if (!rule.fields) {
    errors.push({
      field: 'fields',
      message: 'fields is required',
    });
  } else if (!Array.isArray(rule.fields)) {
    errors.push({
      field: 'fields',
      message: 'fields must be an array',
    });
  } else {
    // Validate field count
    if (rule.fields.length > MAX_FIELD_COUNT) {
      errors.push({
        field: 'fields',
        message: `Field list exceeds maximum limit of ${MAX_FIELD_COUNT}`,
      });
    }

    // Validate each field name
    const invalidFields: string[] = [];
    for (const field of rule.fields) {
      if (typeof field !== 'string') {
        invalidFields.push(String(field));
      } else if (!isValidFieldName(field)) {
        invalidFields.push(field);
      }
    }

    if (invalidFields.length > 0) {
      errors.push({
        field: 'fields',
        message: `Invalid field name(s): ${invalidFields.join(', ')}. Must match pattern ^[a-zA-Z_][a-zA-Z0-9_.]*$`,
      });
    }

    // Warning for empty whitelist
    if (rule.filterMode === 'whitelist' && rule.fields.length === 0) {
      warnings.push('Empty whitelist will result in no fields being collected (except system required fields)');
    }
  }

  // Validate projectId
  if (!rule.projectId) {
    errors.push({
      field: 'projectId',
      message: 'projectId is required',
    });
  }

  // Validate pipelineId
  if (!rule.pipelineId) {
    errors.push({
      field: 'pipelineId',
      message: 'pipelineId is required',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export class FieldFilterService {
  /**
   * Create a new field filter rule
   */
  public async create(req: any, res: any, next: any) {
    try {
      const { projectId, pipelineId, appId, filterMode, fields } = req.body;
      const operator = res.get('X-Click-Stream-Operator') ?? '';

      // Validate the rule
      const validation = validateFilterRule({ projectId, pipelineId, appId, filterMode, fields });
      if (!validation.valid) {
        return res.status(400).json(new ApiFail('Validation failed', validation.errors));
      }

      // Check if rule already exists
      const existingRule = await store.getFieldFilterRule(projectId, pipelineId, appId);
      if (existingRule) {
        const ruleType = appId ? 'app' : 'pipeline';
        return res.status(409).json(new ApiFail(`Filter rule already exists for this ${ruleType}`));
      }

      // Deduplicate fields
      const deduplicatedFields = deduplicateFields(fields);

      const rule: IFieldFilterRule = {
        id: projectId,
        type: appId ? `FILTER_RULE#app#${appId}` : `FILTER_RULE#pipeline#${pipelineId}`,
        prefix: 'FILTER_RULE',
        projectId,
        pipelineId,
        appId,
        filterMode,
        fields: deduplicatedFields,
        createAt: Date.now(),
        updateAt: Date.now(),
        operator,
        deleted: false,
      };

      const ruleType = await store.addFieldFilterRule(rule);

      const response: any = {
        id: ruleType,
        fields: deduplicatedFields,
      };

      // Include warnings if any
      if (validation.warnings.length > 0) {
        response.warnings = validation.warnings;
      }

      return res.status(201).json(new ApiSuccess(response, 'Filter rule created.'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a field filter rule by projectId, pipelineId, and optional appId
   */
  public async get(req: any, res: any, next: any) {
    try {
      const { projectId, pipelineId, appId } = req.query;

      const rule = await store.getFieldFilterRule(projectId, pipelineId, appId);
      if (!rule) {
        return res.status(404).json(new ApiFail('Filter rule not found'));
      }

      return res.json(new ApiSuccess(rule));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a field filter rule
   */
  public async update(req: any, res: any, next: any) {
    try {
      const { projectId, pipelineId, appId, filterMode, fields } = req.body;
      const operator = res.get('X-Click-Stream-Operator') ?? '';

      // Validate the rule
      const validation = validateFilterRule({ projectId, pipelineId, appId, filterMode, fields });
      if (!validation.valid) {
        return res.status(400).json(new ApiFail('Validation failed', validation.errors));
      }

      // Check if rule exists
      const existingRule = await store.getFieldFilterRule(projectId, pipelineId, appId);
      if (!existingRule) {
        return res.status(404).json(new ApiFail('Filter rule not found'));
      }

      // Deduplicate fields
      const deduplicatedFields = deduplicateFields(fields);

      const rule: IFieldFilterRule = {
        ...existingRule,
        filterMode,
        fields: deduplicatedFields,
        updateAt: Date.now(),
        operator,
      };

      await store.updateFieldFilterRule(rule);

      const response: any = {
        id: rule.type,
        fields: deduplicatedFields,
      };

      // Include warnings if any
      if (validation.warnings.length > 0) {
        response.warnings = validation.warnings;
      }

      return res.json(new ApiSuccess(response, 'Filter rule updated.'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a field filter rule
   */
  public async delete(req: any, res: any, next: any) {
    try {
      const { projectId, pipelineId, appId } = req.query;
      const operator = res.get('X-Click-Stream-Operator') ?? '';

      // Check if rule exists
      const existingRule = await store.getFieldFilterRule(projectId, pipelineId, appId);
      if (!existingRule) {
        return res.status(404).json(new ApiFail('Filter rule not found'));
      }

      await store.deleteFieldFilterRule(projectId, pipelineId, appId, operator);

      return res.json(new ApiSuccess(null, 'Filter rule deleted.'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * List all field filter rules for a pipeline
   */
  public async listByPipeline(req: any, res: any, next: any) {
    try {
      const { projectId, pipelineId, pageNumber, pageSize } = req.query;

      const rules = await store.listFieldFilterRules(projectId, pipelineId);

      return res.json(new ApiSuccess({
        totalCount: rules.length,
        items: paginateData(rules, true, pageSize, pageNumber),
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the effective filter rule for an application
   * Priority: app-level rule > pipeline-level rule
   */
  public async getEffectiveRule(req: any, res: any, next: any) {
    try {
      const { projectId, pipelineId, appId } = req.query;

      // First try to get app-level rule
      const appRule = await store.getFieldFilterRule(projectId, pipelineId, appId);
      if (appRule) {
        return res.json(new ApiSuccess({
          ...appRule,
          source: 'app',
        }));
      }

      // Fall back to pipeline-level rule
      const pipelineRule = await store.getFieldFilterRule(projectId, pipelineId);
      if (pipelineRule) {
        return res.json(new ApiSuccess({
          ...pipelineRule,
          source: 'pipeline',
        }));
      }

      // No rule found - return null (default behavior: no filtering)
      return res.json(new ApiSuccess(null));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the effective filter rule for an application (internal method)
   * Priority: app-level rule > pipeline-level rule
   * @param projectId The project ID
   * @param pipelineId The pipeline ID
   * @param appId The application ID
   * @returns The effective filter rule or undefined
   */
  public async getEffectiveRuleInternal(
    projectId: string,
    pipelineId: string,
    appId: string,
  ): Promise<{ rule: IFieldFilterRule | undefined; source: 'app' | 'pipeline' | undefined }> {
    // First try to get app-level rule
    const appRule = await store.getFieldFilterRule(projectId, pipelineId, appId);
    if (appRule) {
      return { rule: appRule, source: 'app' };
    }

    // Fall back to pipeline-level rule
    const pipelineRule = await store.getFieldFilterRule(projectId, pipelineId);
    if (pipelineRule) {
      return { rule: pipelineRule, source: 'pipeline' };
    }

    // No rule found
    return { rule: undefined, source: undefined };
  }

  /**
   * Delete all filter rules for a pipeline (used for cascade delete)
   * @param projectId The project ID
   * @param pipelineId The pipeline ID
   * @param operator The operator performing the deletion
   */
  public async deleteByPipeline(projectId: string, pipelineId: string, operator: string): Promise<void> {
    const rules = await store.listFieldFilterRules(projectId, pipelineId);
    for (const rule of rules) {
      await store.deleteFieldFilterRule(projectId, pipelineId, rule.appId, operator);
    }
  }

  /**
   * Delete filter rule for an application (used for cascade delete)
   * @param projectId The project ID
   * @param pipelineId The pipeline ID
   * @param appId The application ID
   * @param operator The operator performing the deletion
   */
  public async deleteByApp(projectId: string, pipelineId: string, appId: string, operator: string): Promise<void> {
    const rule = await store.getFieldFilterRule(projectId, pipelineId, appId);
    if (rule) {
      await store.deleteFieldFilterRule(projectId, pipelineId, appId, operator);
    }
  }

  /**
   * Get all available fields for filtering
   */
  public async getAvailableFields(_req: any, res: any, next: any) {
    try {
      const fieldsByCategory = getFieldsByCategory();

      const response = {
        fields: EVENT_FIELDS,
        fieldsByCategory,
        categories: FIELD_CATEGORIES,
        categoryDisplayNames: CATEGORY_DISPLAY_NAMES,
        systemRequiredFields: SYSTEM_REQUIRED_FIELDS,
        totalCount: EVENT_FIELDS.length,
      };

      return res.json(new ApiSuccess(response));
    } catch (error) {
      next(error);
    }
  }
}
