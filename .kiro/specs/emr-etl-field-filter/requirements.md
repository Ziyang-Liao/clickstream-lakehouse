# Requirements Document

## Introduction

本需求文档描述了 Clickstream Analytics 解决方案的两个新功能：
1. **字段过滤功能**：支持在数据采集过程中配置字段白名单和黑名单，实现灵活的字段过滤
2. **EMR Serverless ETL 计算选项**：在现有 Redshift ETL 框架基础上，增加使用 EMR Serverless 进行数据计算的选项，计算完成后将结果推送到 Redshift

## Glossary

- **Field_Filter**: 字段过滤器，根据配置的白名单或黑名单规则过滤数据字段
- **Whitelist**: 白名单配置，仅采集列表中指定的字段
- **Blacklist**: 黑名单配置，排除列表中指定的字段，采集其余所有字段
- **Filter_Config**: 字段过滤配置，包含过滤模式、白名单和黑名单设置
- **Config_Parser**: 配置解析器，负责解析和验证字段过滤配置
- **ETL_Engine**: 数据处理引擎，负责执行数据转换和加载操作，可选择 Redshift 或 EMR Serverless
- **EMR_Serverless**: AWS EMR Serverless 服务，用于运行 Spark 作业进行数据处理
- **Redshift**: AWS Redshift 数据仓库服务，用于存储和分析数据
- **Data_Pipeline**: 数据管道，负责从 S3 读取原始数据，经过 ETL 处理后输出到目标存储
- **Spark_ETL_Job**: 运行在 EMR Serverless 上的 Spark ETL 作业
- **Web_Console**: Web 控制台，提供用户界面进行配置管理
- **Pipeline_Settings**: 管道设置页面，用于配置 ETL 引擎和字段过滤规则

## Requirements

### Requirement 1: 字段过滤配置

**User Story:** As a solution administrator, I want to configure which fields to collect or exclude through the web console, so that I can control data collection scope and reduce storage costs.

#### Acceptance Criteria

1. THE Filter_Config SHALL support three filter modes: "none" (collect all fields), "whitelist" (collect only specified fields), "blacklist" (exclude specified fields)
2. WHEN filter mode is "none", THE Field_Filter SHALL pass through all fields without modification
3. WHEN filter mode is "whitelist", THE Field_Filter SHALL only retain fields specified in the whitelist
4. WHEN filter mode is "blacklist", THE Field_Filter SHALL exclude fields specified in the blacklist
5. WHEN both whitelist and blacklist contain the same field, THE Field_Filter SHALL prioritize blacklist (exclude the field)
6. THE Filter_Config SHALL support global filter settings that apply to all apps
7. THE Filter_Config SHALL support per-app filter settings that override global settings
8. THE Filter_Config SHALL be stored in DynamoDB table for persistence

### Requirement 2: 字段过滤 Web 界面

**User Story:** As a solution administrator, I want to manage field filter configurations through the web console at both global and per-app levels, so that I can easily update filtering rules with a visual interface.

#### Acceptance Criteria

1. THE Web_Console SHALL provide a global field filter configuration page under Pipeline Settings
2. THE Web_Console SHALL provide a per-app field filter configuration page under each App's settings
3. THE Web_Console SHALL display current filter mode (none/whitelist/blacklist) with radio button selection
4. WHEN whitelist mode is selected, THE Web_Console SHALL display a text area for entering whitelist field names (one per line)
5. WHEN blacklist mode is selected, THE Web_Console SHALL display a text area for entering blacklist field names (one per line)
6. THE Web_Console SHALL provide a "Save" button to persist filter configuration
7. WHEN configuration is saved, THE Web_Console SHALL display success or error notification
8. THE Web_Console SHALL validate field names before saving (no empty names, valid characters)
9. THE Web_Console SHALL display a list of system-protected fields that cannot be filtered
10. THE Web_Console SHALL indicate when per-app settings override global settings
11. THE Web_Console SHALL provide an option to reset per-app settings to use global defaults

### Requirement 3: 字段过滤执行

**User Story:** As a data engineer, I want the field filtering to be applied during ETL processing, so that only relevant fields are stored and processed.

#### Acceptance Criteria

1. WHEN processing event data, THE Field_Filter SHALL apply filter rules to event properties (event_params)
2. WHEN processing user data, THE Field_Filter SHALL apply filter rules to user attributes (user_properties)
3. WHEN processing item data, THE Field_Filter SHALL apply filter rules to item attributes
4. THE Field_Filter SHALL preserve system-required fields regardless of filter configuration (e.g., event_id, event_timestamp, user_pseudo_id, event_name)
5. WHEN a required field is in blacklist, THE Field_Filter SHALL log a warning and retain the field
6. THE Field_Filter SHALL support wildcard patterns in field names (e.g., "custom_*" to match all custom fields)

### Requirement 4: 字段过滤配置解析

**User Story:** As a developer, I want the field filter configuration to be parsed correctly, so that filtering rules are applied accurately.

#### Acceptance Criteria

1. WHEN parsing filter configuration, THE Config_Parser SHALL validate JSON schema
2. WHEN parsing filter configuration, THE Config_Parser SHALL handle nested field paths (e.g., "event_params.value")
3. IF filter configuration is malformed, THEN THE Config_Parser SHALL return a descriptive error
4. THE Config_Parser SHALL serialize filter configuration to JSON for storage
5. FOR ALL valid filter configurations, parsing then serializing SHALL produce an equivalent configuration (round-trip property)

### Requirement 5: ETL 引擎选择

**User Story:** As a solution deployer, I want to choose between Redshift-only ETL or EMR Serverless + Redshift ETL through the web console, so that I can optimize cost and performance based on my data volume and processing needs.

#### Acceptance Criteria

1. THE Web_Console SHALL provide an ETL engine selection option under Pipeline Settings
2. THE Web_Console SHALL display ETL engine options: "Redshift" (default) and "EMR Serverless"
3. WHEN "Redshift" is selected, THE ETL_Engine SHALL perform all data transformation and computation within Redshift (current behavior)
4. WHEN "EMR Serverless" is selected, THE ETL_Engine SHALL perform data transformation and computation in EMR Serverless, then load results to Redshift
5. THE Web_Console SHALL display a description for each ETL engine option explaining the trade-offs
6. WHEN ETL engine mode changes, THE Data_Pipeline SHALL maintain data consistency and integrity

### Requirement 6: ETL 引擎配置 Web 界面

**User Story:** As a solution administrator, I want to configure ETL engine settings through the web console at both global and per-app levels, so that I can adjust processing parameters without redeployment.

#### Acceptance Criteria

1. THE Web_Console SHALL provide a global ETL engine configuration page under Pipeline Settings
2. THE Web_Console SHALL provide a per-app ETL engine configuration page under each App's settings
3. THE Web_Console SHALL display current ETL engine mode with radio button selection
4. WHEN EMR Serverless is selected, THE Web_Console SHALL display additional configuration options (Spark executor memory, executor cores)
5. THE Web_Console SHALL provide a "Save" button to persist ETL engine configuration
6. WHEN configuration is saved, THE Web_Console SHALL display success or error notification
7. THE Web_Console SHALL validate configuration values before saving (valid ranges, required fields)
8. THE Web_Console SHALL display warning message when switching ETL engine mode about potential impact
9. THE Web_Console SHALL indicate when per-app settings override global settings
10. THE Web_Console SHALL provide an option to reset per-app settings to use global defaults

### Requirement 7: EMR Serverless 计算集成

**User Story:** As a data engineer, I want the ETL computation to run on EMR Serverless, so that I can leverage Spark's distributed computing capabilities for large-scale data processing.

#### Acceptance Criteria

1. WHEN EMR Serverless mode is enabled, THE Spark_ETL_Job SHALL read source data from S3 (processed by existing Data Processing stack)
2. WHEN EMR Serverless mode is enabled, THE Spark_ETL_Job SHALL perform additional data aggregation and materialized view computation
3. WHEN EMR Serverless mode is enabled, THE Spark_ETL_Job SHALL write computed results to intermediate S3 location in Parquet format
4. WHEN Spark job completes successfully, THE Data_Pipeline SHALL trigger Redshift COPY command to load data from S3
5. WHEN Spark job fails, THE Data_Pipeline SHALL log the error and send notification via CloudWatch Events
6. THE EMR_Serverless application SHALL use the existing EMR Serverless application created by Data Processing stack
7. WHEN configuring EMR Serverless, THE Web_Console SHALL allow specifying Spark executor and driver configurations

### Requirement 8: Redshift 数据加载（EMR 模式）

**User Story:** As a data analyst, I want the processed data to be available in Redshift for querying, so that I can perform analytics using SQL.

#### Acceptance Criteria

1. WHEN EMR processing completes, THE Data_Pipeline SHALL load computed results (aggregations, materialized views) to Redshift
2. WHEN loading data to Redshift, THE Data_Pipeline SHALL use COPY command with appropriate IAM role
3. WHEN loading data to Redshift, THE Data_Pipeline SHALL handle incremental data loading based on partition
4. IF data loading fails, THEN THE Data_Pipeline SHALL retry with exponential backoff up to 3 times
5. WHEN data is loaded successfully, THE Data_Pipeline SHALL update the load status in DynamoDB tracking table

### Requirement 9: 监控和告警

**User Story:** As a DevOps engineer, I want to monitor ETL job status and receive alerts, so that I can quickly respond to issues.

#### Acceptance Criteria

1. WHEN EMR Serverless job runs, THE Monitoring_System SHALL track job duration, data volume, and resource utilization
2. WHEN ETL job fails, THE Monitoring_System SHALL send CloudWatch alarm notification
3. THE Monitoring_System SHALL provide CloudWatch dashboard for EMR Serverless metrics
4. WHEN field filtering is applied, THE Monitoring_System SHALL log the number of fields filtered per job
5. THE Monitoring_System SHALL track and report data quality metrics after filtering

### Requirement 10: 向后兼容性

**User Story:** As an existing user, I want the new features to be backward compatible, so that my existing pipelines continue to work without modification.

#### Acceptance Criteria

1. WHEN ETL engine setting is not configured, THE ETL_Engine SHALL default to "Redshift" mode
2. WHEN filter configuration is not specified, THE Field_Filter SHALL default to "none" mode (collect all fields)
3. THE Data_Pipeline SHALL maintain compatibility with existing data schema and table structures
4. WHEN upgrading from previous version, THE Deployment_System SHALL migrate existing configurations automatically
