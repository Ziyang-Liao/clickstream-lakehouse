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

package software.aws.solution.clickstream;

import net.jqwik.api.*;
import net.jqwik.api.constraints.*;
import net.jqwik.api.lifecycle.*;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.core.config.Configurator;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.RowFactory;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructField;
import org.apache.spark.sql.types.StructType;
import software.aws.solution.clickstream.model.FieldFilterRule;
import software.aws.solution.clickstream.transformer.FieldFilterTransformer;
import software.aws.solution.clickstream.util.ContextUtil;

import java.util.*;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static software.aws.solution.clickstream.util.ContextUtil.*;

/**
 * Property-based tests for FieldFilterTransformer.
 * 
 * Feature: field-collection-filter
 */
public class FieldFilterTransformerPropertyTest {

    private static SparkSession spark;
    private FieldFilterTransformer transformer;

    @BeforeContainer
    static void setupSpark() {
        Configurator.setRootLevel(Level.WARN);
        Configurator.setLevel("software.aws.solution.clickstream", Level.DEBUG);
        ContextUtil.setEnableEventTimeShift(true);
        
        System.setProperty(JOB_NAME_PROP, "test-job");
        System.setProperty(WAREHOUSE_DIR_PROP, "/tmp/warehouse");
        System.setProperty(DATABASE_PROP, "test_db");
        System.setProperty(USER_KEEP_DAYS_PROP, String.valueOf(365 * 100));
        System.setProperty(ITEM_KEEP_DAYS_PROP, String.valueOf(365 * 100));

        spark = SparkSession.builder()
                .appName("FieldFilterTransformer Property Test")
                .master("local[*]")
                .config("spark.driver.bindAddress", "127.0.0.1")
                .config("spark.sql.warehouse.dir", "/tmp/warehouse")
                .config("spark.sql.mapKeyDedupPolicy", "LAST_WIN")
                .config("spark.sql.session.timeZone", "UTC")
                .getOrCreate();
    }

    @AfterContainer
    static void teardownSpark() {
        if (spark != null) {
            spark.stop();
        }
    }

    @BeforeProperty
    void setup() {
        transformer = new FieldFilterTransformer();
    }

    /**
     * Feature: field-collection-filter, Property 2: Whitelist Filtering Correctness
     * 
     * For any event with arbitrary fields and any whitelist filter rule, 
     * applying the filter should result in an event containing only the fields 
     * in the whitelist plus system required fields.
     * 
     * Validates: Requirements 2.1, 7.3, 10.2
     */
    @Property(tries = 100)
    void whitelistFilteringContainsOnlyWhitelistedAndSystemFields(
            @ForAll @Size(min = 1, max = 10) List<@AlphaChars @StringLength(min = 1, max = 20) String> extraFields,
            @ForAll @Size(min = 1, max = 5) List<@AlphaChars @StringLength(min = 1, max = 20) String> whitelistFields
    ) {
        // Create a dataset with system required fields plus extra fields
        Set<String> allFields = new HashSet<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        // Make extra fields unique by adding prefix and index
        List<String> uniqueExtraFields = new ArrayList<>();
        int index = 0;
        for (String f : extraFields) {
            String uniqueField = "extra_" + index + "_" + f;
            if (!allFields.contains(uniqueField)) {
                uniqueExtraFields.add(uniqueField);
                allFields.add(uniqueField);
            }
            index++;
        }
        
        if (uniqueExtraFields.isEmpty()) {
            return; // Skip if no unique extra fields could be generated
        }
        
        Dataset<Row> inputDataset = createDatasetWithFields(new ArrayList<>(allFields));
        
        // Create whitelist rule with some of the extra fields
        List<String> whitelistWithPrefix = new ArrayList<>();
        int wIndex = 0;
        for (String f : whitelistFields) {
            String candidate = "extra_" + wIndex + "_" + f;
            if (uniqueExtraFields.contains(candidate)) {
                whitelistWithPrefix.add(candidate);
            }
            wIndex++;
        }
        
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(FieldFilterRule.FilterMode.WHITELIST)
                .fields(whitelistWithPrefix)
                .build();
        
        // Apply filter
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        // Verify output contains only whitelisted fields and system required fields
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        Set<String> expectedFields = new HashSet<>(whitelistWithPrefix);
        expectedFields.addAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        expectedFields.retainAll(allFields); // Only fields that exist in input
        
        assertThat(outputFields).containsAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        assertThat(outputFields).isSubsetOf(expectedFields);
    }

    /**
     * Feature: field-collection-filter, Property 3: Blacklist Filtering Correctness
     * 
     * For any event with arbitrary fields and any blacklist filter rule, 
     * applying the filter should result in an event containing all original fields 
     * except those in the blacklist (system required fields are never removed).
     * 
     * Validates: Requirements 2.2, 7.4, 10.3
     */
    @Property(tries = 100)
    void blacklistFilteringRemovesOnlyBlacklistedFieldsExceptSystemFields(
            @ForAll @Size(min = 1, max = 10) List<@AlphaChars @StringLength(min = 1, max = 20) String> extraFields,
            @ForAll @Size(min = 1, max = 5) List<@AlphaChars @StringLength(min = 1, max = 20) String> blacklistFields
    ) {
        // Create a dataset with system required fields plus extra fields
        Set<String> allFields = new HashSet<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        List<String> uniqueExtraFields = new ArrayList<>();
        int index = 0;
        for (String f : extraFields) {
            String uniqueField = "extra_" + index + "_" + f;
            if (!allFields.contains(uniqueField)) {
                uniqueExtraFields.add(uniqueField);
                allFields.add(uniqueField);
            }
            index++;
        }
        
        if (uniqueExtraFields.isEmpty()) {
            return; // Skip if no unique extra fields could be generated
        }
        
        Dataset<Row> inputDataset = createDatasetWithFields(new ArrayList<>(allFields));
        
        // Create blacklist rule with unique field names
        List<String> blacklistWithPrefix = new ArrayList<>();
        int bIndex = 0;
        for (String f : blacklistFields) {
            String candidate = "extra_" + bIndex + "_" + f;
            if (uniqueExtraFields.contains(candidate) && !blacklistWithPrefix.contains(candidate)) {
                blacklistWithPrefix.add(candidate);
            }
            bIndex++;
        }
        
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(FieldFilterRule.FilterMode.BLACKLIST)
                .fields(blacklistWithPrefix)
                .build();
        
        // Apply filter
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        // Verify output
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        
        // System required fields should always be present
        assertThat(outputFields).containsAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        
        // Blacklisted fields (that are not system required) should be removed
        Set<String> removableBlacklistFields = new HashSet<>(blacklistWithPrefix);
        removableBlacklistFields.removeAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        removableBlacklistFields.retainAll(allFields); // Only fields that existed
        
        for (String removedField : removableBlacklistFields) {
            assertThat(outputFields).doesNotContain(removedField);
        }
    }

    /**
     * Feature: field-collection-filter, Property 8: System Required Fields Protection
     * 
     * For any filter rule (whitelist or blacklist) and any event, 
     * the filtered event should always contain all system required fields.
     * 
     * Validates: Requirements 7.5, 10.1, 10.2, 10.3
     */
    @Property(tries = 100)
    void systemRequiredFieldsAreAlwaysProtected(
            @ForAll @Size(min = 0, max = 10) List<@AlphaChars @StringLength(min = 1, max = 20) String> filterFields,
            @ForAll("filterModes") FieldFilterRule.FilterMode filterMode
    ) {
        // Create a dataset with all system required fields plus some extra
        Set<String> allFields = new HashSet<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        allFields.add("extra_field_1");
        allFields.add("extra_field_2");
        allFields.add("extra_field_3");
        
        Dataset<Row> inputDataset = createDatasetWithFields(new ArrayList<>(allFields));
        
        // Create filter rule that might try to remove system fields
        List<String> fieldsToFilter = new ArrayList<>(filterFields);
        // Add some system required fields to the filter list to test protection
        fieldsToFilter.addAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(filterMode)
                .fields(fieldsToFilter)
                .build();
        
        // Apply filter
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        // Verify all system required fields are still present
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        assertThat(outputFields).containsAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
    }

    /**
     * Helper method to create a dataset with specified field names.
     */
    private Dataset<Row> createDatasetWithFields(List<String> fieldNames) {
        List<StructField> structFields = fieldNames.stream()
                .map(name -> DataTypes.createStructField(name, DataTypes.StringType, true))
                .collect(Collectors.toList());
        
        StructType schema = DataTypes.createStructType(structFields);
        
        // Create a single row with dummy values
        Object[] values = fieldNames.stream()
                .map(name -> "value_" + name)
                .toArray();
        
        Row row = RowFactory.create(values);
        
        return spark.createDataFrame(Collections.singletonList(row), schema);
    }

    /**
     * Provide arbitrary FilterMode values for property testing.
     */
    @Provide
    Arbitrary<FieldFilterRule.FilterMode> filterModes() {
        return Arbitraries.of(FieldFilterRule.FilterMode.values());
    }
}
