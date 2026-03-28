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

package software.aws.solution.clickstream.common;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

import java.io.Serializable;
import java.util.List;

/**
 * Configuration class for field filter rules.
 * Used to pass field filter configuration to transformers.
 */
@Getter
@Setter
@ToString
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FieldFilterRuleConfig implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * The project ID this rule belongs to.
     */
    private String projectId; // NOSONAR

    /**
     * The pipeline ID this rule is associated with.
     */
    private String pipelineId; // NOSONAR

    /**
     * The application ID this rule is associated with.
     * If null, this is a pipeline-level rule.
     */
    private String appId; // NOSONAR

    /**
     * The filter mode: "whitelist" or "blacklist".
     */
    private String filterMode; // NOSONAR

    /**
     * The list of field names to include (whitelist) or exclude (blacklist).
     */
    private List<String> fields; // NOSONAR
}
