# Implementation Plan: Field Collection Filter

## Overview

本实现计划将字段收集过滤功能分解为可执行的编码任务。实现顺序为：后端 API → 前端界面 → 数据管道集成。每个任务都包含具体的代码修改和测试要求。

## Tasks

- [x] 1. 后端数据模型和存储层
  - [x] 1.1 创建 IFieldFilterRule 接口定义
    - 在 `src/control-plane/backend/lambda/api/model/` 目录创建 `field-filter.ts`
    - 定义 IFieldFilterRule 接口，包含 id、type、prefix、projectId、pipelineId、appId、filterMode、fields、createAt、updateAt、operator、deleted 属性
    - 定义 FilterMode 类型为 'whitelist' | 'blacklist'
    - _Requirements: 8.1, 2.3_

  - [x] 1.2 扩展 DynamoDB Store 添加过滤规则存储方法
    - 修改 `src/control-plane/backend/lambda/api/store/click-stream-store.ts` 添加接口方法
    - 修改 `src/control-plane/backend/lambda/api/store/dynamodb/dynamodb-store.ts` 实现存储方法
    - 实现 addFieldFilterRule、getFieldFilterRule、updateFieldFilterRule、deleteFieldFilterRule、listFieldFilterRules 方法
    - 使用 prefix "FILTER_RULE" 和 type "FILTER_RULE#pipeline#\<id\>" 或 "FILTER_RULE#app#\<id\>"
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 1.3 编写 DynamoDB Store 过滤规则方法的单元测试
    - 在 `test/control-plane/` 目录创建 `field-filter-store.test.ts`
    - 测试 CRUD 操作
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. 后端 API 服务层
  - [x] 2.1 创建 FieldFilterService 服务类
    - 在 `src/control-plane/backend/lambda/api/service/` 目录创建 `field-filter.ts`
    - 实现 create、get、update、delete、listByPipeline、getEffectiveRule 方法
    - 实现字段名验证逻辑（正则表达式 `^[a-zA-Z_][a-zA-Z0-9_.]*$`）
    - 实现字段去重逻辑
    - 实现字段数量限制验证（最多 500 个）
    - 实现 filterMode 验证
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.2, 3.5, 3.6, 9.1, 9.2, 9.3, 9.4_

  - [x] 2.2 实现有效规则解析逻辑
    - 在 FieldFilterService 中实现 getEffectiveRule 方法
    - 优先返回应用级规则，不存在时回退到管道级规则
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 2.3 编写属性测试：字段名验证
    - **Property 4: Field Name Validation**
    - 使用 fast-check 生成随机字符串，验证只有符合模式的字段名被接受
    - **Validates: Requirements 3.2, 9.3**

  - [x] 2.4 编写属性测试：字段去重
    - **Property 5: Field List Deduplication**
    - 使用 fast-check 生成带重复的字段列表，验证去重后每个字段只出现一次
    - **Validates: Requirements 3.6**

  - [x] 2.5 编写属性测试：字段数量限制
    - **Property 6: Field Count Limit Enforcement**
    - 使用 fast-check 生成不同长度的字段列表，验证超过 500 个时被拒绝
    - **Validates: Requirements 3.5, 9.2**

  - [x] 2.6 编写属性测试：应用级规则优先
    - **Property 7: App-Level Rule Priority**
    - 验证当存在应用级和管道级规则时，返回应用级规则
    - **Validates: Requirements 5.2, 5.3**

- [x] 3. 后端 API 路由层
  - [x] 3.1 创建 FieldFilterRouter 路由器
    - 在 `src/control-plane/backend/lambda/api/router/` 目录创建 `field-filter.ts`
    - 实现 POST /api/filter（创建规则）
    - 实现 GET /api/filter（列出规则）
    - 实现 GET /api/filter/:id（获取规则详情）
    - 实现 PUT /api/filter/:id（更新规则）
    - 实现 DELETE /api/filter/:id（删除规则）
    - 实现 GET /api/filter/effective/:appId（获取有效规则）
    - 添加请求验证中间件
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 3.2 注册路由到 Express 应用
    - 修改 `src/control-plane/backend/lambda/api/index.ts`
    - 导入并注册 router_field_filter
    - _Requirements: 1.1_

  - [x] 3.3 编写 API 路由集成测试
    - 在 `test/control-plane/` 目录创建 `field-filter-api.test.ts`
    - 测试所有 API 端点的正常和错误场景
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 4. Checkpoint - 后端 API 完成
  - 确保所有后端测试通过
  - 如有问题请向用户确认

- [x] 5. 前端 API 客户端
  - [x] 5.1 创建字段过滤 API 客户端函数
    - 在 `frontend/src/apis/` 目录创建 `field-filter.ts`
    - 实现 createFieldFilterRule、getFieldFilterRule、updateFieldFilterRule、deleteFieldFilterRule、listFieldFilterRules、getEffectiveFieldFilterRule 函数
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 5.2 添加 TypeScript 类型定义
    - 在 `frontend/src/types/` 目录添加 IFieldFilterRule 接口定义
    - _Requirements: 8.1_

- [x] 6. 前端组件实现
  - [x] 6.1 创建 FieldListEditor 组件
    - 在 `frontend/src/components/field-filter/` 目录创建 `FieldListEditor.tsx`
    - 实现字段添加、删除功能
    - 实现批量导入功能（支持逗号或换行分隔）
    - 显示系统必需字段为不可删除状态
    - 显示字段数量计数和限制提示
    - _Requirements: 6.4, 10.4_

  - [x] 6.2 创建 FieldFilterConfig 组件（管道级）
    - 在 `frontend/src/pages/pipelines/detail/comps/` 目录创建 `FieldFilter.tsx`
    - 实现过滤模式选择器（白名单/黑名单单选按钮）
    - 集成 FieldListEditor 组件
    - 实现保存和取消功能
    - 实现未保存更改确认对话框
    - _Requirements: 6.1, 6.3, 6.5, 6.6_

  - [x] 6.3 将 FieldFilter 选项卡添加到管道详情页
    - 修改 `frontend/src/pages/pipelines/detail/PipelineDetail.tsx`
    - 在 Tabs 组件中添加 "Field Filter" 选项卡
    - _Requirements: 6.1_

  - [x] 6.4 创建 AppFieldFilter 组件（应用级）
    - 在 `frontend/src/pages/application/detail/comps/` 目录创建 `AppFieldFilter.tsx`
    - 显示继承的管道级规则（如果存在）
    - 允许创建应用级规则覆盖管道级规则
    - 显示当前生效规则的来源（管道级或应用级）
    - _Requirements: 6.2, 6.7_

  - [x] 6.5 将 AppFieldFilter 添加到应用详情页
    - 修改应用详情页面，添加字段过滤配置区域
    - _Requirements: 6.2_

  - [x] 6.6 编写前端组件单元测试
    - 测试 FieldListEditor 添加/删除字段功能
    - 测试模式切换功能
    - 测试表单验证
    - _Requirements: 6.3, 6.4_

- [x] 7. Checkpoint - 前端实现完成
  - 确保所有前端测试通过
  - 如有问题请向用户确认

- [x] 8. 数据管道过滤逻辑
  - [x] 8.1 创建 FieldFilterRule Java 模型类
    - 在 `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/model/` 目录创建 `FieldFilterRule.java`
    - 定义 projectId、pipelineId、appId、filterMode、fields 属性
    - 定义 FilterMode 枚举（WHITELIST、BLACKLIST）
    - _Requirements: 8.1_

  - [x] 8.2 创建 FieldFilterConfigLoader 类
    - 在 `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/util/` 目录创建 `FieldFilterConfigLoader.java`
    - 实现从 S3 配置文件加载过滤规则
    - 实现 getEffectiveRule 方法（应用级优先）
    - _Requirements: 7.1, 5.2, 5.3_

  - [x] 8.3 创建 FieldFilterTransformer 类
    - 在 `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/transformer/` 目录创建 `FieldFilterTransformer.java`
    - 定义 SYSTEM_REQUIRED_FIELDS 常量集合
    - 实现 transform 方法
    - 实现 applyWhitelistFilter 方法（保留指定字段 + 系统必需字段）
    - 实现 applyBlacklistFilter 方法（移除指定字段，保护系统必需字段）
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 10.1, 10.2, 10.3_

  - [x] 8.4 编写属性测试：白名单过滤正确性
    - **Property 2: Whitelist Filtering Correctness**
    - 使用 jqwik 生成随机事件和白名单字段
    - 验证过滤后只包含白名单字段和系统必需字段
    - **Validates: Requirements 2.1, 7.3, 10.2**

  - [x] 8.5 编写属性测试：黑名单过滤正确性
    - **Property 3: Blacklist Filtering Correctness**
    - 使用 jqwik 生成随机事件和黑名单字段
    - 验证过滤后移除黑名单字段但保留系统必需字段
    - **Validates: Requirements 2.2, 7.4, 10.3**

  - [x] 8.6 编写属性测试：系统必需字段保护
    - **Property 8: System Required Fields Protection**
    - 验证任何过滤规则都不会移除系统必需字段
    - **Validates: Requirements 7.5, 10.1, 10.2, 10.3**

- [x] 9. 数据管道集成
  - [x] 9.1 集成 FieldFilterTransformer 到 ETL 流程
    - 修改 `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/ETLRunner.java`
    - 在 UAEnrichment 之后、数据建模之前添加 FieldFilterTransformer
    - _Requirements: 7.2, 7.6_

  - [x] 9.2 添加过滤规则配置参数传递
    - 修改 `src/data-pipeline/lambda/emr-job-submitter/emr-client-util.ts`
    - 添加 fieldFilterConfigPath 参数传递到 Spark 作业
    - _Requirements: 7.1_

  - [x] 9.3 更新 CloudFormation 参数
    - 修改 `src/data-pipeline/parameter.ts` 添加字段过滤相关参数
    - 修改 `src/data-pipeline/data-pipeline.ts` 传递参数
    - _Requirements: 7.1_

  - [x] 9.4 编写数据管道集成测试
    - 测试端到端过滤流程
    - 测试规则更新后的生效
    - _Requirements: 7.2, 7.6_

- [x] 10. 级联删除实现
  - [x] 10.1 实现管道删除时级联删除过滤规则
    - 修改 `src/control-plane/backend/lambda/api/service/pipeline.ts`
    - 在删除管道时调用 FieldFilterService 删除关联规则
    - _Requirements: 4.4_

  - [x] 10.2 实现应用删除时级联删除过滤规则
    - 修改 `src/control-plane/backend/lambda/api/service/application.ts`
    - 在删除应用时调用 FieldFilterService 删除关联规则
    - _Requirements: 5.5_

  - [x] 10.3 编写属性测试：级联删除
    - **Property 9: Cascade Delete on Pipeline Deletion**
    - **Property 10: Cascade Delete on Application Deletion**
    - 验证删除管道/应用后关联规则被标记为删除
    - **Validates: Requirements 4.4, 5.5**

- [x] 11. 端到端属性测试
  - [x] 11.1 编写属性测试：规则往返一致性
    - **Property 1: Filter Rule Round-Trip Consistency**
    - 创建规则后检索，验证数据一致
    - **Validates: Requirements 1.1, 1.2, 8.1**

  - [x] 11.2 编写属性测试：无效输入拒绝
    - **Property 11: Invalid Input Rejection**
    - 验证无效 filterMode 被拒绝
    - **Validates: Requirements 1.5, 9.1, 9.4**

  - [x] 11.3 编写属性测试：审计追踪完整性
    - **Property 12: Audit Trail Completeness**
    - 验证创建/更新操作记录 operator 和时间戳
    - **Validates: Requirements 1.6**

- [x] 12. Final Checkpoint - 所有测试通过
  - 确保所有单元测试、属性测试和集成测试通过
  - 如有问题请向用户确认

## Notes

- 所有任务均为必需任务，包括所有属性测试和单元测试
- 每个任务都引用了具体的需求条款以确保可追溯性
- 属性测试验证通用正确性属性，需要至少 100 次迭代
- 单元测试验证具体示例和边界情况
- Checkpoint 任务用于阶段性验证和用户确认
