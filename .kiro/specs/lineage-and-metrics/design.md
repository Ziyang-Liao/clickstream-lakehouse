# Clickstream Analytics 增强功能方案 — 数据血缘 & 指标目录

## 一、背景

当前项目已具备完整的数据采集→ETL→建模→分析链路，但缺少两个关键的数据治理能力：
1. 用户无法追踪某个字段从采集到报表的完整流转路径，也无法评估修改某个字段的影响范围
2. 15 个建模 Job 产出了大量指标，但没有统一的指标定义和查询入口

## 二、功能一：数据血缘（含字段级 + 影响分析）

### 2.1 目标

提供三个维度的血缘能力：

1. **表级血缘** — 数据流转 DAG 图（采集→ETL→ODS→建模→报表）
2. **字段级血缘** — 点击任意字段，展示其上下游依赖链
3. **影响分析** — 选中一个字段/表，展示它影响了哪些下游 Job、建模表、报表

### 2.2 完整数据链路

```
Layer 1: 采集层 (SDK)
  Web/Android/iOS/Flutter SDK → HTTP POST /collect
  字段: event_name, event_timestamp, user_pseudo_id, device_*, geo_*, ...
                  ↓
Layer 2: 接入层 (Ingestion)
  ECS ALB → S3 Buffer (raw JSON)
                  ↓
Layer 3: ETL 层 (EMR Spark)
  ├── TransformerV3    → 清洗 + 格式转换 (148 个字段)
  ├── UAEnrichmentV2   → 新增: device_ua_browser, device_ua_os, device_ua_device, device_ua_device_category
  └── IPEnrichmentV2   → 新增: geo_country, geo_city, geo_region, geo_continent, geo_sub_continent
                  ↓
Layer 4: ODS 层 (Glue Catalog / S3)
  ├── event_v2   (148 字段: event_*, device_*, geo_*, traffic_*, user_*, session_*, page_view_*, screen_view_*, ...)
  ├── user_v2    (用户属性: user_pseudo_id, user_id, first_touch_time_msec, first_visit_date, ...)
  ├── session    (会话: session_id, session_duration, session_start_time, ...)
  └── item_v2    (物品: item_id, name, brand, price, category, ...)
                  ↓
Layer 5: 建模层 (S3 Tables / Redshift)
  15 个 Spark Job + 40 个 Redshift 视图/存储过程
                  ↓
Layer 6: 消费层
  ├── Athena 即席查询
  ├── QuickSight 报表 (20+ Dashboard Sheets)
  └── API 查询
```

### 2.3 字段级血缘映射（核心）

以下是 ODS 字段 → 建模 Job → 建模表 → Redshift 视图 → QuickSight 报表的完整映射：

#### 2.3.1 event_timestamp (事件时间戳)

```
SDK 上报 → TransformerV3 解析 → event_v2.event_timestamp
  ├── ActiveUserJob        → dau.event_date (截断为日期)
  ├── RetentionAnalysisJob → retention_daily.event_date, retention_daily.cohort_date
  ├── SessionAnalysisJob   → session_analysis.session_start_time, session_analysis.session_end_time
  ├── EventAggregationJob  → event_daily_summary.event_date, event_daily_summary.event_hour
  ├── LifecycleJob         → lifecycle_weekly.time_period_week
  ├── ... (所有 15 个 Job 都依赖此字段)
  └── Redshift 视图:
      ├── clickstream_retention_dau_wau_sp → QuickSight: Retention Dashboard
      ├── clickstream_event_base_view_sp   → QuickSight: Event Dashboard
      └── clickstream_engagement_kpi_sp    → QuickSight: Engagement Dashboard
```

#### 2.3.2 user_pseudo_id (用户匿名 ID)

```
SDK 自动生成 → TransformerV3 → event_v2.user_pseudo_id
  ├── ActiveUserJob        → dau.dau/wau/mau (COUNT DISTINCT)
  ├── NewReturnUserJob     → new_return_user.user_type (判断新/老)
  ├── RetentionAnalysisJob → retention_daily.retained_users (留存计算)
  ├── UserBehaviorJob      → user_behavior.total_events/total_sessions/ltv
  ├── GeoUserJob           → geo_user.user_count
  ├── UserAcquisitionJob   → user_acquisition.new_user_count
  ├── EngagementKpiJob     → engagement_kpi.total_users
  └── Redshift 视图:
      ├── clickstream_retention_dau_wau_sp      → QuickSight: DAU/WAU/MAU
      ├── clickstream_acquisition_country_new_user_sp → QuickSight: Acquisition
      └── clickstream_lifecycle_weekly_view_sp   → QuickSight: Lifecycle
```

#### 2.3.3 device_* (设备字段组)

```
SDK 采集 device_info → TransformerV3 解析
  → UAEnrichmentV2 增强: device_ua_browser, device_ua_os, device_ua_device, device_ua_device_category
  → event_v2.device_*
    ├── DeviceJob → device 表 (按设备型号/OS/浏览器聚合)
    │   └── Redshift: clickstream_device_user_device_sp → QuickSight: Device Dashboard
    └── CrashRateJob → crash_rate 表 (按 app_version 聚合崩溃率)
        └── Redshift: clickstream_device_crash_rate_sp → QuickSight: Crash Rate
```

#### 2.3.4 geo_* (地理字段组)

```
SDK 采集 IP → IPEnrichmentV2 解析
  → event_v2.geo_country, geo_city, geo_region, geo_continent
    ├── GeoUserJob → geo_user 表 (按国家/城市聚合用户数)
    │   └── Redshift: clickstream_acquisition_country_new_user_sp → QuickSight: Geo Dashboard
    └── EventAggregationJob → event_daily_summary.geo_country (事件按国家聚合)
```

#### 2.3.5 traffic_source_* (流量来源字段组)

```
SDK 采集 UTM 参数 → TransformerV3 解析
  → event_v2.traffic_source_source, traffic_source_medium, traffic_source_campaign, traffic_source_channel_group
    └── UserAcquisitionJob → user_acquisition 表
        ├── 聚合维度: first_traffic_source, first_traffic_medium, first_traffic_campaign, first_traffic_channel_group
        └── Redshift: clickstream_acquisition_day_traffic_source_user_sp → QuickSight: Traffic Source Dashboard
```

#### 2.3.6 session_id (会话 ID)

```
SDK 自动生成 → TransformerV3 → event_v2.session_id
  ├── SessionAnalysisJob   → session_analysis (会话时长/跳出率/参与度)
  │   └── Redshift: clickstream_engagement_kpi_sp → QuickSight: Engagement KPI
  ├── EngagementKpiJob     → engagement_kpi.engaged_sessions (参与会话数)
  ├── UserAcquisitionJob   → user_acquisition.session_count (渠道会话数)
  └── UserBehaviorJob      → user_behavior.total_sessions (用户累计会话)
```

#### 2.3.7 event_name (事件名称)

```
SDK 上报 → TransformerV3 → event_v2.event_name
  ├── EventNameJob         → event_name 表 (事件名分布)
  │   └── Redshift: clickstream_engagement_event_name_sp → QuickSight: Event Name
  ├── CrashRateJob         → 过滤 event_name = '_app_exception'
  ├── NewReturnUserJob     → 过滤 event_name = '_first_open'
  ├── GeoUserJob           → 过滤 event_name = '_first_open'
  ├── LifecycleJob         → 过滤 event_name = '_session_start'
  ├── PageScreenViewJob    → 过滤 event_name IN ('_page_view', '_screen_view')
  ├── EntranceExitJob      → 过滤 event_name IN ('_page_view', '_screen_view')
  └── EngagementKpiJob     → 过滤 event_name IN ('_page_view', '_screen_view')
```

#### 2.3.8 page_view_* / screen_view_* (页面/屏幕字段组)

```
SDK 采集页面信息 → TransformerV3 → event_v2.page_view_page_url_path, page_view_page_title, screen_view_screen_name, screen_view_screen_id
  ├── PageScreenViewJob → page_screen_view 表
  │   └── Redshift: clickstream_engagement_page_screen_view_sp → QuickSight: Page/Screen View
  └── EntranceExitJob   → entrance / exit 表
      ├── Redshift: clickstream_engagement_entrance_sp → QuickSight: Entrance Pages
      └── Redshift: clickstream_engagement_exit_sp     → QuickSight: Exit Pages
```

### 2.4 影响分析矩阵

当某个 ODS 字段发生变更时，影响范围：

| ODS 字段 | 影响的 Job 数 | 影响的建模表 | 影响的 Redshift 视图 | 影响的报表 |
|----------|-------------|------------|-------------------|----------|
| event_timestamp | 15 | 全部 16 张表 | 40 个视图 | 全部报表 |
| user_pseudo_id | 12 | 14 张表 | 35 个视图 | 几乎全部 |
| event_name | 8 | 10 张表 | 20 个视图 | Event/Engagement/Lifecycle |
| session_id | 4 | 4 张表 | 8 个视图 | Engagement/Acquisition |
| device_* (6 字段) | 2 | 2 张表 | 4 个视图 | Device/Crash |
| geo_* (5 字段) | 2 | 2 张表 | 3 个视图 | Geo/Acquisition |
| traffic_source_* (4 字段) | 1 | 1 张表 | 3 个视图 | Traffic Source |
| page_view_* (3 字段) | 2 | 3 张表 | 6 个视图 | Page View/Entrance/Exit |
| event_value | 2 | 2 张表 | 2 个视图 | Event Name/User Behavior |
| first_touch_time_msec | 2 | 2 张表 | 3 个视图 | Retention/New User |

### 2.5 技术方案

**数据模型：** 血缘关系存储在静态 JSON 配置中（`lineage-graph.json`），包含三层结构：

```json
{
  "tables": {
    "event_v2": {
      "layer": "ods",
      "fields": ["event_timestamp", "event_name", "user_pseudo_id", ...]
    },
    "dau": {
      "layer": "modeling",
      "fields": ["event_date", "platform", "dau", "wau", "mau"],
      "sourceJob": "ActiveUserJob"
    }
  },
  "fieldLineage": {
    "event_v2.event_timestamp": {
      "upstream": [{"table": "sdk_raw", "field": "event_timestamp", "transform": "TransformerV3"}],
      "downstream": [
        {"table": "dau", "field": "event_date", "transform": "ActiveUserJob", "logic": "DATE(event_timestamp)"},
        {"table": "retention_daily", "field": "cohort_date", "transform": "RetentionAnalysisJob"},
        {"table": "event_daily_summary", "field": "event_date", "transform": "EventAggregationJob"},
        {"table": "event_daily_summary", "field": "event_hour", "transform": "EventAggregationJob", "logic": "HOUR(event_timestamp)"}
      ]
    },
    "dau.dau": {
      "upstream": [{"table": "event_v2", "field": "user_pseudo_id", "transform": "ActiveUserJob", "logic": "COUNT(DISTINCT user_pseudo_id) WHERE date = today"}],
      "downstream": [
        {"view": "clickstream_retention_dau_wau_sp", "report": "Retention Dashboard"}
      ]
    }
  },
  "impactAnalysis": {
    "event_v2.user_pseudo_id": {
      "jobs": ["ActiveUserJob", "NewReturnUserJob", "RetentionAnalysisJob", "UserBehaviorJob", "GeoUserJob", "UserAcquisitionJob", "EngagementKpiJob", ...],
      "tables": ["dau", "new_return_user", "retention_daily", "user_behavior", "geo_user", "user_acquisition", "engagement_kpi", ...],
      "views": ["clickstream_retention_dau_wau_sp", "clickstream_acquisition_country_new_user_sp", ...],
      "reports": ["Retention Dashboard", "Acquisition Dashboard", "Lifecycle Dashboard", ...]
    }
  }
}
```

**API 端点：**

```
GET /api/lineage/graph                              — 完整血缘 DAG（表级）
GET /api/lineage/field/{table}/{field}              — 字段级血缘（上下游链）
GET /api/lineage/impact/{table}/{field}             — 影响分析（下游 Job/表/视图/报表）
GET /api/lineage/impact/{table}                     — 表级影响分析
```

**前端页面：**

1. **血缘总览页** — Pipeline 详情中的 "Data Lineage" Tab
   - 6 层 DAG 图，节点可展开查看字段列表
   - 点击节点高亮上下游路径

2. **字段血缘详情** — 点击任意字段弹出侧边栏
   - 上游：这个字段从哪里来，经过了什么转换
   - 下游：这个字段流向了哪些表/字段，计算逻辑是什么

3. **影响分析面板** — 选中字段后点击 "Impact Analysis"
   - 树形展示：字段 → 影响的 Job → 影响的建模表 → 影响的视图 → 影响的报表
   - 标注影响级别：直接依赖 / 间接依赖

**涉及文件：**
- `src/control-plane/backend/lambda/api/config/lineage-graph.json` — 血缘定义
- `src/control-plane/backend/lambda/api/router/lineage.ts` — API 路由
- `src/control-plane/backend/lambda/api/service/lineage.ts` — 血缘查询逻辑
- `frontend/src/pages/pipelines/detail/tabs/Lineage.tsx` — 血缘 DAG 页面
- `frontend/src/pages/pipelines/detail/tabs/FieldLineage.tsx` — 字段血缘侧边栏
- `frontend/src/pages/pipelines/detail/tabs/ImpactAnalysis.tsx` — 影响分析面板

### 2.6 不做什么

- 不做动态血缘解析（不在运行时解析 SQL/Spark 代码），血缘关系是预定义的
- 不引入外部血缘系统（OpenLineage / DataHub / Atlas）
- 不做血缘变更通知（字段变更时自动告警）

---

## 三、功能二：指标目录 (Metric Catalog)

### 3.1 指标清单（23 个核心指标）

| 分类 | 指标名 | 来源 Job | 来源表 | 口径 | 依赖字段 |
|------|--------|----------|--------|------|---------|
| **用户规模** | DAU | ActiveUserJob | dau | 当日 COUNT(DISTINCT user_pseudo_id) | event_timestamp, user_pseudo_id, platform, app_id |
| | WAU | ActiveUserJob | dau | 当周 COUNT(DISTINCT user_pseudo_id) | event_timestamp, user_pseudo_id, platform, app_id |
| | MAU | ActiveUserJob | dau | 当月 COUNT(DISTINCT user_pseudo_id) | event_timestamp, user_pseudo_id, platform, app_id |
| | 新用户数 | NewReturnUserJob | new_return_user | event_name='_first_open' 的 DISTINCT user_pseudo_id | event_name, user_pseudo_id, first_touch_time_msec |
| | 回访用户数 | NewReturnUserJob | new_return_user | 非首次访问的 DISTINCT user_pseudo_id | event_name, user_pseudo_id, first_touch_time_msec |
| **留存** | 日留存率 | RetentionAnalysisJob | retention_daily | 第 N 日回访用户 / 同期新增用户 | event_timestamp, user_pseudo_id, first_touch_time_msec |
| | 周留存率 | RetentionAnalysisJob | retention_weekly | 第 N 周回访用户 / 同期新增用户 | event_timestamp, user_pseudo_id, first_touch_time_msec |
| **参与度** | 平均会话时长(秒) | EngagementKpiJob | engagement_kpi | SUM(session_duration) / COUNT(engaged_sessions) | session_id, user_engagement_time_msec, event_name |
| | 人均参与会话数 | EngagementKpiJob | engagement_kpi | COUNT(engaged_sessions) / COUNT(DISTINCT user_pseudo_id) | session_id, user_pseudo_id, event_name |
| | 人均参与时长(秒) | EngagementKpiJob | engagement_kpi | SUM(engagement_time) / COUNT(DISTINCT user_pseudo_id) | user_engagement_time_msec, user_pseudo_id |
| | 跳出率 | SessionAnalysisJob | session_analysis | COUNT(bounce_sessions) / COUNT(total_sessions) | session_id, event_name, event_timestamp |
| **事件** | 日事件总量 | EventAggregationJob | event_daily_summary | COUNT(event_id) GROUP BY event_date | event_id, event_timestamp, event_name |
| | 小时事件量 | EventAggregationJob | event_hourly_summary | COUNT(event_id) GROUP BY event_hour | event_id, event_timestamp |
| | 事件名分布 | EventNameJob | event_name | COUNT(event_id) GROUP BY event_name | event_id, event_name, event_value |
| **页面** | 页面浏览量 | PageScreenViewJob | page_screen_view | COUNT(event_id) WHERE event_name='_page_view' | event_name, page_view_page_url_path, page_view_page_title |
| | 入口页 Top N | EntranceExitJob | entrance | 会话首个 _page_view 的 page_url_path 聚合 | session_id, event_name, page_view_page_url_path, page_view_entrances |
| | 退出页 Top N | EntranceExitJob | exit | 会话最后一个 _page_view 的 page_url_path 聚合 | session_id, event_name, page_view_page_url_path |
| **设备** | 设备分布 | DeviceJob | device | COUNT(event_id) GROUP BY device_model/os/browser | device_mobile_model_name, device_operating_system, device_ua_browser |
| | 崩溃率 | CrashRateJob | crash_rate | COUNT(DISTINCT crashed_users) / COUNT(DISTINCT all_users) | event_name('_app_exception'), user_pseudo_id, app_version |
| **地理** | 地区用户分布 | GeoUserJob | geo_user | COUNT(DISTINCT user_pseudo_id) GROUP BY country/city | geo_country, geo_city, user_pseudo_id, event_name |
| **获客** | 渠道新用户数 | UserAcquisitionJob | user_acquisition | COUNT(DISTINCT new_users) GROUP BY traffic_source | traffic_source_source, traffic_source_medium, first_traffic_*, user_pseudo_id |
| **生命周期** | 周生命周期分布 | LifecycleJob | lifecycle_weekly | 按周分类: 新增/活跃/回流/沉默 | event_name('_session_start'), user_pseudo_id, event_timestamp |
| **用户价值** | LTV | UserBehaviorJob | user_behavior | SUM(event_value) per user | event_value, user_pseudo_id |
| | 人均事件数 | UserBehaviorJob | user_behavior | COUNT(events) per user | event_id, user_pseudo_id |

### 3.2 指标与报表的关联

| 指标 | QuickSight 报表 Sheet | Redshift 视图 |
|------|---------------------|--------------|
| DAU/WAU/MAU | Retention Dashboard | clickstream_retention_dau_wau_sp |
| 新用户/回访用户 | Acquisition Dashboard | clickstream_acquisition_country_new_user_sp |
| 日/周留存率 | Retention Dashboard | clickstream_retention_view_sp |
| 会话时长/参与度 | Engagement Dashboard | clickstream_engagement_kpi_sp |
| 日事件量 | Event Dashboard | clickstream_engagement_day_event_view_sp |
| 页面浏览量 | Page View Dashboard | clickstream_engagement_page_screen_view_sp |
| 入口/退出页 | Entrance/Exit Dashboard | clickstream_engagement_entrance_sp / exit_sp |
| 设备分布 | Device Dashboard | clickstream_device_user_device_sp |
| 崩溃率 | Crash Dashboard | clickstream_device_crash_rate_sp |
| 地区分布 | Geo Dashboard | clickstream_acquisition_country_new_user_sp |
| 渠道获客 | Traffic Source Dashboard | clickstream_acquisition_day_traffic_source_user_sp |
| 生命周期 | Lifecycle Dashboard | clickstream_lifecycle_weekly_view_sp |

### 3.3 技术方案

同设计文档 v1，不再重复。

---

## 四、实现计划

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| P0 | 指标目录 JSON + API + 前端页面 | metrics-catalog.json, API, MetricsCatalog.tsx |
| P1 | 表级血缘 DAG + 字段列表展开 | lineage-graph.json, API, Lineage.tsx |
| P2 | 字段级血缘详情 + 影响分析面板 | FieldLineage.tsx, ImpactAnalysis.tsx |

---

## 五、不建议加入的功能

| 功能 | 理由 |
|------|------|
| A/B Test | 独立产品级能力，需要实验分配引擎、统计显著性计算，偏离项目定位 |
| 数据地图 | 与血缘重叠，单独做需要引入元数据管理系统（DataHub/Atlas），过重 |
| 数据质量监控 | 需要独立的 DQ 引擎（Great Expectations / Deequ），可作为未来独立模块 |
| 实时指标计算 | 需要 Flink/KDA 流处理引擎，架构变动大 |
| 动态血缘解析 | 运行时解析 SQL/Spark 代码提取血缘，复杂度极高，静态预定义已满足需求 |
