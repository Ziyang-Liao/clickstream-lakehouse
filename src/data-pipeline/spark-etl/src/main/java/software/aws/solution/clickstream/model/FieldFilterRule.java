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

package software.aws.solution.clickstream.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * Model class representing a field filter rule for controlling which fields
 * are collected in clickstream events.
 */
@Getter
@Setter
@ToString
@EqualsAndHashCode
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FieldFilterRule {

    /**
     * The project ID this rule belongs to.
     */
    private String projectId;

    /**
     * The pipeline ID this rule is associated with.
     */
    private String pipelineId;

    /**
     * The application ID this rule is associated with.
     * If null, this is a pipeline-level rule.
     */
    private String appId;

    /**
     * The filter mode: WHITELIST or BLACKLIST.
     */
    private FilterMode filterMode;

    /**
     * The list of field names to include (whitelist) or exclude (blacklist).
     */
    private List<String> fields;

    /**
     * Enum representing the filter mode for field filtering.
     */
    public enum FilterMode {
        /**
         * Whitelist mode: only specified fields are collected.
         */
        WHITELIST,

        /**
         * Blacklist mode: all fields except specified ones are collected.
         */
        BLACKLIST
    }
}
