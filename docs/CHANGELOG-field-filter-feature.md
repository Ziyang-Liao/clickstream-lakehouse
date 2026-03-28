# Field Filter 功能更改日志

本文档记录了 Field Filter（字段过滤）功能从开始构建到完成的所有代码更改。

## 功能概述

Field Filter 功能允许用户在 Pipeline 或 App 级别配置要过滤（排除或包含）的事件字段。用户可以通过 UI 选择要过滤的字段，配置保存到 DynamoDB，然后在 ETL 处理时同步到 S3，由 Spark 作业读取并应用过滤规则。

---

## 第一部分：前端 UI 实现

### 1. 前端类型定义

**文件**: `frontend/src/types/field-filter.d.ts`

**更改类型**: 新建文件

**说明**: 定义 Field Filter 相关的 TypeScript 类型

```typescript
type FilterMode = 'whitelist' | 'blacklist';

interface IFieldFilterRule {
  id?: string;
  type?: string;
  prefix?: string;
  projectId: string;
  pipelineId: string;
  appId?: string;
  filterMode: FilterMode;
  fields: string[];
  createAt?: number;
  updateAt?: number;
  operator?: string;
  deleted?: boolean;
  source?: 'pipeline' | 'app';
}
```

---

### 2. 前端 API 调用函数

**文件**: `frontend/src/apis/field-filter.ts`

**更改类型**: 新建文件

**说明**: 定义所有 Field Filter 相关的 API 调用函数

- `getAvailableFields()` - 获取可用字段列表
- `getFieldFilterRule()` - 获取过滤规则
- `saveFieldFilterRule()` - 保存过滤规则
- `deleteFieldFilterRule()` - 删除过滤规则
- `getEffectiveFieldFilterRule()` - 获取生效的过滤规则

---

### 3. 字段列表编辑器组件

**文件**: `frontend/src/components/field-filter/FieldListEditor.tsx`

**更改类型**: 新建文件

**说明**: 带复选框的字段选择列表组件，支持：
- 按类别分组显示字段
- 搜索功能
- 全选/取消全选
- 显示字段的中英文名称和描述

---

### 4. Pipeline 字段过滤页面

**文件**: `frontend/src/pages/pipelines/detail/comps/FieldFilter.tsx`

**更改类型**: 新建文件

**说明**: Pipeline 级别的字段过滤配置页面

---

### 5. App 字段过滤页面

**文件**: `frontend/src/pages/application/detail/comp/AppFieldFilter.tsx`

**更改类型**: 新建文件

**说明**: App 级别的字段过滤配置页面

---

### 6. 更新 Pipeline 详情页面

**文件**: `frontend/src/pages/pipelines/detail/PipelineDetail.tsx`

**更改类型**: 修改文件

**说明**: 添加 Field Filter Tab 到 Pipeline 详情页面

---

### 7. 更新 Application 详情页面

**文件**: `frontend/src/pages/application/detail/ApplicationDetail.tsx`

**更改类型**: 修改文件

**说明**: 添加 Field Filter Tab 到 Application 详情页面

---

### 8. 更新 i18n 配置

**文件**: `frontend/src/i18n.ts`

**更改类型**: 修改文件

**说明**: 添加 fieldFilter 命名空间

---

### 9. 翻译文件

**文件**: 
- `frontend/public/locales/en-US/fieldFilter.json`
- `frontend/public/locales/zh-CN/fieldFilter.json`

**更改类型**: 新建文件

**说明**: 添加字段过滤相关的翻译文本

---

## 第二部分：后端 API 实现

### 10. 事件字段定义

**文件**: `src/control-plane/backend/lambda/api/common/event-fields.ts`

**更改类型**: 新建文件

**说明**: 定义约 80 个事件字段，包含字段名、类别、显示名称（中英文）、描述和系统必需标志

```typescript
export interface EventField {
  name: string;
  category: string;
  displayName: { en: string; zh: string; };
  description: { en: string; zh: string; };
  systemRequired?: boolean;
}

export const EVENT_FIELDS: EventField[] = [
  // 事件基础字段、设备字段、地理位置字段等
];
```

---

### 11. Field Filter 数据模型

**文件**: `src/control-plane/backend/lambda/api/model/field-filter.ts`

**更改类型**: 新建文件

**说明**: 定义 Field Filter Rule 的接口

```typescript
export type FilterMode = 'whitelist' | 'blacklist';

export interface IFieldFilterRule {
  readonly id: string;
  readonly type: string;
  readonly prefix: string;
  readonly projectId: string;
  readonly pipelineId: string;
  readonly appId?: string;
  readonly filterMode: FilterMode;
  readonly fields: string[];
  readonly createAt: number;
  readonly updateAt: number;
  readonly operator: string;
  readonly deleted: boolean;
}
```

---

### 12. Field Filter 路由

**文件**: `src/control-plane/backend/lambda/api/router/field-filter.ts`

**更改类型**: 新建文件

**说明**: 定义 Field Filter 相关的 API 路由

- `GET /api/filter/available-fields` - 获取可用字段
- `GET /api/filter/rule` - 获取过滤规则
- `PUT /api/filter/rule` - 保存过滤规则
- `DELETE /api/filter/rule` - 删除过滤规则
- `GET /api/filter/effective` - 获取生效的过滤规则

---

### 13. Field Filter 服务

**文件**: `src/control-plane/backend/lambda/api/service/field-filter.ts`

**更改类型**: 新建文件

**说明**: 实现 Field Filter 相关的业务逻辑

---

### 14. 更新 API 入口

**文件**: `src/control-plane/backend/lambda/api/index.ts`

**更改类型**: 修改文件

**说明**: 注册 Field Filter 路由

```typescript
import { router as fieldFilterRouter } from './router/field-filter';
app.use('/api/filter', fieldFilterRouter);
```

---

### 15. 更新权限中间件

**文件**: `src/control-plane/backend/lambda/api/middle-ware/auth-role.ts`

**更改类型**: 修改文件

**说明**: 添加 Field Filter API 的权限配置

---

### 16. 更新 ClickStream Store 接口

**文件**: `src/control-plane/backend/lambda/api/store/click-stream-store.ts`

**更改类型**: 修改文件

**说明**: 添加 Field Filter Rule 相关的存储方法接口

```typescript
// Field Filter Rule methods
addFieldFilterRule: (rule: IFieldFilterRule) => Promise<string>;
getFieldFilterRule: (projectId: string, pipelineId: string, appId?: string) => Promise<IFieldFilterRule | undefined>;
updateFieldFilterRule: (rule: IFieldFilterRule) => Promise<void>;
deleteFieldFilterRule: (projectId: string, pipelineId: string, appId: string | undefined, operator: string) => Promise<void>;
listFieldFilterRules: (projectId: string, pipelineId: string) => Promise<IFieldFilterRule[]>;
```

---

### 17. 更新 DynamoDB Store 实现

**文件**: `src/control-plane/backend/lambda/api/store/dynamodb/dynamodb-store.ts`

**更改类型**: 修改文件

**说明**: 实现 Field Filter Rule 的 DynamoDB 存储操作

- `addFieldFilterRule()` - 添加规则
- `getFieldFilterRule()` - 获取规则
- `updateFieldFilterRule()` - 更新规则
- `deleteFieldFilterRule()` - 软删除规则
- `listFieldFilterRules()` - 列出规则

---

### 18. 更新 Pipeline 服务

**文件**: `src/control-plane/backend/lambda/api/service/pipeline.ts`

**更改类型**: 修改文件

**说明**: 添加 Field Filter 相关的 Pipeline 服务方法

---

### 19. 更新 Application 服务

**文件**: `src/control-plane/backend/lambda/api/service/application.ts`

**更改类型**: 修改文件

**说明**: 添加 Field Filter 相关的 Application 服务方法

---

### 20. 更新 package.json

**文件**: `src/control-plane/backend/lambda/api/package.json`

**更改类型**: 修改文件

**说明**: 添加必要的依赖

---

## 第三部分：CDK 基础设施配置

### 21. 添加 CloudFormation 参数

**文件**: `src/data-pipeline/parameter.ts`

**更改类型**: 修改文件

**说明**: 添加新的 CloudFormation 参数

```typescript
const pipelineIdParam = new CfnParameter(scope, 'PipelineId', {
  description: 'Pipeline ID (UUID format)',
  default: '',
  type: 'String',
});

const clickstreamMetadataDdbArnParam = new CfnParameter(scope, 'ClickstreamMetadataDdbArn', {
  description: 'The ARN of Clickstream Metadata DynamoDB table (optional, for field filter sync)',
  default: '',
  allowedPattern: `^(${DDB_TABLE_ARN_PATTERN})?$`,
  type: 'String',
});
```

---

### 22. 更新 Data Pipeline Stack

**文件**: `src/data-pipeline-stack.ts`

**更改类型**: 修改文件

**说明**: 传递新参数到 NestedStack

```typescript
const dataPipelineStackWithCustomPlugins = new DataPipelineNestedStack(this, 'DataPipelineWithCustomPlugins', {
  // ...
  pipelineId: pipelineIdParam.valueAsString,
  clickstreamMetadataDdbArn: clickstreamMetadataDdbArnParam.valueAsString,
});
```

---

### 23. 更新 DataPipelineProps 接口

**文件**: `src/data-pipeline/data-pipeline.ts`

**更改类型**: 修改文件

**说明**: 添加新属性到 DataPipelineProps

```typescript
export interface DataPipelineProps {
  // ...
  readonly pipelineId?: string;
  readonly clickstreamMetadataDdbArn?: string;
}
```

---

### 24. 更新 LambdaUtil

**文件**: `src/data-pipeline/utils/utils-lambda.ts`

**更改类型**: 修改文件

**说明**: 
- 添加 Props 接口属性
- 添加环境变量 (PIPELINE_ID, CLICK_STREAM_TABLE_NAME)
- 添加 DynamoDB 读取权限

```typescript
// Add pipelineId if provided
if (this.props.pipelineId) {
  envVars.PIPELINE_ID = this.props.pipelineId;
}

// Add DynamoDB table name if provided
if (this.props.clickstreamMetadataDdbArn) {
  envVars.CLICK_STREAM_TABLE_NAME = Fn.select(1, Fn.split('/', Fn.select(5, Fn.split(':', this.props.clickstreamMetadataDdbArn))));
}

// Add DynamoDB read permission
if (this.props.clickstreamMetadataDdbArn) {
  lambdaRole.addToPolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['dynamodb:Query', 'dynamodb:GetItem'],
    resources: [
      this.props.clickstreamMetadataDdbArn,
      `${this.props.clickstreamMetadataDdbArn}/index/*`,
    ],
  }));
}
```

---

### 25. 更新 CDataProcessingStack 参数

**文件**: `src/control-plane/backend/lambda/api/model/stacks.ts`

**更改类型**: 修改文件

**说明**: 添加 PipelineId 和 ClickstreamMetadataDdbArn 参数

```typescript
@JSONObject.optional('')
@JSONObject.custom( (stack :CDataProcessingStack, _key:string, _value:any) => {
  return stack._pipeline?.pipelineId;
})
@supportVersions([SolutionVersion.V_1_1_0, SolutionVersion.ANY])
PipelineId?: string;

@JSONObject.optional('')
@JSONObject.custom( (_stack :CDataProcessingStack, _key:string, _value:any) => {
  const partition = awsRegion?.startsWith('cn') ? 'aws-cn' : 'aws';
  return `arn:${partition}:dynamodb:${awsRegion}:${awsAccountId}:table/${clickStreamTableName}`;
})
@supportVersions([SolutionVersion.V_1_1_0, SolutionVersion.ANY])
ClickstreamMetadataDdbArn?: string;
```

---

## 第四部分：EMR Job Submitter Lambda - DynamoDB 到 S3 同步

### 26. 添加 DynamoDB 同步逻辑

**文件**: `src/data-pipeline/lambda/emr-job-submitter/emr-client-util.ts`

**更改类型**: 修改文件

**说明**: 
- 添加 DynamoDB 客户端
- 添加 `syncFieldFilterRulesToS3()` 函数
- 添加 `getFieldFilterRuleFromDynamoDB()` 函数
- 在 `putInitRuleConfig()` 中调用同步函数

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const FIELD_FILTER_RULE_FILE_NAME = 'field_filter_rule.json';

async function syncFieldFilterRulesToS3(bucket: string, keyPrefix: string, appIds: string) {
  const tableName = process.env.CLICK_STREAM_TABLE_NAME;
  const projectId = process.env.PROJECT_ID;
  const pipelineId = process.env.PIPELINE_ID;
  
  // 查询 pipeline 级别和 app 级别的规则
  // 将规则写入 S3: s3://bucket/prefix/appId/field_filter_rule.json
}

async function getFieldFilterRuleFromDynamoDB(
  tableName: string,
  projectId: string,
  pipelineId: string,
  appId?: string,
): Promise<FieldFilterRuleRecord | undefined> {
  // 查询 DynamoDB
}
```

---

## 第五部分：Spark ETL 实现

### 27. Field Filter Rule 模型

**文件**: `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/model/FieldFilterRule.java`

**更改类型**: 新建文件

**说明**: 定义 Field Filter Rule 的 Java 模型类

```java
@Getter @Setter @Builder
public class FieldFilterRule {
    private String projectId;
    private String pipelineId;
    private String appId;
    private FilterMode filterMode;
    private List<String> fields;

    public enum FilterMode {
        WHITELIST,
        BLACKLIST
    }
}
```

---

### 28. Field Filter Transformer

**文件**: `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/transformer/FieldFilterTransformer.java`

**更改类型**: 新建文件

**说明**: 实现字段过滤转换器

- `transform()` - 应用过滤规则
- `applyWhitelistFilter()` - 白名单过滤
- `applyBlacklistFilter()` - 黑名单过滤
- `SYSTEM_REQUIRED_FIELDS` - 系统必需字段（不可被过滤）

```java
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
```

---

### 29. Field Filter Config Loader

**文件**: `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/util/FieldFilterConfigLoader.java`

**更改类型**: 新建文件

**说明**: 从 S3 加载 Field Filter 配置

- `loadRules()` - 加载规则
- `getEffectiveRule()` - 获取生效的规则（App 级别优先于 Pipeline 级别）

---

### 30. Field Filter Rule Config (ETL Common)

**文件**: `src/data-pipeline/etl-common/src/main/java/software/aws/solution/clickstream/common/FieldFilterRuleConfig.java`

**更改类型**: 新建文件

**说明**: ETL 通用的 Field Filter 配置类

---

### 31. 更新 TransformConfig

**文件**: `src/data-pipeline/etl-common/src/main/java/software/aws/solution/clickstream/common/TransformConfig.java`

**更改类型**: 修改文件

**说明**: 添加 appFieldFilterConfig 字段

```java
private Map<String, FieldFilterRuleConfig> appFieldFilterConfig;
```

---

### 32. 更新 ETLRunner

**文件**: `src/data-pipeline/spark-etl/src/main/java/software/aws/solution/clickstream/ETLRunner.java`

**更改类型**: 修改文件

**说明**: 
- 添加 FieldFilterTransformer 和 FieldFilterConfigLoader
- 在 `initConfig()` 中加载 Field Filter 规则
- 在 `executeTransformers()` 后调用 `applyFieldFiltering()`

```java
private final FieldFilterTransformer fieldFilterTransformer;
private final FieldFilterConfigLoader fieldFilterConfigLoader;

private Dataset<Row> applyFieldFiltering(final Dataset<Row> dataset) {
    // 应用字段过滤
}
```

---

### 33. 更新 Gradle 配置

**文件**: `src/data-pipeline/spark-etl/build.gradle`

**更改类型**: 修改文件

**说明**: 添加 jqwik 测试依赖（用于属性测试）

---

### 34. 更新 Gradle Properties

**文件**: `src/data-pipeline/spark-etl/gradle.properties`

**更改类型**: 修改文件

**说明**: 添加 jqwik 版本配置

---

## 第六部分：测试文件

### 35. Field Filter API 测试

**文件**: `src/control-plane/backend/lambda/api/test/api/field-filter-api.test.ts`

**更改类型**: 新建文件

**说明**: Field Filter API 的单元测试

---

### 36. Field Filter Store 测试

**文件**: `src/control-plane/backend/lambda/api/test/api/field-filter-store.test.ts`

**更改类型**: 新建文件

**说明**: Field Filter Store 的单元测试

---

### 37. Field Filter Transformer 测试

**文件**: `src/data-pipeline/spark-etl/src/test/java/software/aws/solution/clickstream/FieldFilterTransformerTest.java`

**更改类型**: 新建文件

**说明**: FieldFilterTransformer 的单元测试

---

### 38. Field Filter Transformer 属性测试

**文件**: `src/data-pipeline/spark-etl/src/test/java/software/aws/solution/clickstream/FieldFilterTransformerPropertyTest.java`

**更改类型**: 新建文件

**说明**: FieldFilterTransformer 的属性测试（使用 jqwik）

---

### 39. ETL Runner Field Filter 集成测试

**文件**: `src/data-pipeline/spark-etl/src/test/java/software/aws/solution/clickstream/ETLRunnerFieldFilterIntegrationTest.java`

**更改类型**: 新建文件

**说明**: ETLRunner 中 Field Filter 功能的集成测试

---

## 数据流说明

### 配置保存流程
1. 用户在 UI 上选择要过滤的字段
2. 前端调用 `PUT /api/filter/rule` API
3. 后端将规则保存到 DynamoDB
   - Key: `id = projectId, type = FILTER_RULE#pipeline#${pipelineId}` 或 `FILTER_RULE#app#${appId}`

### ETL 同步流程
1. EMR Job Submitter Lambda 启动时
2. 从环境变量获取 `CLICK_STREAM_TABLE_NAME` 和 `PIPELINE_ID`
3. 查询 DynamoDB 获取 Field Filter 规则
4. 将规则写入 S3: `s3://bucket/prefix/appId/field_filter_rule.json`
5. Spark ETL 作业读取 S3 中的规则文件
6. 应用字段过滤逻辑

### DynamoDB 表结构
```
Table: ClickstreamMetadata
Partition Key: id (projectId)
Sort Key: type (FILTER_RULE#pipeline#${pipelineId} 或 FILTER_RULE#app#${appId})

Item:
{
  id: "projectId",
  type: "FILTER_RULE#pipeline#pipelineId",
  projectId: "projectId",
  pipelineId: "pipelineId",
  appId: "appId" (optional),
  filterMode: "whitelist" | "blacklist",
  fields: ["field1", "field2", ...],
  deleted: false
}
```

### S3 规则文件格式
```json
{
  "projectId": "projectId",
  "pipelineId": "pipelineId",
  "appId": "appId",
  "filterMode": "blacklist",
  "fields": ["device_mobile_brand_name", "device_mobile_model_name", ...]
}
```

---

## 文件更改汇总

### 新建文件 (24 个)

| 文件路径 | 说明 |
|---------|------|
| `frontend/src/types/field-filter.d.ts` | 前端类型定义 |
| `frontend/src/apis/field-filter.ts` | 前端 API 函数 |
| `frontend/src/components/field-filter/FieldListEditor.tsx` | 字段选择组件 |
| `frontend/src/pages/pipelines/detail/comps/FieldFilter.tsx` | Pipeline 过滤页面 |
| `frontend/src/pages/application/detail/comp/AppFieldFilter.tsx` | App 过滤页面 |
| `frontend/public/locales/en-US/fieldFilter.json` | 英文翻译 |
| `frontend/public/locales/zh-CN/fieldFilter.json` | 中文翻译 |
| `src/control-plane/backend/lambda/api/common/event-fields.ts` | 事件字段定义 |
| `src/control-plane/backend/lambda/api/model/field-filter.ts` | 数据模型 |
| `src/control-plane/backend/lambda/api/router/field-filter.ts` | API 路由 |
| `src/control-plane/backend/lambda/api/service/field-filter.ts` | 业务服务 |
| `src/control-plane/backend/lambda/api/test/api/field-filter-api.test.ts` | API 测试 |
| `src/control-plane/backend/lambda/api/test/api/field-filter-store.test.ts` | Store 测试 |
| `src/data-pipeline/etl-common/.../FieldFilterRuleConfig.java` | ETL 配置类 |
| `src/data-pipeline/spark-etl/.../model/FieldFilterRule.java` | Spark 模型 |
| `src/data-pipeline/spark-etl/.../transformer/FieldFilterTransformer.java` | 过滤转换器 |
| `src/data-pipeline/spark-etl/.../util/FieldFilterConfigLoader.java` | 配置加载器 |
| `src/data-pipeline/spark-etl/.../FieldFilterTransformerTest.java` | 单元测试 |
| `src/data-pipeline/spark-etl/.../FieldFilterTransformerPropertyTest.java` | 属性测试 |
| `src/data-pipeline/spark-etl/.../ETLRunnerFieldFilterIntegrationTest.java` | 集成测试 |

### 修改文件 (21 个)

| 文件路径 | 说明 |
|---------|------|
| `frontend/src/i18n.ts` | 添加 fieldFilter 命名空间 |
| `frontend/src/pages/pipelines/detail/PipelineDetail.tsx` | 添加 Field Filter Tab |
| `frontend/src/pages/application/detail/ApplicationDetail.tsx` | 添加 Field Filter Tab |
| `src/control-plane/backend/lambda/api/index.ts` | 注册路由 |
| `src/control-plane/backend/lambda/api/middle-ware/auth-role.ts` | 权限配置 |
| `src/control-plane/backend/lambda/api/model/stacks.ts` | CloudFormation 参数 |
| `src/control-plane/backend/lambda/api/package.json` | 依赖更新 |
| `src/control-plane/backend/lambda/api/service/pipeline.ts` | Pipeline 服务 |
| `src/control-plane/backend/lambda/api/service/application.ts` | Application 服务 |
| `src/control-plane/backend/lambda/api/store/click-stream-store.ts` | Store 接口 |
| `src/control-plane/backend/lambda/api/store/dynamodb/dynamodb-store.ts` | DynamoDB 实现 |
| `src/data-pipeline-stack.ts` | CDK Stack |
| `src/data-pipeline/data-pipeline.ts` | DataPipeline Props |
| `src/data-pipeline/parameter.ts` | CloudFormation 参数 |
| `src/data-pipeline/utils/utils-lambda.ts` | Lambda 配置 |
| `src/data-pipeline/lambda/emr-job-submitter/emr-client-util.ts` | DynamoDB 同步 |
| `src/data-pipeline/etl-common/.../TransformConfig.java` | 添加字段 |
| `src/data-pipeline/spark-etl/build.gradle` | Gradle 依赖 |
| `src/data-pipeline/spark-etl/gradle.properties` | Gradle 属性 |
| `src/data-pipeline/spark-etl/.../ETLRunner.java` | ETL 主程序 |
| `pnpm-lock.yaml` | 依赖锁定文件 |

---

## 部署注意事项

1. 部署后需要更新现有 Pipeline 的 CloudFormation Stack，传入新的参数：
   - `PipelineId`: Pipeline 的 UUID
   - `ClickstreamMetadataDdbArn`: DynamoDB 表的 ARN

2. EMR Job Submitter Lambda 需要有 DynamoDB 读取权限

3. 首次 ETL 运行时会自动同步 Field Filter 规则到 S3

---

## 版本信息

- 功能版本: v1.1.0+
- 创建日期: 2026-01-05
- 最后更新: 2026-01-05
