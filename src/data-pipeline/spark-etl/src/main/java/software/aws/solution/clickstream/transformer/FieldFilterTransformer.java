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

package software.aws.solution.clickstream.transformer;

import lombok.extern.slf4j.Slf4j;
import org.apache.spark.sql.Column;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import software.aws.solution.clickstream.common.Constant;
import software.aws.solution.clickstream.model.FieldFilterRule;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.apache.spark.sql.functions.col;

/**
 * Transformer that applies field filtering to clickstream event data.
 * Supports both whitelist and blacklist filtering modes while protecting
 * system required fields from being filtered out.
 */
@Slf4j
public class FieldFilterTransformer {

    /**
     * System required fields that must always be present in the output.
     * These fields are essential for data pipeline and analytics functionality.
     */
    public static final Set<String> SYSTEM_REQUIRED_FIELDS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    Constant.EVENT_ID,
                    Constant.EVENT_NAME,
                    Constant.EVENT_TIMESTAMP,
                    Constant.APP_ID,
                    Constant.USER_PSEUDO_ID,
                    Constant.PLATFORM
            ))
    );

    /**
     * Transform the dataset by applying the specified filter rule.
     *
     * @param dataset The input dataset to filter
     * @param rule    The filter rule to apply (can be null for no filtering)
     * @return The filtered dataset
     */
    public Dataset<Row> transform(final Dataset<Row> dataset, final FieldFilterRule rule) {
        if (rule == null) {
            log.debug("No filter rule provided, returning original dataset");
            return dataset;
        }

        if (rule.getFilterMode() == null) {
            log.warn("Filter rule has no filter mode specified, returning original dataset");
            return dataset;
        }

        // For whitelist mode, empty fields list means only system required fields should be kept
        // For blacklist mode, empty fields list means no fields should be removed
        if (rule.getFields() == null || rule.getFields().isEmpty()) {
            if (rule.getFilterMode() == FieldFilterRule.FilterMode.WHITELIST) {
                log.info("Whitelist filter with empty fields list, returning only system required fields");
                return applyWhitelistFilter(dataset, Collections.emptyList());
            } else {
                log.debug("Blacklist filter with no fields specified, returning original dataset");
                return dataset;
            }
        }

        log.info("Applying {} filter with {} fields",
                rule.getFilterMode(), rule.getFields().size());

        switch (rule.getFilterMode()) {
            case WHITELIST:
                return applyWhitelistFilter(dataset, rule.getFields());
            case BLACKLIST:
                return applyBlacklistFilter(dataset, rule.getFields());
            default:
                log.warn("Unknown filter mode: {}, returning original dataset", rule.getFilterMode());
                return dataset;
        }
    }

    /**
     * Apply whitelist filtering to the dataset.
     * Only fields in the whitelist plus system required fields are retained.
     *
     * @param dataset        The input dataset
     * @param whitelistFields The list of fields to include
     * @return The filtered dataset containing only whitelisted and system required fields
     */
    public Dataset<Row> applyWhitelistFilter(final Dataset<Row> dataset, final List<String> whitelistFields) {
        Set<String> datasetColumns = new HashSet<>(Arrays.asList(dataset.columns()));
        Set<String> fieldsToKeep = new HashSet<>(whitelistFields);

        // Always include system required fields
        fieldsToKeep.addAll(SYSTEM_REQUIRED_FIELDS);

        // Filter to only include fields that exist in the dataset
        List<String> validFields = fieldsToKeep.stream()
                .filter(datasetColumns::contains)
                .collect(Collectors.toList());

        // If no valid fields exist (not even system required fields), return empty selection
        // This should not happen in practice as system required fields should always exist
        if (validFields.isEmpty()) {
            log.warn("No valid fields to select after whitelist filtering, returning original dataset");
            return dataset;
        }

        // Check if only system required fields remain (no whitelist fields matched)
        Set<String> matchedWhitelistFields = new HashSet<>(whitelistFields);
        matchedWhitelistFields.retainAll(datasetColumns);
        if (matchedWhitelistFields.isEmpty() && !whitelistFields.isEmpty()) {
            log.info("No whitelist fields found in dataset, returning only system required fields");
        }

        log.info("Whitelist filter: keeping {} fields out of {} total columns",
                validFields.size(), datasetColumns.size());

        Column[] columns = validFields.stream()
                .map(f -> col(f))
                .toArray(Column[]::new);

        return dataset.select(columns);
    }

    /**
     * Apply blacklist filtering to the dataset.
     * All fields except those in the blacklist are retained.
     * System required fields are protected and cannot be removed.
     *
     * @param dataset        The input dataset
     * @param blacklistFields The list of fields to exclude
     * @return The filtered dataset with blacklisted fields removed (except system required)
     */
    public Dataset<Row> applyBlacklistFilter(final Dataset<Row> dataset, final List<String> blacklistFields) {
        Set<String> datasetColumns = new HashSet<>(Arrays.asList(dataset.columns()));
        Set<String> fieldsToRemove = new HashSet<>(blacklistFields);

        // Protect system required fields - remove them from the blacklist
        Set<String> protectedFields = new HashSet<>();
        for (String field : fieldsToRemove) {
            if (SYSTEM_REQUIRED_FIELDS.contains(field)) {
                protectedFields.add(field);
                log.warn("System required field '{}' cannot be removed by blacklist filter", field);
            }
        }
        fieldsToRemove.removeAll(protectedFields);

        // Calculate fields to keep
        List<String> fieldsToKeep = datasetColumns.stream()
                .filter(f -> !fieldsToRemove.contains(f))
                .collect(Collectors.toList());

        if (fieldsToKeep.isEmpty()) {
            log.warn("No fields remaining after blacklist filtering, returning original dataset");
            return dataset;
        }

        log.info("Blacklist filter: removing {} fields, keeping {} fields",
                fieldsToRemove.size(), fieldsToKeep.size());

        Column[] columns = fieldsToKeep.stream()
                .map(f -> col(f))
                .toArray(Column[]::new);

        return dataset.select(columns);
    }

    /**
     * Get the list of fields that would be retained after applying a filter rule.
     * Useful for validation and preview purposes.
     *
     * @param datasetColumns The columns in the dataset
     * @param rule           The filter rule to apply
     * @return List of field names that would be retained
     */
    public List<String> getRetainedFields(final Set<String> datasetColumns, final FieldFilterRule rule) {
        if (rule == null || rule.getFields() == null || rule.getFilterMode() == null) {
            return new ArrayList<>(datasetColumns);
        }

        Set<String> result = new HashSet<>();

        switch (rule.getFilterMode()) {
            case WHITELIST:
                result.addAll(rule.getFields());
                result.addAll(SYSTEM_REQUIRED_FIELDS);
                result.retainAll(datasetColumns);
                break;
            case BLACKLIST:
                result.addAll(datasetColumns);
                Set<String> toRemove = new HashSet<>(rule.getFields());
                toRemove.removeAll(SYSTEM_REQUIRED_FIELDS); // Protect system fields
                result.removeAll(toRemove);
                break;
            default:
                result.addAll(datasetColumns);
        }

        return new ArrayList<>(result);
    }
}
