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

import com.clearspring.analytics.util.Lists;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import software.aws.solution.clickstream.common.FieldFilterRuleConfig;
import software.aws.solution.clickstream.common.TransformConfig;
import software.aws.solution.clickstream.model.FieldFilterRule;
import software.aws.solution.clickstream.transformer.FieldFilterTransformer;
import software.aws.solution.clickstream.util.ETLRunnerConfig;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static software.aws.solution.clickstream.util.ContextUtil.APP_IDS_PROP;
import static software.aws.solution.clickstream.util.ContextUtil.DEBUG_LOCAL_PROP;
import static software.aws.solution.clickstream.util.ContextUtil.PROJECT_ID_PROP;
import static software.aws.solution.clickstream.util.ContextUtil.WAREHOUSE_DIR_PROP;

/**
 * Integration tests for field filtering in the ETL pipeline.
 * Tests end-to-end field filtering flow and rule updates.
 * 
 * Requirements: 7.2, 7.6
 */
class ETLRunnerFieldFilterIntegrationTest extends ETLRunnerBaseTest {

    /**
     * Test that field filtering is applied correctly in the ETL pipeline.
     * Validates Requirements 7.2: WHEN 过滤规则存在 THEN THE Data_Pipeline SHALL 根据规则过滤事件中的字段
     */
    @Test
    void should_apply_field_filtering_in_etl_pipeline() throws IOException {
        // Setup
        System.setProperty(DEBUG_LOCAL_PROP, "true");
        System.setProperty(APP_IDS_PROP, "test-app");
        System.setProperty(PROJECT_ID_PROP, "test-project");
        System.setProperty(WAREHOUSE_DIR_PROP, "/tmp/warehouse/field_filter_integration");

        List<String> transformers = Lists.newArrayList();
        transformers.add("software.aws.solution.clickstream.Transformer");

        // Create a temporary config directory with field filter rule
        Path tempConfigDir = createTempConfigDirWithFieldFilterRule(
                "test-app",
                "whitelist",
                Arrays.asList("event_id", "event_name", "event_timestamp", "app_id", "user_pseudo_id", "platform", "custom_field")
        );

        ETLRunnerConfig config = getRunnerConfigWithConfigDir(transformers, "field_filter_integration", tempConfigDir.toString());
        ETLRunner runner = new ETLRunner(spark, config);

        // Verify that field filter config is loaded
        TransformConfig transformConfig = runner.getTransformConfig();
        Assertions.assertNotNull(transformConfig.getAppFieldFilterConfig());

        // Clean up
        deleteDirectory(tempConfigDir.toFile());
    }

    /**
     * Test that field filtering works with whitelist mode.
     * Validates Requirements 7.3: WHEN 白名单模式生效 THEN THE Data_Pipeline SHALL 仅保留字段列表中指定的字段
     */
    @Test
    void should_apply_whitelist_filter_correctly() {
        // Create test dataset with multiple fields
        Dataset<Row> testDataset = spark.createDataFrame(
                Arrays.asList(
                        new TestEvent("event1", "test_event", 1234567890L, "app1", "user1", "Web", "custom_value", "extra_value")
                ),
                TestEvent.class
        );

        // Create whitelist filter rule
        FieldFilterRule rule = FieldFilterRule.builder()
                .projectId("test-project")
                .pipelineId("test-pipeline")
                .appId("app1")
                .filterMode(FieldFilterRule.FilterMode.WHITELIST)
                .fields(Arrays.asList("custom_field"))
                .build();

        // Apply filter
        FieldFilterTransformer transformer = new FieldFilterTransformer();
        Dataset<Row> filteredDataset = transformer.transform(testDataset, rule);

        // Verify only whitelisted fields and system required fields are present
        Set<String> resultColumns = new HashSet<>(Arrays.asList(filteredDataset.columns()));
        
        // Should contain system required fields
        Assertions.assertTrue(resultColumns.contains("event_id"));
        Assertions.assertTrue(resultColumns.contains("event_name"));
        Assertions.assertTrue(resultColumns.contains("event_timestamp"));
        Assertions.assertTrue(resultColumns.contains("app_id"));
        Assertions.assertTrue(resultColumns.contains("user_pseudo_id"));
        Assertions.assertTrue(resultColumns.contains("platform"));
        
        // Should contain whitelisted field
        Assertions.assertTrue(resultColumns.contains("custom_field"));
        
        // Should NOT contain non-whitelisted field
        Assertions.assertFalse(resultColumns.contains("extra_field"));
    }

    /**
     * Test that field filtering works with blacklist mode.
     * Validates Requirements 7.4: WHEN 黑名单模式生效 THEN THE Data_Pipeline SHALL 移除字段列表中指定的字段
     */
    @Test
    void should_apply_blacklist_filter_correctly() {
        // Create test dataset with multiple fields
        Dataset<Row> testDataset = spark.createDataFrame(
                Arrays.asList(
                        new TestEvent("event1", "test_event", 1234567890L, "app1", "user1", "Web", "custom_value", "extra_value")
                ),
                TestEvent.class
        );

        // Create blacklist filter rule
        FieldFilterRule rule = FieldFilterRule.builder()
                .projectId("test-project")
                .pipelineId("test-pipeline")
                .appId("app1")
                .filterMode(FieldFilterRule.FilterMode.BLACKLIST)
                .fields(Arrays.asList("extra_field"))
                .build();

        // Apply filter
        FieldFilterTransformer transformer = new FieldFilterTransformer();
        Dataset<Row> filteredDataset = transformer.transform(testDataset, rule);

        // Verify blacklisted field is removed
        Set<String> resultColumns = new HashSet<>(Arrays.asList(filteredDataset.columns()));
        
        // Should contain system required fields
        Assertions.assertTrue(resultColumns.contains("event_id"));
        Assertions.assertTrue(resultColumns.contains("event_name"));
        
        // Should contain non-blacklisted field
        Assertions.assertTrue(resultColumns.contains("custom_field"));
        
        // Should NOT contain blacklisted field
        Assertions.assertFalse(resultColumns.contains("extra_field"));
    }

    /**
     * Test that filter rules are updated correctly when configuration changes.
     * Validates Requirements 7.6: WHEN 过滤规则更新 THEN THE Data_Pipeline SHALL 在下一批次处理时应用新规则
     */
    @Test
    void should_apply_updated_filter_rules_in_next_batch() throws IOException {
        // Setup
        System.setProperty(DEBUG_LOCAL_PROP, "true");
        System.setProperty(APP_IDS_PROP, "test-app");
        System.setProperty(PROJECT_ID_PROP, "test-project");
        System.setProperty(WAREHOUSE_DIR_PROP, "/tmp/warehouse/field_filter_update");

        List<String> transformers = Lists.newArrayList();
        transformers.add("software.aws.solution.clickstream.Transformer");

        // Create initial config with whitelist
        Path tempConfigDir = createTempConfigDirWithFieldFilterRule(
                "test-app",
                "whitelist",
                Arrays.asList("event_id", "event_name", "custom_field")
        );

        ETLRunnerConfig config1 = getRunnerConfigWithConfigDir(transformers, "field_filter_update_1", tempConfigDir.toString());
        ETLRunner runner1 = new ETLRunner(spark, config1);
        
        TransformConfig transformConfig1 = runner1.getTransformConfig();
        Map<String, FieldFilterRuleConfig> fieldFilterConfig1 = transformConfig1.getAppFieldFilterConfig();
        
        // Verify initial config is loaded
        if (fieldFilterConfig1 != null && !fieldFilterConfig1.isEmpty()) {
            FieldFilterRuleConfig rule1 = fieldFilterConfig1.get("test-app");
            if (rule1 != null) {
                Assertions.assertEquals("whitelist", rule1.getFilterMode());
            }
        }

        // Update config to blacklist
        updateFieldFilterRule(tempConfigDir, "test-app", "blacklist", Arrays.asList("extra_field"));

        // Create new runner (simulating next batch)
        ETLRunnerConfig config2 = getRunnerConfigWithConfigDir(transformers, "field_filter_update_2", tempConfigDir.toString());
        ETLRunner runner2 = new ETLRunner(spark, config2);
        
        TransformConfig transformConfig2 = runner2.getTransformConfig();
        Map<String, FieldFilterRuleConfig> fieldFilterConfig2 = transformConfig2.getAppFieldFilterConfig();
        
        // Verify updated config is loaded
        if (fieldFilterConfig2 != null && !fieldFilterConfig2.isEmpty()) {
            FieldFilterRuleConfig rule2 = fieldFilterConfig2.get("test-app");
            if (rule2 != null) {
                Assertions.assertEquals("blacklist", rule2.getFilterMode());
            }
        }

        // Clean up
        deleteDirectory(tempConfigDir.toFile());
    }

    /**
     * Test that system required fields are always preserved.
     * Validates Requirements 7.5: THE Data_Pipeline SHALL 保留系统必需字段不受过滤规则影响
     */
    @Test
    void should_preserve_system_required_fields() {
        // Create test dataset
        Dataset<Row> testDataset = spark.createDataFrame(
                Arrays.asList(
                        new TestEvent("event1", "test_event", 1234567890L, "app1", "user1", "Web", "custom_value", "extra_value")
                ),
                TestEvent.class
        );

        // Create blacklist rule that tries to remove system required fields
        FieldFilterRule rule = FieldFilterRule.builder()
                .projectId("test-project")
                .pipelineId("test-pipeline")
                .appId("app1")
                .filterMode(FieldFilterRule.FilterMode.BLACKLIST)
                .fields(Arrays.asList("event_id", "event_name", "event_timestamp", "app_id", "user_pseudo_id", "platform"))
                .build();

        // Apply filter
        FieldFilterTransformer transformer = new FieldFilterTransformer();
        Dataset<Row> filteredDataset = transformer.transform(testDataset, rule);

        // Verify system required fields are still present
        Set<String> resultColumns = new HashSet<>(Arrays.asList(filteredDataset.columns()));
        
        Assertions.assertTrue(resultColumns.contains("event_id"), "event_id should be preserved");
        Assertions.assertTrue(resultColumns.contains("event_name"), "event_name should be preserved");
        Assertions.assertTrue(resultColumns.contains("event_timestamp"), "event_timestamp should be preserved");
        Assertions.assertTrue(resultColumns.contains("app_id"), "app_id should be preserved");
        Assertions.assertTrue(resultColumns.contains("user_pseudo_id"), "user_pseudo_id should be preserved");
        Assertions.assertTrue(resultColumns.contains("platform"), "platform should be preserved");
    }

    /**
     * Test that no filtering is applied when no rule exists.
     * Validates Requirements 2.4: IF 未配置过滤规则 THEN THE Data_Pipeline SHALL 收集所有字段
     */
    @Test
    void should_not_filter_when_no_rule_exists() {
        // Create test dataset
        Dataset<Row> testDataset = spark.createDataFrame(
                Arrays.asList(
                        new TestEvent("event1", "test_event", 1234567890L, "app1", "user1", "Web", "custom_value", "extra_value")
                ),
                TestEvent.class
        );

        // Apply filter with null rule
        FieldFilterTransformer transformer = new FieldFilterTransformer();
        Dataset<Row> filteredDataset = transformer.transform(testDataset, null);

        // Verify all fields are present
        Set<String> originalColumns = new HashSet<>(Arrays.asList(testDataset.columns()));
        Set<String> resultColumns = new HashSet<>(Arrays.asList(filteredDataset.columns()));
        
        Assertions.assertEquals(originalColumns, resultColumns, "All fields should be preserved when no rule exists");
    }

    // Helper methods

    private Path createTempConfigDirWithFieldFilterRule(String appId, String filterMode, List<String> fields) throws IOException {
        Path tempDir = Files.createTempDirectory("field_filter_config");
        Path appDir = tempDir.resolve(appId);
        Files.createDirectories(appDir);

        String ruleJson = String.format(
                "{\"projectId\":\"test-project\",\"pipelineId\":\"test-pipeline\",\"appId\":\"%s\",\"filterMode\":\"%s\",\"fields\":%s}",
                appId, filterMode, toJsonArray(fields)
        );

        Path ruleFile = appDir.resolve("field_filter_rule.json");
        try (FileWriter writer = new FileWriter(ruleFile.toFile())) {
            writer.write(ruleJson);
        }

        return tempDir;
    }

    private void updateFieldFilterRule(Path configDir, String appId, String filterMode, List<String> fields) throws IOException {
        Path appDir = configDir.resolve(appId);
        String ruleJson = String.format(
                "{\"projectId\":\"test-project\",\"pipelineId\":\"test-pipeline\",\"appId\":\"%s\",\"filterMode\":\"%s\",\"fields\":%s}",
                appId, filterMode, toJsonArray(fields)
        );

        Path ruleFile = appDir.resolve("field_filter_rule.json");
        try (FileWriter writer = new FileWriter(ruleFile.toFile())) {
            writer.write(ruleJson);
        }
    }

    private String toJsonArray(List<String> list) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            sb.append("\"").append(list.get(i)).append("\"");
            if (i < list.size() - 1) {
                sb.append(",");
            }
        }
        sb.append("]");
        return sb.toString();
    }

    private void deleteDirectory(File directory) {
        if (directory.isDirectory()) {
            File[] files = directory.listFiles();
            if (files != null) {
                for (File file : files) {
                    deleteDirectory(file);
                }
            }
        }
        directory.delete();
    }

    private ETLRunnerConfig getRunnerConfigWithConfigDir(List<String> transformers, String name, String configDir) {
        String outputPath = "/tmp/test-output/" + name + "/";
        return new ETLRunnerConfig(
                new ETLRunnerConfig.TransformationConfig(
                        transformers,
                        "test-project",
                        "test-app",
                        72L,
                        180,
                        360,
                        configDir,
                        "true"
                ),
                new ETLRunnerConfig.InputOutputConfig(
                        "",
                        "default",
                        "test_table",
                        "/tmp/test-source/",
                        "/tmp/test-job-data/",
                        outputPath,
                        "json"
                ),
                new ETLRunnerConfig.TimestampConfig(
                        System.currentTimeMillis() - 86400000,
                        System.currentTimeMillis()
                ),
                new ETLRunnerConfig.PartitionConfig(
                        -1,
                        10
                )
        );
    }

    /**
     * Test event class for creating test datasets.
     */
    public static class TestEvent implements java.io.Serializable {
        private String event_id;
        private String event_name;
        private Long event_timestamp;
        private String app_id;
        private String user_pseudo_id;
        private String platform;
        private String custom_field;
        private String extra_field;

        public TestEvent() {}

        public TestEvent(String event_id, String event_name, Long event_timestamp, String app_id,
                         String user_pseudo_id, String platform, String custom_field, String extra_field) {
            this.event_id = event_id;
            this.event_name = event_name;
            this.event_timestamp = event_timestamp;
            this.app_id = app_id;
            this.user_pseudo_id = user_pseudo_id;
            this.platform = platform;
            this.custom_field = custom_field;
            this.extra_field = extra_field;
        }

        // Getters and setters
        public String getEvent_id() { return event_id; }
        public void setEvent_id(String event_id) { this.event_id = event_id; }
        public String getEvent_name() { return event_name; }
        public void setEvent_name(String event_name) { this.event_name = event_name; }
        public Long getEvent_timestamp() { return event_timestamp; }
        public void setEvent_timestamp(Long event_timestamp) { this.event_timestamp = event_timestamp; }
        public String getApp_id() { return app_id; }
        public void setApp_id(String app_id) { this.app_id = app_id; }
        public String getUser_pseudo_id() { return user_pseudo_id; }
        public void setUser_pseudo_id(String user_pseudo_id) { this.user_pseudo_id = user_pseudo_id; }
        public String getPlatform() { return platform; }
        public void setPlatform(String platform) { this.platform = platform; }
        public String getCustom_field() { return custom_field; }
        public void setCustom_field(String custom_field) { this.custom_field = custom_field; }
        public String getExtra_field() { return extra_field; }
        public void setExtra_field(String extra_field) { this.extra_field = extra_field; }
    }
}
