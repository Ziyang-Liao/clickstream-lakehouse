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

export {};
declare global {
  /**
   * Filter mode type - whitelist or blacklist
   * - whitelist: Only collect specified fields
   * - blacklist: Collect all fields except specified ones
   */
  type FilterMode = 'whitelist' | 'blacklist';

  /**
   * Interface for field filter rule
   * Used to define field filtering behavior for data collection
   * Requirements: 8.1
   */
  interface IFieldFilterRule {
    // Primary key
    id?: string;           // projectId
    type?: string;         // "FILTER_RULE#pipeline#<pipelineId>" or "FILTER_RULE#app#<appId>"
    prefix?: string;       // "FILTER_RULE"

    // Association information
    projectId: string;     // Project ID
    pipelineId: string;    // Pipeline ID
    appId?: string;        // Application ID (optional, if present it's an app-level rule)

    // Filter configuration
    filterMode: FilterMode;  // "whitelist" or "blacklist"
    fields: string[];        // Field list

    // Audit information
    createAt?: number;     // Creation timestamp
    updateAt?: number;     // Update timestamp
    operator?: string;     // Operator

    // Soft delete flag
    deleted?: boolean;

    // Rule source (for effective rule response)
    source?: 'pipeline' | 'app';
  }

  /**
   * Interface for field filter rule list response
   */
  interface IFieldFilterRuleList {
    totalCount: number | undefined;
    items: IFieldFilterRule[];
  }
}
