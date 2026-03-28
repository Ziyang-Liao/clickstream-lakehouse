# 需求文档

## 简介

本文档定义了为 Clickstream Analytics on AWS 添加新数据建模选项的需求：EMR Serverless + S3 Tables 数据建模。此功能使用户能够使用 S3 Tables 上的 Apache Iceberg 格式进行数据建模，作为现有 Redshift Serverless 数据建模选项的替代方案。

当前系统已支持：
- 无数据建模：Ingestion → EMR Serverless ETL → S3 (Parquet/JSON) → 完成
- Redshift 数据建模：Ingestion → EMR Serverless ETL → S3 → Redshift Serverless → 数据建模

新增数据流：Ingestion → EMR Serverless ETL (ODS) → EMR Serverless (数据建模) → S3 Tables (Iceberg 格式)

## 术语表

- **Pipeline（管道）**: Clickstream Analytics 数据管道，用于处理和建模点击流数据
- **Data_Modeling（数据建模）**: 将原始 ODS 数据转换为聚合分析表的过程
- **S3_Tables**: AWS S3 Tables 服务，提供托管的 Apache Iceberg 表存储
- **ODS**: 操作数据存储 - 包含清洗后事件数据的中间数据层（event_v2、session、user_v2、item_v2 表）
- **EMR_Serverless**: AWS EMR Serverless 服务，用于运行 Spark 作业而无需管理集群
- **Iceberg**: Apache Iceberg 开放表格式，支持 ACID 事务和时间旅行查询
- **S3_Table_Bucket**: 一种专门的 S3 存储桶类型，用于存储由 S3 Tables 服务管理的 Iceberg 表
- **Namespace（命名空间）**: S3 Tables 存储桶内表的逻辑分组
- **CDataModelingStack**: 现有的 Redshift 数据建模 Stack 类
- **CS3TablesModelingStack**: 新增的 S3 Tables 数据建模 Stack 类

## 需求

### 需求 1：Pipeline 数据模型扩展

**用户故事：** 作为开发人员，我希望 Pipeline 数据模型能够支持 S3 Tables 建模配置，以便系统能够存储和处理新的建模选项。

#### 验收标准

1. THE IPipeline 接口 SHALL 在 dataModeling 属性中新增 s3Tables 可选配置对象
2. THE s3Tables 配置对象 SHALL 包含 tableBucketArn（S3 Table Bucket ARN）字段
3. THE s3Tables 配置对象 SHALL 包含 namespace（命名空间）字段，默认值为 "clickstream_{projectId}"
4. THE s3Tables 配置对象 SHALL 包含 scheduleExpression（调度表达式）字段
5. THE s3Tables 配置对象 SHALL 包含 dataRetentionDays（数据保留天数）字段
6. WHEN s3Tables 配置存在 THEN System SHALL 将其与现有 redshift 配置互斥处理

### 需求 2：S3 Tables 数据建模 Stack 定义

**用户故事：** 作为开发人员，我希望有一个新的 Stack 类来定义 S3 Tables 建模所需的 CloudFormation 参数，以便系统能够部署相应的 AWS 资源。

#### 验收标准

1. THE System SHALL 在 src/control-plane/backend/lambda/api/model/stacks.ts 中新增 CS3TablesModelingStack 类
2. THE CS3TablesModelingStack SHALL 继承 JSONObject 并定义所有必需的 CloudFormation 参数
3. THE CS3TablesModelingStack SHALL 包含 VpcId、PrivateSubnetIds、ProjectId、AppIds 等基础参数
4. THE CS3TablesModelingStack SHALL 包含 S3TableBucketArn、S3TableNamespace 参数
5. THE CS3TablesModelingStack SHALL 包含 ScheduleExpression、DataRetentionDays 参数
6. THE CS3TablesModelingStack SHALL 包含 OdsS3Bucket、OdsS3Prefix 参数用于读取 ODS 数据
7. THE CS3TablesModelingStack SHALL 实现 editAllowedList() 静态方法返回可编辑参数列表

### 需求 3：S3 Tables 数据建模 CDK Stack 实现

**用户故事：** 作为系统运维人员，我希望系统能够自动部署 S3 Tables 数据建模所需的 AWS 资源，以便数据建模管道可以执行。

#### 验收标准

1. THE System SHALL 创建新的 CDK Stack 文件 src/s3-tables-modeling-stack.ts
2. THE Stack SHALL 部署用于数据建模作业的 EMR Serverless Application（版本 7.0.0+）
3. THE Stack SHALL 部署用于调度数据建模作业的 EventBridge Rule
4. THE Stack SHALL 部署用于作业提交的 Lambda Function
5. THE Stack SHALL 部署具有 s3tables:*、s3:*、glue:* 权限的 EMR 执行 IAM Role
6. THE Stack SHALL 部署具有 EMR Serverless 作业提交权限的 Lambda 执行 IAM Role
7. THE Stack SHALL 配置 Spark 使用 Apache Iceberg catalog 设置连接 S3 Tables
8. THE Stack SHALL 输出 EMR Application ID、作业状态机 ARN 等关键资源标识

### 需求 4：Pipeline Workflow 集成

**用户故事：** 作为开发人员，我希望 Pipeline 工作流能够支持 S3 Tables 建模 Stack 的部署，以便新的建模选项能够正确集成到现有流程中。

#### 验收标准

1. THE CPipeline 类 SHALL 新增 getS3TablesModelingState() 方法生成 S3 Tables 建模工作流状态
2. WHEN pipeline.dataModeling.s3Tables 配置存在 THEN generatePipelineStacksWorkflow() SHALL 包含 S3 Tables 建模 Stack
3. THE S3 Tables 建模 Stack SHALL 在 DATA_PROCESSING Stack 之后执行
4. THE PipelineStackType 枚举 SHALL 新增 DATA_MODELING_S3_TABLES 类型
5. THE getStackName() 函数 SHALL 支持生成 S3 Tables 建模 Stack 名称
6. THE Templates 字典 SHALL 包含 S3 Tables 建模模板的映射

### 需求 5：Spark 数据建模作业实现

**用户故事：** 作为数据分析师，我希望系统能够执行数据建模作业，将 ODS 数据转换为聚合分析表。

#### 验收标准

1. THE System SHALL 创建 Spark ETL 模块 src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/s3tables/
2. THE S3TablesModelingRunner SHALL 作为数据建模作业的主入口类
3. THE EventAggregationJob SHALL 创建 event_daily_summary 和 event_hourly_summary 表，按 app_id、event_date/hour、event_name、platform、geo_country 聚合
4. THE UserBehaviorJob SHALL 创建 user_behavior 表，包含 user_id、first_visit_date、last_visit_date、total_sessions、total_events、ltv 字段
5. THE SessionAnalysisJob SHALL 创建 session_analysis 表，包含 session_id、user_id、session_duration、page_views、events_count、bounce_flag 字段
6. THE RetentionAnalysisJob SHALL 创建 retention_daily 和 retention_weekly 表，计算 D1-D30 留存率
7. THE 所有建模作业 SHALL 使用 Iceberg MERGE INTO 实现增量更新，确保幂等性

### 需求 6：Lambda 作业提交器实现

**用户故事：** 作为系统运维人员，我希望有一个 Lambda 函数来提交和监控 EMR Serverless 数据建模作业。

#### 验收标准

1. THE System SHALL 创建 Lambda 函数 src/data-pipeline/lambda/s3tables-job-submitter/
2. THE Lambda SHALL 读取 ODS 层最新数据时间戳确定处理范围
3. THE Lambda SHALL 提交 EMR Serverless Spark 作业并返回作业 ID
4. THE Lambda SHALL 处理作业状态回调并更新执行状态
5. IF 作业提交失败 THEN Lambda SHALL 实现带有指数退避的重试逻辑
6. THE Lambda SHALL 支持通过 API 手动触发

### 需求 7：S3 Tables 建模 API 端点

**用户故事：** 作为管道管理员，我希望有 API 端点来管理 S3 Tables 建模，以便我可以通过编程方式触发作业和监控状态。

#### 验收标准

1. THE System SHALL 在 src/control-plane/backend/lambda/api/router/ 中新增 s3tables-modeling 路由
2. THE System SHALL 提供 POST /api/pipeline/{pipelineId}/s3tables-modeling/trigger 端点手动触发数据建模
3. THE System SHALL 提供 GET /api/pipeline/{pipelineId}/s3tables-modeling/status 端点获取当前建模状态
4. THE System SHALL 提供 GET /api/pipeline/{pipelineId}/s3tables-modeling/jobs 端点获取作业执行历史
5. WHEN 调用 trigger 端点 THEN System SHALL 提交新的数据建模作业并返回作业 ID
6. THE API 端点 SHALL 验证用户权限并记录操作日志

### 需求 8：Pipeline API 修改

**用户故事：** 作为开发人员，我希望现有的 Pipeline API 能够支持 S3 Tables 建模配置。

#### 验收标准

1. WHEN 通过 POST /api/pipeline 创建 Pipeline THEN System SHALL 接受 dataModeling.s3Tables 配置
2. WHEN 通过 PUT /api/pipeline/{pipelineId} 更新 Pipeline THEN System SHALL 接受 s3Tables 配置的更新
3. WHEN 通过 GET /api/pipeline/{pipelineId} 获取 Pipeline THEN System SHALL 返回 s3Tables 建模状态和配置
4. THE System SHALL 验证 s3Tables 配置参数（tableBucketArn 格式、scheduleExpression 格式等）
5. THE System SHALL 确保 s3Tables 和 redshift 配置互斥

### 需求 9：前端 Pipeline 类型定义扩展

**用户故事：** 作为前端开发人员，我希望 TypeScript 类型定义能够支持 S3 Tables 建模配置。

#### 验收标准

1. THE frontend/src/types/pipeline.d.ts SHALL 在 dataModeling 接口中新增 s3Tables 可选属性
2. THE s3Tables 类型 SHALL 包含 tableBucketArn、namespace、scheduleExpression、dataRetentionDays 字段
3. THE IExtPipeline 接口 SHALL 新增 enableS3TablesModeling、selectedS3TableBucket 等临时属性
4. THE 类型定义 SHALL 与后端 IPipeline 接口保持一致

### 需求 10：前端数据处理步骤 UI 扩展

**用户故事：** 作为管道管理员，我希望能够在 Pipeline 创建向导中选择和配置 S3 Tables 建模选项。

#### 验收标准

1. THE DataProcessing.tsx 组件 SHALL 在分析引擎部分新增 "EMR Serverless + S3 Tables" 选项
2. THE 选项 SHALL 与现有 Redshift 选项互斥（用户只能选择其一）
3. WHEN 用户选择 S3 Tables 选项 THEN System SHALL 显示 S3 Table Bucket 选择器
4. WHEN 用户选择 S3 Tables 选项 THEN System SHALL 显示 Namespace 输入框（带默认值）
5. WHEN 用户选择 S3 Tables 选项 THEN System SHALL 显示调度表达式配置
6. WHEN 用户选择 S3 Tables 选项 THEN System SHALL 显示数据保留天数输入框
7. THE System SHALL 验证所有 S3 Tables 配置输入并显示错误提示

### 需求 11：前端 Pipeline 详情页扩展

**用户故事：** 作为管道管理员，我希望在 Pipeline 详情页查看 S3 Tables 建模状态。

#### 验收标准

1. THE PipelineDetail 页面 SHALL 显示 S3 Tables 建模配置信息（如果已启用）
2. THE 页面 SHALL 显示当前建模状态（运行中、成功、失败等）
3. THE 页面 SHALL 显示最近的作业执行历史（最近 10 条）
4. THE 页面 SHALL 提供手动触发数据建模作业的按钮
5. THE 页面 SHALL 显示最后成功建模运行的时间戳
6. IF 建模作业失败 THEN 页面 SHALL 显示错误信息和失败原因

### 需求 12：前端 API 调用扩展

**用户故事：** 作为前端开发人员，我希望有 API 调用函数来与 S3 Tables 建模端点交互。

#### 验收标准

1. THE System SHALL 在 frontend/src/apis/ 中新增 s3tables-modeling.ts 文件
2. THE 文件 SHALL 导出 triggerS3TablesModeling(pipelineId) 函数
3. THE 文件 SHALL 导出 getS3TablesModelingStatus(pipelineId) 函数
4. THE 文件 SHALL 导出 getS3TablesModelingJobs(pipelineId) 函数
5. THE 函数 SHALL 处理 API 错误并返回标准化响应

### 需求 13：数据一致性和幂等性

**用户故事：** 作为系统运维人员，我希望数据建模作业是幂等的，以便重复执行不会创建重复数据。

#### 验收标准

1. THE Spark 作业 SHALL 对所有数据更新使用 Iceberg MERGE INTO 操作
2. WHEN 对同一时间段重新执行作业 THEN System SHALL 更新现有记录而不是创建重复记录
3. THE System SHALL 使用 watermark 机制处理延迟到达的数据
4. THE System SHALL 通过 Iceberg 表格式维护 ACID 事务保证
5. THE 所有 S3 Tables 表 SHALL 按 event_date 或 cohort_date 进行分区

### 需求 14：向后兼容性

**用户故事：** 作为现有用户，我希望我当前的管道能够继续正常工作。

#### 验收标准

1. WHEN 系统升级 THEN 没有 S3 Tables 建模的现有 Pipeline SHALL 继续正常运行
2. THE System SHALL 允许将 Pipeline 从"无数据建模"升级到"S3 Tables 数据建模"
3. THE System SHALL 不要求使用 Redshift 建模的 Pipeline 配置 S3 Tables 建模
4. THE dataModeling.s3Tables 配置 SHALL 为可选字段，不影响现有 Pipeline

### 需求 15：IAM 权限和安全

**用户故事：** 作为安全管理员，我希望配置适当的 IAM 权限，以便数据建模组件具有最小权限访问。

#### 验收标准

1. THE EMR 执行角色 SHALL 对配置的 S3 Table Bucket 具有 s3tables:* 权限
2. THE EMR 执行角色 SHALL 对 ODS S3 Bucket 具有 s3:GetObject、s3:ListBucket 权限
3. THE EMR 执行角色 SHALL 对 Glue Catalog 具有 glue:GetDatabase、glue:GetTable、glue:CreateTable、glue:UpdateTable 权限
4. THE Lambda 执行角色 SHALL 具有 emr-serverless:StartJobRun、emr-serverless:GetJobRun 权限
5. THE System SHALL 支持 IAM 角色边界（IamRoleBoundaryArn）配置
