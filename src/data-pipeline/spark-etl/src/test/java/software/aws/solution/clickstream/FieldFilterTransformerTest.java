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

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.RowFactory;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructField;
import org.apache.spark.sql.types.StructType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.aws.solution.clickstream.model.FieldFilterRule;
import software.aws.solution.clickstream.transformer.FieldFilterTransformer;

import java.util.*;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for FieldFilterTransformer.
 */
public class FieldFilterTransformerTest extends BaseSparkTest {

    private FieldFilterTransformer transformer;

    @BeforeEach
    @Override
    public void init() {
        super.init();
        transformer = new FieldFilterTransformer();
    }

    @Test
    void testWhitelistFilterKeepsOnlySpecifiedAndSystemFields() {
        // DOWNLOAD_FILE=0 ./gradlew clean test --info --tests software.aws.solution.clickstream.FieldFilterTransformerTest.testWhitelistFilterKeepsOnlySpecifiedAndSystemFields
        
        // Create dataset with system fields + extra fields
        List<String> allFields = new ArrayList<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        allFields.add("custom_field_1");
        allFields.add("custom_field_2");
        allFields.add("custom_field_3");
        
        Dataset<Row> inputDataset = createDatasetWithFields(allFields);
        
        // Create whitelist rule with only custom_field_1
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(FieldFilterRule.FilterMode.WHITELIST)
                .fields(Arrays.asList("custom_field_1"))
                .build();
        
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        
        // Should contain system required fields + custom_field_1
        assertThat(outputFields).containsAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        assertThat(outputFields).contains("custom_field_1");
        assertThat(outputFields).doesNotContain("custom_field_2", "custom_field_3");
    }

    @Test
    void testBlacklistFilterRemovesSpecifiedFieldsButKeepsSystemFields() {
        // DOWNLOAD_FILE=0 ./gradlew clean test --info --tests software.aws.solution.clickstream.FieldFilterTransformerTest.testBlacklistFilterRemovesSpecifiedFieldsButKeepsSystemFields
        
        // Create dataset with system fields + extra fields
        List<String> allFields = new ArrayList<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        allFields.add("custom_field_1");
        allFields.add("custom_field_2");
        allFields.add("custom_field_3");
        
        Dataset<Row> inputDataset = createDatasetWithFields(allFields);
        
        // Create blacklist rule to remove custom_field_1 and custom_field_2
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(FieldFilterRule.FilterMode.BLACKLIST)
                .fields(Arrays.asList("custom_field_1", "custom_field_2"))
                .build();
        
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        
        // Should contain system required fields + custom_field_3
        assertThat(outputFields).containsAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        assertThat(outputFields).contains("custom_field_3");
        assertThat(outputFields).doesNotContain("custom_field_1", "custom_field_2");
    }

    @Test
    void testBlacklistCannotRemoveSystemRequiredFields() {
        // DOWNLOAD_FILE=0 ./gradlew clean test --info --tests software.aws.solution.clickstream.FieldFilterTransformerTest.testBlacklistCannotRemoveSystemRequiredFields
        
        // Create dataset with system fields + extra fields
        List<String> allFields = new ArrayList<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        allFields.add("custom_field_1");
        
        Dataset<Row> inputDataset = createDatasetWithFields(allFields);
        
        // Try to blacklist system required fields
        List<String> blacklist = new ArrayList<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        blacklist.add("custom_field_1");
        
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(FieldFilterRule.FilterMode.BLACKLIST)
                .fields(blacklist)
                .build();
        
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        
        // System required fields should still be present
        assertThat(outputFields).containsAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        // custom_field_1 should be removed
        assertThat(outputFields).doesNotContain("custom_field_1");
    }

    @Test
    void testNullRuleReturnsOriginalDataset() {
        // DOWNLOAD_FILE=0 ./gradlew clean test --info --tests software.aws.solution.clickstream.FieldFilterTransformerTest.testNullRuleReturnsOriginalDataset
        
        List<String> allFields = new ArrayList<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        allFields.add("custom_field_1");
        
        Dataset<Row> inputDataset = createDatasetWithFields(allFields);
        
        Dataset<Row> outputDataset = transformer.transform(inputDataset, null);
        
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        
        // Should contain all original fields
        assertThat(outputFields).containsAll(allFields);
    }

    @Test
    void testEmptyWhitelistReturnsOnlySystemRequiredFields() {
        // DOWNLOAD_FILE=0 ./gradlew clean test --info --tests software.aws.solution.clickstream.FieldFilterTransformerTest.testEmptyWhitelistReturnsOnlySystemRequiredFields
        // Per requirements: IF 字段列表为空且模式为白名单 THEN THE Field_Filter_Service SHALL 返回警告提示（将不收集任何字段）
        // This means only system required fields should be kept when whitelist is empty
        
        List<String> allFields = new ArrayList<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        allFields.add("custom_field_1");
        
        Dataset<Row> inputDataset = createDatasetWithFields(allFields);
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(FieldFilterRule.FilterMode.WHITELIST)
                .fields(Collections.emptyList())
                .build();
        
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        
        // Should contain only system required fields when whitelist is empty
        assertThat(outputFields).containsExactlyInAnyOrderElementsOf(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        assertThat(outputFields).doesNotContain("custom_field_1");
    }

    @Test
    void testWhitelistWithNonExistentFieldsOnlyKeepsExistingFields() {
        // DOWNLOAD_FILE=0 ./gradlew clean test --info --tests software.aws.solution.clickstream.FieldFilterTransformerTest.testWhitelistWithNonExistentFieldsOnlyKeepsExistingFields
        
        List<String> allFields = new ArrayList<>(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        allFields.add("custom_field_1");
        
        Dataset<Row> inputDataset = createDatasetWithFields(allFields);
        
        // Whitelist includes non-existent field
        FieldFilterRule rule = FieldFilterRule.builder()
                .filterMode(FieldFilterRule.FilterMode.WHITELIST)
                .fields(Arrays.asList("custom_field_1", "non_existent_field"))
                .build();
        
        Dataset<Row> outputDataset = transformer.transform(inputDataset, rule);
        
        Set<String> outputFields = new HashSet<>(Arrays.asList(outputDataset.columns()));
        
        // Should contain system required fields + custom_field_1
        assertThat(outputFields).containsAll(FieldFilterTransformer.SYSTEM_REQUIRED_FIELDS);
        assertThat(outputFields).contains("custom_field_1");
        assertThat(outputFields).doesNotContain("non_existent_field");
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
}
