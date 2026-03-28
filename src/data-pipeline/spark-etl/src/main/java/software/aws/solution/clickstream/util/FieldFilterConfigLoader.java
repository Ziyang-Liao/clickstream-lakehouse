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

package software.aws.solution.clickstream.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Encoders;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import software.aws.solution.clickstream.model.FieldFilterRule;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.apache.spark.sql.functions.col;
import static org.apache.spark.sql.functions.decode;

/**
 * Utility class for loading field filter rules from S3 configuration files.
 * Supports loading both pipeline-level and app-level filter rules.
 */
@Slf4j
public class FieldFilterConfigLoader {

    private static final String FIELD_FILTER_FILE_NAME = "field_filter_rule.json";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final Map<String, FieldFilterRule> pipelineRules;
    private final Map<String, FieldFilterRule> appRules;

    public FieldFilterConfigLoader() {
        this.pipelineRules = new HashMap<>();
        this.appRules = new HashMap<>();
    }

    /**
     * Load filter rules from the specified S3 configuration directory.
     *
     * @param spark         The SparkSession to use for reading files
     * @param configRuleDir The S3 path to the configuration directory
     * @return A map of appId to FieldFilterRule for all loaded rules
     */
    public Map<String, FieldFilterRule> loadRules(final SparkSession spark, final String configRuleDir) {
        if (configRuleDir == null || configRuleDir.isEmpty()) {
            log.warn("configRuleDir is null or empty, skipping field filter rule loading");
            return new HashMap<>();
        }

        log.info("Loading field filter rules from: {}", configRuleDir);

        try {
            Dataset<Row> configFileDataset = spark.read().format("binaryFile")
                    .option("pathGlobFilter", FIELD_FILTER_FILE_NAME)
                    .option("recursiveFileLookup", "true")
                    .load(configRuleDir);

            List<PathContent> configFileList = configFileDataset
                    .select(col("path"), decode(col("content"), "utf8").alias("content"))
                    .as(Encoders.bean(PathContent.class))
                    .collectAsList();

            for (PathContent pathContent : configFileList) {
                processConfigFile(pathContent);
            }

            log.info("Loaded {} pipeline rules and {} app rules",
                    pipelineRules.size(), appRules.size());

        } catch (Exception e) {
            log.error("Failed to load field filter rules from {}: {}", configRuleDir, e.getMessage());
        }

        // Return combined map with app rules taking precedence
        Map<String, FieldFilterRule> allRules = new HashMap<>(pipelineRules);
        allRules.putAll(appRules);
        return allRules;
    }

    /**
     * Process a single configuration file and extract the filter rule.
     *
     * @param pathContent The path and content of the configuration file
     */
    private void processConfigFile(final PathContent pathContent) {
        String path = pathContent.getPath();
        String content = pathContent.getContent();

        log.info("Processing field filter config file: {}", path);

        try {
            FieldFilterRule rule = parseFilterRule(content);
            if (rule == null) {
                log.warn("Failed to parse filter rule from: {}", path);
                return;
            }

            // Determine if this is a pipeline-level or app-level rule
            if (rule.getAppId() != null && !rule.getAppId().isEmpty()) {
                appRules.put(rule.getAppId(), rule);
                log.info("Loaded app-level filter rule for appId: {}", rule.getAppId());
            } else if (rule.getPipelineId() != null && !rule.getPipelineId().isEmpty()) {
                pipelineRules.put(rule.getPipelineId(), rule);
                log.info("Loaded pipeline-level filter rule for pipelineId: {}", rule.getPipelineId());
            }
        } catch (Exception e) {
            log.error("Error processing config file {}: {}", path, e.getMessage());
        }
    }

    /**
     * Parse a JSON string into a FieldFilterRule object.
     *
     * @param jsonContent The JSON content to parse
     * @return The parsed FieldFilterRule, or null if parsing fails
     */
    private FieldFilterRule parseFilterRule(final String jsonContent) {
        try {
            Map<String, Object> jsonMap = OBJECT_MAPPER.readValue(jsonContent,
                    new TypeReference<Map<String, Object>>() { });

            FieldFilterRule.FieldFilterRuleBuilder builder = FieldFilterRule.builder();

            if (jsonMap.containsKey("projectId")) {
                builder.projectId((String) jsonMap.get("projectId"));
            }
            if (jsonMap.containsKey("pipelineId")) {
                builder.pipelineId((String) jsonMap.get("pipelineId"));
            }
            if (jsonMap.containsKey("appId")) {
                builder.appId((String) jsonMap.get("appId"));
            }
            if (jsonMap.containsKey("filterMode")) {
                String mode = (String) jsonMap.get("filterMode");
                builder.filterMode(FieldFilterRule.FilterMode.valueOf(mode.toUpperCase()));
            }
            if (jsonMap.containsKey("fields")) {
                @SuppressWarnings("unchecked")
                List<String> fields = (List<String>) jsonMap.get("fields");
                builder.fields(fields);
            }

            return builder.build();
        } catch (Exception e) {
            log.error("Failed to parse filter rule JSON: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Get the effective filter rule for a specific application.
     * App-level rules take priority over pipeline-level rules.
     *
     * @param appId      The application ID
     * @param pipelineId The pipeline ID (used as fallback)
     * @return The effective FieldFilterRule, or empty if no rule exists
     */
    public Optional<FieldFilterRule> getEffectiveRule(final String appId, final String pipelineId) {
        // First, check for app-level rule (highest priority)
        if (appId != null && appRules.containsKey(appId)) {
            log.debug("Using app-level filter rule for appId: {}", appId);
            return Optional.of(appRules.get(appId));
        }

        // Fall back to pipeline-level rule
        if (pipelineId != null && pipelineRules.containsKey(pipelineId)) {
            log.debug("Using pipeline-level filter rule for pipelineId: {}", pipelineId);
            return Optional.of(pipelineRules.get(pipelineId));
        }

        log.debug("No filter rule found for appId: {} or pipelineId: {}", appId, pipelineId);
        return Optional.empty();
    }

    /**
     * Get all pipeline-level rules.
     *
     * @return Map of pipelineId to FieldFilterRule
     */
    public Map<String, FieldFilterRule> getPipelineRules() {
        return new HashMap<>(pipelineRules);
    }

    /**
     * Get all app-level rules.
     *
     * @return Map of appId to FieldFilterRule
     */
    public Map<String, FieldFilterRule> getAppRules() {
        return new HashMap<>(appRules);
    }

    /**
     * Clear all loaded rules.
     */
    public void clearRules() {
        pipelineRules.clear();
        appRules.clear();
    }
}
