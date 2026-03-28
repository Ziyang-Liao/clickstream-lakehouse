# Requirements Document

## Introduction

本文档定义了点击流分析解决方案的「字段收集过滤」功能需求。该功能允许用户通过网页控制台界面，按应用或管道配置字段过滤规则，以筛选点击流事件中需要收集的字段。支持白名单和黑名单两种匹配模式，过滤规则在数据摄入阶段应用。

## Glossary

- **Field_Filter_Service**: 负责管理字段过滤规则的后端服务组件
- **Filter_Rule**: 定义字段过滤行为的配置对象，包含过滤模式和字段列表
- **Filter_Mode**: 过滤模式，支持白名单（whitelist）或黑名单（blacklist）
- **Field_List**: 需要包含或排除的字段名称列表
- **Pipeline**: 数据管道，负责数据摄入、处理和建模的完整流程
- **Application**: 应用程序，代表一个独立的数据收集源
- **Control_Plane**: 控制平面，提供管理界面和 API 的后端服务
- **Data_Pipeline**: 数据管道组件，负责 ETL 处理和数据转换
- **Ingestion_Server**: 数据摄入服务器，接收客户端发送的点击流事件

## Requirements

### Requirement 1: 字段过滤规则管理 API

**User Story:** As a 系统管理员, I want to 通过 API 创建、查询、更新和删除字段过滤规则, so that 我可以灵活管理数据收集策略。

#### Acceptance Criteria

1. WHEN 管理员发送创建过滤规则请求 THEN THE Field_Filter_Service SHALL 验证请求参数并在 DynamoDB 中存储规则配置
2. WHEN 管理员发送查询过滤规则请求 THEN THE Field_Filter_Service SHALL 返回指定管道或应用的当前过滤规则配置
3. WHEN 管理员发送更新过滤规则请求 THEN THE Field_Filter_Service SHALL 验证新配置并更新 DynamoDB 中的规则
4. WHEN 管理员发送删除过滤规则请求 THEN THE Field_Filter_Service SHALL 从 DynamoDB 中移除指定的过滤规则
5. IF 请求参数无效（如字段名格式错误或模式值非法）THEN THE Field_Filter_Service SHALL 返回 400 错误码和详细错误信息
6. WHEN 过滤规则被创建或更新 THEN THE Field_Filter_Service SHALL 记录操作者和操作时间

### Requirement 2: 过滤模式支持

**User Story:** As a 数据工程师, I want to 选择白名单或黑名单过滤模式, so that 我可以根据业务需求灵活控制数据收集范围。

#### Acceptance Criteria

1. WHEN 用户选择白名单模式 THEN THE Field_Filter_Service SHALL 仅收集指定字段列表中的字段
2. WHEN 用户选择黑名单模式 THEN THE Field_Filter_Service SHALL 收集除指定字段列表外的所有字段
3. THE Filter_Rule SHALL 包含 filterMode 属性，值为 "whitelist" 或 "blacklist"
4. IF 未配置过滤规则 THEN THE Data_Pipeline SHALL 收集所有字段（默认行为）
5. WHEN 过滤模式从白名单切换到黑名单（或反之）THEN THE Field_Filter_Service SHALL 保留字段列表但更新过滤逻辑

### Requirement 3: 字段列表配置

**User Story:** As a 数据工程师, I want to 配置需要过滤的字段列表, so that 我可以精确控制收集哪些数据字段。

#### Acceptance Criteria

1. THE Filter_Rule SHALL 支持配置多个字段名称
2. WHEN 用户添加字段到列表 THEN THE Field_Filter_Service SHALL 验证字段名称格式（仅允许字母、数字、下划线和点号）
3. WHEN 用户配置嵌套字段（如 "user.attributes.name"）THEN THE Field_Filter_Service SHALL 支持点号分隔的路径表示法
4. IF 字段列表为空且模式为白名单 THEN THE Field_Filter_Service SHALL 返回警告提示（将不收集任何字段）
5. THE Filter_Rule SHALL 支持最多 500 个字段配置
6. WHEN 用户输入重复字段名 THEN THE Field_Filter_Service SHALL 自动去重并返回去重后的列表

### Requirement 4: 按管道配置过滤规则

**User Story:** As a 系统管理员, I want to 为特定管道配置字段过滤规则, so that 同一管道下的所有应用共享相同的过滤策略。

#### Acceptance Criteria

1. WHEN 管理员为管道配置过滤规则 THEN THE Field_Filter_Service SHALL 将规则与管道 ID 关联存储
2. WHEN 管道级过滤规则存在 THEN THE Data_Pipeline SHALL 对该管道下所有应用的数据应用相同的过滤规则
3. WHEN 查询管道详情 THEN THE Field_Filter_Service SHALL 返回包含过滤规则配置的完整管道信息
4. IF 管道被删除 THEN THE Field_Filter_Service SHALL 同时删除关联的过滤规则

### Requirement 5: 按应用配置过滤规则

**User Story:** As a 数据工程师, I want to 为特定应用配置独立的字段过滤规则, so that 不同应用可以有不同的数据收集策略。

#### Acceptance Criteria

1. WHEN 用户为应用配置过滤规则 THEN THE Field_Filter_Service SHALL 将规则与应用 ID 和管道 ID 关联存储
2. WHERE 应用级过滤规则存在 THEN THE Data_Pipeline SHALL 优先使用应用级规则而非管道级规则
3. IF 应用级规则不存在 THEN THE Data_Pipeline SHALL 回退使用管道级规则
4. WHEN 查询应用详情 THEN THE Field_Filter_Service SHALL 返回应用的有效过滤规则（应用级或继承的管道级）
5. IF 应用被删除 THEN THE Field_Filter_Service SHALL 同时删除关联的过滤规则

### Requirement 6: 网页控制台界面

**User Story:** As a 系统管理员, I want to 通过网页界面管理字段过滤规则, so that 我可以直观地配置和查看过滤设置。

#### Acceptance Criteria

1. WHEN 用户访问管道详情页面 THEN THE Control_Plane SHALL 显示字段过滤配置选项卡
2. WHEN 用户访问应用详情页面 THEN THE Control_Plane SHALL 显示字段过滤配置区域
3. THE Control_Plane SHALL 提供过滤模式选择器（白名单/黑名单单选按钮）
4. THE Control_Plane SHALL 提供字段列表输入组件，支持添加、删除和批量导入字段
5. WHEN 用户保存过滤配置 THEN THE Control_Plane SHALL 显示保存成功或失败的提示信息
6. WHEN 用户修改配置但未保存就离开页面 THEN THE Control_Plane SHALL 显示未保存更改的确认对话框
7. THE Control_Plane SHALL 显示当前生效的过滤规则来源（管道级或应用级）

### Requirement 7: 数据管道过滤集成

**User Story:** As a 数据工程师, I want to 在数据摄入阶段应用过滤规则, so that 不需要的字段不会被存储和处理。

#### Acceptance Criteria

1. WHEN 数据事件到达 Data_Pipeline THEN THE Data_Pipeline SHALL 查询该事件对应应用的有效过滤规则
2. WHEN 过滤规则存在 THEN THE Data_Pipeline SHALL 根据规则过滤事件中的字段
3. WHEN 白名单模式生效 THEN THE Data_Pipeline SHALL 仅保留字段列表中指定的字段（仅保留白名单中实际存在于事件数据中的字段）
4. WHEN 黑名单模式生效 THEN THE Data_Pipeline SHALL 移除字段列表中指定的字段
5. THE Data_Pipeline SHALL 保留系统必需字段（如 event_id、timestamp、app_id）不受过滤规则影响
6. WHEN 过滤规则更新 THEN THE Data_Pipeline SHALL 在下一批次处理时应用新规则
7. IF 过滤规则查询失败 THEN THE Data_Pipeline SHALL 记录错误日志并使用默认行为（不过滤）
8. IF 白名单模式生效且白名单中没有任何字段存在于事件数据中 THEN THE Data_Pipeline SHALL 仅保留系统必需字段

### Requirement 8: 过滤规则数据模型

**User Story:** As a 开发者, I want to 有清晰的数据模型定义, so that 过滤规则可以被正确存储和检索。

#### Acceptance Criteria

1. THE Filter_Rule SHALL 包含以下属性：id、projectId、pipelineId、appId（可选）、filterMode、fields、createAt、updateAt、operator
2. THE Field_Filter_Service SHALL 使用 DynamoDB 存储过滤规则，主键为 id，排序键为 type
3. WHEN 存储过滤规则 THEN THE Field_Filter_Service SHALL 使用 JSON 格式序列化 fields 数组
4. THE Field_Filter_Service SHALL 支持通过 projectId 和 pipelineId 查询过滤规则
5. THE Field_Filter_Service SHALL 支持通过 appId 查询应用级过滤规则

### Requirement 9: 过滤规则验证

**User Story:** As a 系统管理员, I want to 在保存前验证过滤规则, so that 无效配置不会影响数据收集。

#### Acceptance Criteria

1. WHEN 用户提交过滤规则 THEN THE Field_Filter_Service SHALL 验证 filterMode 值为 "whitelist" 或 "blacklist"
2. WHEN 用户提交过滤规则 THEN THE Field_Filter_Service SHALL 验证 fields 数组不超过 500 个元素
3. WHEN 用户提交过滤规则 THEN THE Field_Filter_Service SHALL 验证每个字段名称匹配正则表达式 `^[a-zA-Z_][a-zA-Z0-9_.]*$`
4. IF 验证失败 THEN THE Field_Filter_Service SHALL 返回包含所有验证错误的详细响应
5. WHEN 白名单模式下字段列表为空 THEN THE Field_Filter_Service SHALL 返回警告但允许保存

### Requirement 10: 系统必需字段保护

**User Story:** As a 数据工程师, I want to 确保系统必需字段不被过滤, so that 数据管道和分析功能正常运行。

#### Acceptance Criteria

1. THE Data_Pipeline SHALL 定义系统必需字段列表（包括但不限于：event_id、event_name、event_timestamp、app_id、user_pseudo_id）
2. WHEN 白名单模式生效 THEN THE Data_Pipeline SHALL 自动包含系统必需字段，即使它们不在用户配置的字段列表中
3. WHEN 黑名单模式生效且用户尝试排除系统必需字段 THEN THE Data_Pipeline SHALL 忽略对系统必需字段的排除
4. WHEN 用户在界面配置时选择系统必需字段 THEN THE Control_Plane SHALL 显示提示说明该字段不可被过滤
