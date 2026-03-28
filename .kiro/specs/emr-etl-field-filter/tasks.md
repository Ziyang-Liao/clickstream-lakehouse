# Implementation Plan: Field Filter and EMR ETL Engine

## Overview

本实现计划将功能分为两个主要部分：字段过滤功能和 EMR Serverless ETL 引擎选项。每个部分包含后端 API、前端 UI 和数据处理逻辑的实现任务。

## Tasks

- [x] 1. 字段过滤配置数据模型和存储
  - [x] 1.1 创建 FieldFilterConfig 接口和类型定义
    - 在 `src/control-plane/backend/lambda/api/common/types.ts` 中添加 FieldFilterConfig 接口
    - 定义 filterMode、whitelist、blacklist 等字段
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 1.2 实现 DynamoDB 存储层
    - 在 `src/control-plane/backend/lambda/api/store/dynamodb/dynamodb-store.ts` 中添加 CRUD 方法
    - 支持全局配置和按应用配置的存储
    - _Requirements: 1.6, 1.7, 1.8_
  - [x] 1.3 编写字段过滤配置存储的属性测试
    - **Property 8: Configuration Round-Trip**
    - **Validates: Requirements 4.4, 4.5**

- [x] 2. 字段过滤配置 API
  - [x] 2.1 实现全局字段过滤配置 API 端点
    - 在 `src/control-plane/backend/lambda/api/router/` 中添加路由
    - 实现 GET/POST/PUT/DELETE 端点
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 2.2 实现按应用字段过滤配置 API 端点
    - 支持 `/api/project/{projectId}/app/{appId}/filter-config` 路径
    - _Requirements: 1.7, 3.1, 3.2_
  - [x] 2.3 实现配置验证逻辑
    - 验证字段名格式
    - 验证通配符模式
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 2.4 编写 API 端点单元测试
    - 测试 CRUD 操作
    - 测试验证错误响应
    - _Requirements: 3.3, 3.4, 3.5_

- [x] 3. Checkpoint - 确保字段过滤配置 API 测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. ETL 引擎配置数据模型和存储
  - [x] 4.1 创建 ETLEngineConfig 接口和类型定义
    - 在 `src/control-plane/backend/lambda/api/common/types.ts` 中添加 ETLEngineConfig 接口
    - 定义 engineType、emrConfig 等字段
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 4.2 实现 DynamoDB 存储层
    - 添加 ETL 配置的 CRUD 方法
    - 支持全局配置和按应用配置
    - _Requirements: 5.1, 6.1, 6.2_
  - [x] 4.3 编写 ETL 配置存储的属性测试
    - **Property 9: Default Configuration Values**
    - **Validates: Requirements 10.1, 10.2**

- [x] 5. ETL 引擎配置 API
  - [x] 5.1 实现全局 ETL 引擎配置 API 端点
    - 实现 GET/POST/PUT 端点
    - _Requirements: 5.1, 6.1_
  - [x] 5.2 实现按应用 ETL 引擎配置 API 端点
    - 支持按应用覆盖全局配置
    - _Requirements: 6.2, 6.9_
  - [x] 5.3 实现配置验证逻辑
    - 验证 EMR 配置参数范围
    - _Requirements: 6.5, 6.7_
  - [x] 5.4 编写 API 端点单元测试
    - 测试 CRUD 操作
    - 测试验证错误响应
    - _Requirements: 6.4, 6.6_

- [x] 6. Checkpoint - 确保 ETL 配置 API 测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 字段过滤 Java 模块实现
  - [x] 7.1 创建 FieldFilter 接口和实现类
    - 在 `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/` 中创建
    - 实现 applyFilter 方法
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 7.2 实现保护字段逻辑
    - 定义 PROTECTED_FIELDS 常量
    - 实现 isProtectedField 方法
    - _Requirements: 3.4, 3.5_
  - [x] 7.3 实现通配符匹配逻辑
    - 实现 matchWildcard 方法
    - 支持 `*` 通配符
    - _Requirements: 3.6_
  - [x] 7.4 实现配置优先级逻辑
    - 按应用配置优先于全局配置
    - _Requirements: 1.6, 1.7_
  - [x] 7.5 编写字段过滤属性测试
    - **Property 1: Filter Mode Behavior**
    - **Validates: Requirements 1.2**
  - [x] 7.6 编写白名单过滤属性测试
    - **Property 2: Whitelist Filter Correctness**
    - **Validates: Requirements 1.3, 3.4**
  - [x] 7.7 编写黑名单过滤属性测试
    - **Property 3: Blacklist Filter Correctness**
    - **Validates: Requirements 1.4, 3.4, 3.5**
  - [x] 7.8 编写黑名单优先级属性测试
    - **Property 4: Blacklist Priority**
    - **Validates: Requirements 1.5**
  - [x] 7.9 编写保护字段属性测试
    - **Property 6: Protected Fields Preservation**
    - **Validates: Requirements 3.4, 3.5**
  - [x] 7.10 编写通配符匹配属性测试
    - **Property 7: Wildcard Pattern Matching**
    - **Validates: Requirements 3.6**

- [x] 8. 集成字段过滤到 Spark ETL 流程
  - [x] 8.1 修改 ETLRunner 集成字段过滤
    - 在 `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/ETLRunner.java` 中集成
    - 在数据转换后应用字段过滤
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 8.2 实现配置读取逻辑
    - 从 S3 读取配置文件
    - 解析 JSON 配置
    - _Requirements: 4.1, 4.2_
  - [x] 8.3 添加过滤指标日志
    - 记录过滤的字段数量
    - _Requirements: 9.4_
  - [x] 8.4 编写配置优先级属性测试
    - **Property 5: Configuration Precedence**
    - **Validates: Requirements 1.6, 1.7**
  - [x] 8.5 编写过滤范围属性测试
    - **Property 10: Filter Application Scope**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 9. Checkpoint - 确保字段过滤 Java 模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 10. EMR Serverless ETL 计算模块
  - [x] 10.1 创建 EMR ETL Spark 作业
    - 创建新的 Spark 作业类用于聚合计算
    - 实现物化视图计算逻辑
    - _Requirements: 7.1, 7.2_
  - [x] 10.2 实现 S3 中间结果写入
    - 将计算结果写入 S3 Parquet 格式
    - _Requirements: 7.3_
  - [x] 10.3 实现 Redshift COPY 触发逻辑
    - 在 EMR 作业完成后触发 COPY
    - _Requirements: 7.4, 8.1, 8.2_
  - [x] 10.4 实现错误处理和重试逻辑
    - 实现指数退避重试
    - _Requirements: 7.5, 8.4_
  - [x] 10.5 编写 EMR ETL 作业单元测试
    - 测试聚合计算逻辑
    - _Requirements: 7.2, 7.3_

- [x] 11. EMR Serverless 工作流集成
  - [x] 11.1 修改 LoadOdsDataToRedshiftWorkflow
    - 在 `src/analytics/private/load-ods-data-workflow.ts` 中添加 EMR 模式分支
    - 根据配置选择执行路径
    - _Requirements: 5.3, 5.4_
  - [x] 11.2 创建 EMR 作业提交 Lambda
    - 创建新的 Lambda 函数提交 EMR 作业
    - _Requirements: 7.6_
  - [x] 11.3 实现作业状态监听
    - 监听 EMR 作业完成事件
    - 触发后续 Redshift 加载
    - _Requirements: 7.4, 7.5_
  - [x] 11.4 编写工作流集成测试
    - 测试 EMR 模式和 Redshift 模式切换
    - _Requirements: 5.6_

- [x] 12. Checkpoint - 确保 EMR ETL 模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 13. 前端字段过滤配置页面
  - [x] 13.1 创建字段过滤配置组件
    - 在 `frontend/src/pages/pipelines/detail/comps/` 中创建 FieldFilterConfig.tsx
    - 实现过滤模式选择 UI
    - _Requirements: 2.1, 2.3, 2.4, 2.5_
  - [x] 13.2 实现白名单/黑名单输入
    - 文本框输入字段名
    - 显示保护字段列表
    - _Requirements: 2.4, 2.5, 2.8_
  - [x] 13.3 实现保存和验证逻辑
    - 调用后端 API 保存配置
    - 显示成功/错误通知
    - _Requirements: 2.6, 2.7_
  - [x] 13.4 实现全局和按应用配置切换
    - 显示配置覆盖状态
    - 提供重置选项
    - _Requirements: 2.10, 2.11_
  - [x] 13.5 编写前端组件单元测试
    - 测试 UI 交互
    - _Requirements: 2.3, 2.4, 2.5_

- [x] 14. 前端 ETL 引擎配置页面
  - [x] 14.1 创建 ETL 引擎配置组件
    - 在 `frontend/src/pages/pipelines/detail/comps/` 中创建 ETLEngineConfig.tsx
    - 实现引擎选择 UI
    - _Requirements: 5.1, 5.2, 6.1, 6.3_
  - [x] 14.2 实现 EMR 配置选项
    - 显示 Spark 配置输入框
    - _Requirements: 6.4, 7.7_
  - [x] 14.3 实现保存和验证逻辑
    - 调用后端 API 保存配置
    - 显示切换警告
    - _Requirements: 6.5, 6.6, 6.8_
  - [x] 14.4 实现全局和按应用配置切换
    - 显示配置覆盖状态
    - 提供重置选项
    - _Requirements: 6.9, 6.10_
  - [x] 14.5 编写前端组件单元测试
    - 测试 UI 交互
    - _Requirements: 6.3, 6.4_

- [x] 15. 集成到 Pipeline 详情页面
  - [x] 15.1 在 Pipeline 详情页添加配置 Tab
    - 修改 `frontend/src/pages/pipelines/detail/PipelineDetail.tsx`
    - 添加字段过滤和 ETL 引擎配置入口
    - _Requirements: 2.1, 5.1_
  - [x] 15.2 在 App 设置页添加配置入口
    - 支持按应用配置
    - _Requirements: 2.2, 6.2_
  - [x] 15.3 编写集成测试
    - 测试页面导航和配置保存
    - _Requirements: 2.1, 2.2_

- [x] 16. Checkpoint - 确保前端测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 17. 配置同步到 S3
  - [x] 17.1 实现配置变更事件处理
    - 当配置更新时同步到 S3
    - _Requirements: 3.2_
  - [x] 17.2 创建配置同步 Lambda
    - 将 DynamoDB 配置同步到 S3 JSON 文件
    - _Requirements: 1.8, 4.4_
  - [x] 17.3 编写配置同步测试
    - 测试 DynamoDB 到 S3 同步
    - _Requirements: 3.2_

- [x] 18. 监控和告警
  - [x] 18.1 添加 CloudWatch 指标
    - 记录 EMR 作业执行时间和状态
    - _Requirements: 9.1, 9.2_
  - [x] 18.2 创建 CloudWatch Dashboard
    - 显示 EMR Serverless 指标
    - _Requirements: 9.3_
  - [x] 18.3 添加字段过滤指标
    - 记录过滤字段数量
    - _Requirements: 9.4, 9.5_

- [x] 19. 向后兼容性处理
  - [x] 19.1 实现默认配置逻辑
    - 未配置时使用默认值
    - _Requirements: 10.1, 10.2_
  - [x] 19.2 实现配置迁移逻辑
    - 升级时自动迁移配置
    - _Requirements: 10.4_
  - [x] 19.3 验证数据 schema 兼容性
    - 确保与现有表结构兼容
    - _Requirements: 10.3_

- [x] 20. Final Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 确保所有测试通过，如有问题请询问用户

## Notes

- All tasks are required for complete implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 前端使用 React + TypeScript，后端使用 TypeScript (Node.js)，数据处理使用 Java (Spark)
