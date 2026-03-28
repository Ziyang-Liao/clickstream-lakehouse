# Design Document: Field Collection Filter

## Overview

本设计文档描述了点击流分析解决方案的「字段收集过滤」功能的技术实现方案。该功能允许用户通过网页控制台配置字段过滤规则，支持按管道或应用级别配置白名单/黑名单过滤模式，在数据管道 ETL 阶段应用过滤逻辑。

### 设计目标

1. 与现有架构模式保持一致（Express.js API、DynamoDB 存储、React 前端）
2. 支持管道级和应用级过滤规则，应用级优先
3. 在 Spark ETL 阶段高效应用过滤逻辑
4. 保护系统必需字段不被过滤

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Control Plane                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   React UI      │───▶│  API Gateway    │───▶│  Lambda (Express.js)    │  │
│  │  FieldFilter    │    │  /api/filter    │    │  FieldFilterService     │  │
│  │  Component      │    │                 │    │                         │  │
│  └─────────────────┘    └─────────────────┘    └───────────┬─────────────┘  │
│                                                             │                │
│                                                             ▼                │
│                                                 ┌─────────────────────────┐  │
│                                                 │      DynamoDB           │  │
│                                                 │  ClickStreamTable       │  │
│                                                 │  (FILTER_RULE records)  │  │
│                                                 └───────────┬─────────────┘  │
└─────────────────────────────────────────────────────────────┼───────────────┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Data Pipeline                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │  Ingestion      │───▶│  S3 Source      │───▶│  EMR Serverless         │  │
│  │  Server         │    │  Bucket         │    │  Spark ETL              │  │
│  │                 │    │                 │    │  FieldFilterTransformer │  │
│  └─────────────────┘    └─────────────────┘    └───────────┬─────────────┘  │
│                                                             │                │
│                                                             ▼                │
│                                                 ┌─────────────────────────┐  │
│                                                 │  S3 Sink / Redshift     │  │
│                                                 │  (Filtered Data)        │  │
│                                                 └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Backend API Components

#### 1.1 FieldFilterRouter (`src/control-plane/backend/lambda/api/router/field-filter.ts`)

Express.js 路由器，处理字段过滤规则的 CRUD 操作。

```typescript
// API Endpoints
POST   /api/filter                    // 创建过滤规则
GET    /api/filter                    // 查询过滤规则列表
GET    /api/filter/:id                // 获取单个过滤规则详情
PUT    /api/filter/:id                // 更新过滤规则
DELETE /api/filter/:id                // 删除过滤规则
GET    /api/filter/effective/:appId   // 获取应用的有效过滤规则
```

#### 1.2 FieldFilterService (`src/control-plane/backend/lambda/api/service/field-filter.ts`)

业务逻辑层，处理过滤规则的验证、存储和查询。

```typescript
interface IFieldFilterService {
  // 创建过滤规则
  create(rule: IFieldFilterRule): Promise<string>;
  
  // 获取过滤规则
  get(projectId: string, ruleId: string): Promise<IFieldFilterRule | undefined>;
  
  // 更新过滤规则
  update(rule: IFieldFilterRule): Promise<void>;
  
  // 删除过滤规则
  delete(projectId: string, ruleId: string): Promise<void>;
  
  // 列出管道的过滤规则
  listByPipeline(projectId: string, pipelineId: string): Promise<IFieldFilterRule[]>;
  
  // 获取应用的有效过滤规则（优先应用级，回退管道级）
  getEffectiveRule(projectId: string, pipelineId: string, appId: string): Promise<IFieldFilterRule | undefined>;
  
  // 验证过滤规则
  validate(rule: IFieldFilterRule): ValidationResult;
}
```

#### 1.3 FieldFilterStore (`src/control-plane/backend/lambda/api/store/dynamodb/dynamodb-store.ts`)

DynamoDB 数据访问层扩展，添加过滤规则的存储操作。

### 2. Frontend Components

#### 2.1 FieldFilterConfig (`frontend/src/pages/pipelines/detail/comps/FieldFilter.tsx`)

管道详情页的字段过滤配置组件。

```typescript
interface FieldFilterConfigProps {
  pipelineInfo: IExtPipeline;
  onSave: (rule: IFieldFilterRule) => Promise<void>;
}
```

#### 2.2 AppFieldFilter (`frontend/src/pages/application/detail/comps/AppFieldFilter.tsx`)

应用详情页的字段过滤配置组件。

```typescript
interface AppFieldFilterProps {
  appId: string;
  projectId: string;
  pipelineId: string;
  inheritedRule?: IFieldFilterRule;  // 继承的管道级规则
  appRule?: IFieldFilterRule;        // 应用级规则
  onSave: (rule: IFieldFilterRule) => Promise<void>;
}
```

#### 2.3 FieldListEditor (`frontend/src/components/field-filter/FieldListEditor.tsx`)

字段列表编辑器组件，支持添加、删除、批量导入字段。

```typescript
interface FieldListEditorProps {
  fields: string[];
  onChange: (fields: string[]) => void;
  maxFields?: number;  // 默认 500
  systemFields?: string[];  // 系统必需字段（显示为不可删除）
}
```

### 3. Data Pipeline Components

#### 3.1 FieldFilterTransformer (`src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/transformer/FieldFilterTransformer.java`)

Spark ETL 转换器，在数据处理阶段应用字段过滤逻辑。

```java
public class FieldFilterTransformer implements Transformer {
    private static final Set<String> SYSTEM_REQUIRED_FIELDS = Set.of(
        "event_id", "event_name", "event_timestamp", 
        "app_id", "user_pseudo_id", "platform"
    );
    
    public Dataset<Row> transform(Dataset<Row> dataset);
    public Dataset<Row> applyWhitelistFilter(Dataset<Row> dataset, List<String> fields);
    public Dataset<Row> applyBlacklistFilter(Dataset<Row> dataset, List<String> fields);
}
```

#### 3.2 FieldFilterConfigLoader (`src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/util/FieldFilterConfigLoader.java`)

从 S3 或 DynamoDB 加载过滤规则配置。

```java
public class FieldFilterConfigLoader {
    public Map<String, FieldFilterRule> loadRules(String projectId, String pipelineId);
    public FieldFilterRule getEffectiveRule(String appId);
}
```

## Data Models

### 1. IFieldFilterRule (TypeScript)

```typescript
interface IFieldFilterRule {
  // 主键
  readonly id: string;           // UUID
  readonly type: string;         // "FILTER_RULE#<ruleId>" 或 "FILTER_RULE#<appId>"
  readonly prefix: string;       // "FILTER_RULE"
  
  // 关联信息
  readonly projectId: string;    // 项目 ID
  readonly pipelineId: string;   // 管道 ID
  readonly appId?: string;       // 应用 ID（可选，存在则为应用级规则）
  
  // 过滤配置
  readonly filterMode: FilterMode;  // "whitelist" | "blacklist"
  readonly fields: string[];        // 字段列表
  
  // 审计信息
  readonly createAt: number;     // 创建时间戳
  readonly updateAt: number;     // 更新时间戳
  readonly operator: string;     // 操作者
  
  // 软删除标记
  readonly deleted: boolean;
}

type FilterMode = 'whitelist' | 'blacklist';
```

### 2. DynamoDB 存储结构

| 属性 | 类型 | 说明 |
|------|------|------|
| id | String (PK) | projectId |
| type | String (SK) | "FILTER_RULE#pipeline#\<pipelineId\>" 或 "FILTER_RULE#app#\<appId\>" |
| prefix | String | "FILTER_RULE" (用于 GSI 查询) |
| pipelineId | String | 管道 ID |
| appId | String | 应用 ID（应用级规则） |
| filterMode | String | "whitelist" 或 "blacklist" |
| fields | List\<String\> | 字段名称列表 |
| createAt | Number | 创建时间戳 |
| updateAt | Number | 更新时间戳 |
| operator | String | 操作者 |
| deleted | Boolean | 软删除标记 |

### 3. FieldFilterRule (Java - Spark ETL)

```java
public class FieldFilterRule {
    private String projectId;
    private String pipelineId;
    private String appId;
    private FilterMode filterMode;
    private List<String> fields;
    
    public enum FilterMode {
        WHITELIST, BLACKLIST
    }
}
```

### 4. API Request/Response Models

```typescript
// 创建/更新请求
interface CreateFieldFilterRequest {
  projectId: string;
  pipelineId: string;
  appId?: string;
  filterMode: FilterMode;
  fields: string[];
}

// 查询响应
interface FieldFilterResponse {
  id: string;
  projectId: string;
  pipelineId: string;
  appId?: string;
  filterMode: FilterMode;
  fields: string[];
  source: 'pipeline' | 'app';  // 规则来源
  createAt: number;
  updateAt: number;
}

// 验证错误响应
interface ValidationErrorResponse {
  success: false;
  message: string;
  errors: {
    field: string;
    message: string;
  }[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Filter Rule Round-Trip Consistency

*For any* valid filter rule configuration, creating the rule and then retrieving it should return an equivalent configuration (same filterMode, same fields after deduplication and sorting).

**Validates: Requirements 1.1, 1.2, 8.1**

### Property 2: Whitelist Filtering Correctness

*For any* event with arbitrary fields and any whitelist filter rule, applying the filter should result in an event containing only the intersection of whitelist fields with event fields, plus system required fields. When no whitelist fields exist in the event, only system required fields should remain.

**Validates: Requirements 2.1, 7.3, 7.8, 10.2**

### Property 3: Blacklist Filtering Correctness

*For any* event with arbitrary fields and any blacklist filter rule, applying the filter should result in an event containing all original fields except those in the blacklist (system required fields are never removed).

**Validates: Requirements 2.2, 7.4, 10.3**

### Property 4: Field Name Validation

*For any* string, the field name validation should accept it if and only if it matches the pattern `^[a-zA-Z_][a-zA-Z0-9_.]*$` and reject all other strings with appropriate error messages.

**Validates: Requirements 3.2, 9.3**

### Property 5: Field List Deduplication

*For any* list of field names with duplicates, the service should return a deduplicated list where each field appears exactly once, preserving the first occurrence order.

**Validates: Requirements 3.6**

### Property 6: Field Count Limit Enforcement

*For any* filter rule with more than 500 fields, the validation should reject the rule with an appropriate error message. Rules with 500 or fewer fields should be accepted.

**Validates: Requirements 3.5, 9.2**

### Property 7: App-Level Rule Priority

*For any* application with both app-level and pipeline-level filter rules, the effective rule should always be the app-level rule. When no app-level rule exists, the effective rule should be the pipeline-level rule.

**Validates: Requirements 5.2, 5.3**

### Property 8: System Required Fields Protection

*For any* filter rule (whitelist or blacklist) and any event, the filtered event should always contain all system required fields (event_id, event_name, event_timestamp, app_id, user_pseudo_id, platform).

**Validates: Requirements 7.5, 10.1, 10.2, 10.3**

### Property 9: Cascade Delete on Pipeline Deletion

*For any* pipeline with associated filter rules, deleting the pipeline should result in all associated filter rules being marked as deleted.

**Validates: Requirements 4.4**

### Property 10: Cascade Delete on Application Deletion

*For any* application with an associated filter rule, deleting the application should result in the associated filter rule being marked as deleted.

**Validates: Requirements 5.5**

### Property 11: Invalid Input Rejection

*For any* filter rule with invalid filterMode (not "whitelist" or "blacklist"), the service should reject the rule with a 400 error and descriptive message.

**Validates: Requirements 1.5, 9.1, 9.4**

### Property 12: Audit Trail Completeness

*For any* filter rule creation or update operation, the resulting rule should have non-empty operator field and updateAt timestamp greater than or equal to createAt.

**Validates: Requirements 1.6**

## Error Handling

### API Error Responses

| 错误场景 | HTTP 状态码 | 错误消息 |
|---------|------------|---------|
| 无效的 filterMode | 400 | "Invalid filterMode. Must be 'whitelist' or 'blacklist'" |
| 字段名格式错误 | 400 | "Invalid field name: {fieldName}. Must match pattern ^[a-zA-Z_][a-zA-Z0-9_.]*$" |
| 字段数量超限 | 400 | "Field list exceeds maximum limit of 500" |
| 管道不存在 | 404 | "Pipeline not found" |
| 应用不存在 | 404 | "Application not found" |
| 规则不存在 | 404 | "Filter rule not found" |
| 管道状态不允许更新 | 400 | "Pipeline current status does not allow update" |
| 重复创建规则 | 409 | "Filter rule already exists for this pipeline/app" |

### Data Pipeline Error Handling

1. **规则加载失败**: 记录错误日志，使用默认行为（不过滤任何字段）
2. **规则解析失败**: 记录错误日志，跳过该规则，继续处理
3. **字段不存在**: 静默忽略，不报错（字段可能在某些事件中不存在）

## Testing Strategy

### Unit Tests

1. **FieldFilterService 单元测试**
   - 测试规则验证逻辑
   - 测试字段名格式验证
   - 测试字段去重逻辑
   - 测试有效规则解析（应用级优先）

2. **FieldFilterTransformer 单元测试**
   - 测试白名单过滤逻辑
   - 测试黑名单过滤逻辑
   - 测试系统字段保护
   - 测试嵌套字段处理

3. **Frontend 组件测试**
   - 测试 FieldListEditor 添加/删除字段
   - 测试模式切换
   - 测试表单验证

### Property-Based Tests

使用 fast-check (TypeScript) 和 jqwik (Java) 进行属性测试。

**配置要求**:
- 每个属性测试最少运行 100 次迭代
- 测试标签格式: `Feature: field-collection-filter, Property N: {property_text}`

**TypeScript (fast-check)**:
```typescript
import * as fc from 'fast-check';

// Property 1: Round-trip consistency
fc.assert(
  fc.property(
    fc.record({
      filterMode: fc.constantFrom('whitelist', 'blacklist'),
      fields: fc.array(fc.string().filter(s => /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(s)), { maxLength: 500 })
    }),
    async (rule) => {
      const id = await service.create(rule);
      const retrieved = await service.get(id);
      return retrieved.filterMode === rule.filterMode &&
             arraysEqual(retrieved.fields, deduplicate(rule.fields));
    }
  ),
  { numRuns: 100 }
);
```

**Java (jqwik)**:
```java
@Property(tries = 100)
void whitelistFilteringPreservesOnlySpecifiedFields(
    @ForAll @Size(min = 1, max = 10) List<String> eventFields,
    @ForAll @Size(min = 1, max = 5) List<@AlphaChars String> whitelistFields
) {
    Dataset<Row> input = createDatasetWithFields(eventFields);
    Dataset<Row> output = transformer.applyWhitelistFilter(input, whitelistFields);
    
    Set<String> outputFields = new HashSet<>(Arrays.asList(output.columns()));
    Set<String> expectedFields = new HashSet<>(whitelistFields);
    expectedFields.addAll(SYSTEM_REQUIRED_FIELDS);
    expectedFields.retainAll(eventFields);
    
    assertThat(outputFields).isEqualTo(expectedFields);
}
```

### Integration Tests

1. **API 集成测试**
   - 测试完整的 CRUD 流程
   - 测试级联删除
   - 测试并发更新

2. **数据管道集成测试**
   - 测试规则配置到 ETL 应用的端到端流程
   - 测试规则更新后的生效时机
