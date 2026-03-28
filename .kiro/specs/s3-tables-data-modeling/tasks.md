# 实现计划：EMR Serverless + S3 Tables 数据建模

## 概述

本实现计划将 S3 Tables 数据建模功能分解为可执行的开发任务。任务按照依赖关系排序，确保增量开发和持续集成。

## 任务

- [x] 1. 后端数据模型和类型定义
  - [x] 1.1 扩展 IPipeline 接口添加 s3Tables 配置
    - 在 src/control-plane/backend/lambda/api/model/pipeline.ts 中添加 S3TablesModelingConfig 接口
    - 在 DataModeling 接口中添加 s3Tables 可选属性
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 添加 PipelineStackType 枚举值
    - 在 src/control-plane/backend/lambda/api/common/model-ln.ts 中添加 DATA_MODELING_S3_TABLES
    - _Requirements: 4.4_

  - [x] 1.3 创建 CS3TablesModelingStack 类
    - 在 src/control-plane/backend/lambda/api/model/stacks.ts 中添加 CS3TablesModelingStack 类
    - 实现所有 CloudFormation 参数定义
    - 实现 editAllowedList() 静态方法
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 1.4 编写 CS3TablesModelingStack 单元测试
    - 测试参数生成完整性
    - 测试默认值应用
    - **Property 2: Stack 参数生成完整性**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6**

- [x] 2. Pipeline 配置验证
  - [x] 2.1 实现 S3 Tables 和 Redshift 互斥验证
    - 在 Pipeline 创建/更新逻辑中添加互斥检查
    - 在 src/control-plane/backend/lambda/api/service/pipeline.ts 中实现
    - _Requirements: 1.6, 8.5_

  - [x] 2.2 实现 S3 Tables 配置参数验证
    - 验证 tableBucketArn 格式
    - 验证 scheduleExpression 格式
    - 验证 dataRetentionDays 范围
    - _Requirements: 8.4_

  - [x] 2.3 编写配置验证属性测试
    - **Property 1: S3 Tables 和 Redshift 配置互斥**
    - **Property 11: API 配置验证**
    - **Validates: Requirements 1.6, 8.4, 8.5**

- [x] 3. Checkpoint - 确保所有测试通过 ✅
  - 确保所有测试通过，如有问题请询问用户。
  - **已验证**: 所有 23 个 S3 Tables 相关测试通过
    - `s3tables-validation.test.ts`: 14 tests passed (Property 1 & 11)
    - `stacks-s3tables.test.ts`: 9 tests passed (Property 2)

- [x] 4. Workflow 集成
  - [x] 4.1 实现 getS3TablesModelingState() 方法
    - 在 src/control-plane/backend/lambda/api/model/pipeline.ts 的 CPipeline 类中添加
    - 生成 S3 Tables 建模工作流状态
    - _Requirements: 4.1_

  - [x] 4.2 修改 generatePipelineStacksWorkflow() 方法
    - 在 _getDataProcessingWorkflow() 中集成 S3 Tables 建模状态
    - 确保在 DATA_PROCESSING 之后执行
    - _Requirements: 4.2, 4.3_

  - [x] 4.3 更新 getStackName() 函数
    - 支持生成 S3 Tables 建模 Stack 名称
    - _Requirements: 4.5_

  - [x] 4.4 更新 Templates 字典配置
    - 添加 S3 Tables 建模模板映射
    - _Requirements: 4.6_

  - [x] 4.5 编写 Workflow 生成属性测试
    - **Property 4: Workflow 顺序正确性**
    - **Validates: Requirements 4.2, 4.3**

- [x] 5. CDK Stack 实现
  - [x] 5.1 创建 S3TablesModelingStack CDK Stack
    - 创建 src/s3-tables-modeling-stack.ts
    - 定义 Stack 参数接口
    - _Requirements: 3.1_

  - [x] 5.2 实现 EMR Serverless Application 资源
    - 配置 EMR 7.5+ 版本
    - 配置网络设置
    - 配置自动启停
    - _Requirements: 3.2_

  - [x] 5.3 实现 EMR 执行 IAM 角色
    - 添加 s3tables:* 权限
    - 添加 s3:GetObject, s3:ListBucket 权限
    - 添加 glue:* 权限
    - 支持 IAM 角色边界
    - _Requirements: 3.5, 15.1, 15.2, 15.3, 15.5_

  - [x] 5.4 实现 Lambda 执行 IAM 角色
    - 添加 emr-serverless:StartJobRun 权限
    - 添加 emr-serverless:GetJobRun 权限
    - _Requirements: 3.6, 15.4_

  - [x] 5.5 实现 EventBridge 调度规则
    - 配置调度表达式
    - 配置 Lambda 目标
    - _Requirements: 3.3_

  - [x] 5.6 实现 Stack 输出
    - 输出 EMR Application ID
    - 输出 Lambda Function ARN
    - _Requirements: 3.8_

  - [x] 5.7 编写 CDK Stack 快照测试
    - 验证资源定义正确
    - 验证 IAM 权限配置
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

- [x] 6. Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 7. Lambda 作业提交器
  - [x] 7.1 创建 Lambda 函数目录结构
    - 创建 src/data-pipeline/lambda/s3tables-job-submitter/
    - 创建 index.ts 入口文件
    - _Requirements: 6.1_

  - [x] 7.2 实现 ODS 数据时间戳读取
    - 读取 ODS 层最新数据时间戳
    - 确定处理范围
    - _Requirements: 6.2_

  - [x] 7.3 实现 EMR Serverless 作业提交
    - 构建 Spark 作业参数
    - 提交作业并返回作业 ID
    - _Requirements: 6.3_

  - [x] 7.4 实现指数退避重试逻辑
    - 作业提交失败时重试
    - 使用指数退避策略
    - _Requirements: 6.5_

  - [x] 7.5 实现作业状态回调处理
    - 处理作业完成/失败回调
    - 更新执行状态
    - _Requirements: 6.4_

  - [x] 7.6 编写 Lambda 单元测试
    - **Property 10: 作业提交重试逻辑**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

- [x] 8. Spark 数据建模作业
  - [x] 8.1 创建 S3 Tables 建模模块目录
    - 创建 src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/s3tables/
    - _Requirements: 5.1_

  - [x] 8.2 实现 S3TablesModelingRunner 主入口类
    - 解析命令行参数
    - 初始化 Spark Session（配置 Iceberg）
    - 协调各建模作业执行
    - _Requirements: 5.2_

  - [x] 8.3 实现 EventAggregationJob
    - 读取 ODS event_v2 数据
    - 创建 event_daily_summary 表
    - 创建 event_hourly_summary 表
    - 使用 MERGE INTO 实现增量更新
    - _Requirements: 5.3_

  - [x] 8.4 编写 EventAggregationJob 属性测试
    - **Property 6: 事件聚合正确性**
    - **Validates: Requirements 5.3**

  - [x] 8.5 实现 UserBehaviorJob
    - 读取 ODS event_v2 和 user_v2 数据
    - 创建 user_behavior 表
    - 计算 first_visit_date, last_visit_date, total_sessions, total_events, ltv
    - _Requirements: 5.4_

  - [x] 8.6 编写 UserBehaviorJob 属性测试
    - **Property 7: 用户行为计算正确性**
    - **Validates: Requirements 5.4**

  - [x] 8.7 实现 SessionAnalysisJob
    - 读取 ODS session 和 event_v2 数据
    - 创建 session_analysis 表
    - 计算 session_duration, page_views, events_count, bounce_flag
    - _Requirements: 5.5_

  - [x] 8.8 编写 SessionAnalysisJob 属性测试
    - **Property 8: 会话分析正确性**
    - **Validates: Requirements 5.5**

  - [x] 8.9 实现 RetentionAnalysisJob
    - 读取 ODS event_v2 和 user_v2 数据
    - 创建 retention_daily 和 retention_weekly 表
    - 计算 D1-D30 留存率
    - _Requirements: 5.6_

  - [x] 8.10 编写 RetentionAnalysisJob 属性测试
    - **Property 9: 留存率计算正确性**
    - **Validates: Requirements 5.6**

  - [x] 8.11 编写幂等性属性测试
    - **Property 5: 数据建模幂等性**
    - **Validates: Requirements 5.7, 13.2**

- [x] 9. Checkpoint - 确保所有测试通过 ✅
  - 确保所有测试通过，如有问题请询问用户。
  - **已验证**: 所有 S3 Tables 相关测试通过
    - Spark ETL Tests: 12 tests passed (Properties 5, 6, 7, 8, 9)
    - Control Plane API Tests: 30 tests passed (Properties 1, 2, 4, 11)
    - CDK Stack & Lambda Tests: 59 tests passed (Property 10)

- [x] 10. API 端点实现
  - [x] 10.1 创建 S3 Tables 建模路由
    - 创建 src/control-plane/backend/lambda/api/router/s3tables-modeling.ts
    - 定义路由结构
    - _Requirements: 7.1_

  - [x] 10.2 实现 trigger 端点
    - POST /api/pipeline/{pipelineId}/s3tables-modeling/trigger
    - 调用 Lambda 提交作业
    - 返回作业 ID
    - _Requirements: 7.2, 7.5, 6.6_

  - [x] 10.3 实现 status 端点
    - GET /api/pipeline/{pipelineId}/s3tables-modeling/status
    - 返回当前建模状态
    - _Requirements: 7.3_

  - [x] 10.4 实现 jobs 端点
    - GET /api/pipeline/{pipelineId}/s3tables-modeling/jobs
    - 返回作业执行历史
    - _Requirements: 7.4_

  - [x] 10.5 添加权限验证和日志记录
    - 验证用户权限
    - 记录操作日志
    - _Requirements: 7.6_

  - [x] 10.6 编写 API 端点单元测试
    - 测试各端点响应
    - 测试权限验证
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**
    - **已验证**: 12 tests passed in s3tables-modeling.test.ts

- [x] 11. Pipeline API 修改
  - [x] 11.1 修改 Pipeline 创建 API
    - 接受 dataModeling.s3Tables 配置
    - _Requirements: 8.1_

  - [x] 11.2 修改 Pipeline 更新 API
    - 接受 s3Tables 配置更新
    - _Requirements: 8.2_

  - [x] 11.3 修改 Pipeline 获取 API
    - 返回 s3Tables 建模状态和配置
    - _Requirements: 8.3_

  - [x] 11.4 编写 Pipeline API 属性测试
    - **Property 12: 向后兼容性**
    - **Validates: Requirements 8.1, 8.2, 8.3, 14.1, 14.3, 14.4**
    - **已验证**: 11 tests passed in pipeline-backward-compatibility.test.ts

- [x] 12. Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 13. 前端类型定义
  - [x] 13.1 扩展 pipeline.d.ts 类型定义
    - 添加 s3Tables 类型定义
    - 添加 IExtPipeline 临时属性
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 14. 前端数据处理步骤 UI
  - [x] 14.1 添加 S3 Tables 建模选项
    - 在 DataProcessing.tsx 中添加选项
    - 实现与 Redshift 互斥逻辑
    - _Requirements: 10.1, 10.2_

  - [x] 14.2 实现 S3 Tables 配置表单
    - S3 Table Bucket 选择器
    - Namespace 输入框
    - 调度表达式配置
    - 数据保留天数输入
    - _Requirements: 10.3, 10.4, 10.5, 10.6_

  - [x] 14.3 实现配置验证
    - 前端输入验证
    - 错误提示显示
    - _Requirements: 10.7_

- [x] 15. 前端 Pipeline 详情页
  - [x] 15.1 显示 S3 Tables 建模配置
    - 显示配置信息
    - _Requirements: 11.1_

  - [x] 15.2 显示建模状态和作业历史
    - 显示当前状态
    - 显示最近作业列表
    - _Requirements: 11.2, 11.3, 11.5_

  - [x] 15.3 实现手动触发按钮
    - 添加触发按钮
    - 调用 trigger API
    - _Requirements: 11.4_

  - [x] 15.4 显示错误信息
    - 作业失败时显示错误
    - _Requirements: 11.6_

- [x] 16. 前端 API 调用
  - [x] 16.1 创建 s3tables-modeling.ts API 文件
    - 实现 triggerS3TablesModeling 函数
    - 实现 getS3TablesModelingStatus 函数
    - 实现 getS3TablesModelingJobs 函数
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 17. 最终 Checkpoint ✅
  - 确保所有测试通过，如有问题请询问用户。
  - **已验证**: 所有 S3 Tables 相关测试通过 (112 tests total)
    - `s3-tables-modeling-stack.test.ts`: CDK Stack tests passed
    - `s3-tables-job-submitter.test.ts`: Lambda job submitter tests passed (Property 10)
    - `s3tables-validation.test.ts`: 14 tests passed (Property 1 & 11)
    - `stacks-s3tables.test.ts`: 9 tests passed (Property 2)
    - `pipeline-backward-compatibility.test.ts`: 11 tests passed (Property 12)
    - `s3tables-modeling.test.ts`: 12 tests passed (API endpoints)
    - `workflow-s3tables.test.ts`: 7 tests passed (Property 4)

## 注意事项

- 每个任务引用了具体的需求编号以便追溯
- 属性测试验证了设计文档中定义的正确性属性
- Checkpoint 任务用于确保增量验证
