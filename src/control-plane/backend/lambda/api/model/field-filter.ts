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

/**
 * Filter mode type - whitelist or blacklist
 * - whitelist: Only collect specified fields
 * - blacklist: Collect all fields except specified ones
 */
export type FilterMode = 'whitelist' | 'blacklist';

/**
 * Interface for field filter rule
 * Used to define field filtering behavior for data collection
 */
export interface IFieldFilterRule {
  // Primary key
  readonly id: string; // projectId
  readonly type: string; // "FILTER_RULE#pipeline#<pipelineId>" or "FILTER_RULE#app#<appId>"
  readonly prefix: string; // "FILTER_RULE"

  // Association information
  readonly projectId: string; // Project ID
  readonly pipelineId: string; // Pipeline ID
  readonly appId?: string; // Application ID (optional, if present it's an app-level rule)

  // Filter configuration
  readonly filterMode: FilterMode; // "whitelist" or "blacklist"
  readonly fields: string[]; // Field list

  // Audit information
  readonly createAt: number; // Creation timestamp
  readonly updateAt: number; // Update timestamp
  readonly operator: string; // Operator

  // Soft delete flag
  readonly deleted: boolean;
}

/**
 * Interface for field filter rule list response
 */
export interface IFieldFilterRuleList {
  totalCount: number | undefined;
  items: IFieldFilterRule[];
}
