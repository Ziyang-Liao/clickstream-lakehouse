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

/**
 * Event field definition for field filtering feature.
 */
export interface EventField {
  name: string;
  category: string;
  isSystemRequired: boolean;
  displayName: {
    'en-US': string;
    'zh-CN': string;
  };
  description: {
    'en-US': string;
    'zh-CN': string;
  };
}

/**
 * Field categories
 */
export const FIELD_CATEGORIES = {
  EVENT: 'event',
  DEVICE: 'device',
  GEO: 'geo',
  TRAFFIC_SOURCE: 'traffic_source',
  APP_INFO: 'app_info',
  SCREEN_VIEW: 'screen_view',
  PAGE_VIEW: 'page_view',
  SESSION: 'session',
  USER: 'user',
  SDK: 'sdk',
  OTHER: 'other',
} as const;

/**
 * Category display names
 */
export const CATEGORY_DISPLAY_NAMES: Record<string, { 'en-US': string; 'zh-CN': string }> = {
  [FIELD_CATEGORIES.EVENT]: { 'en-US': 'Event', 'zh-CN': '事件' },
  [FIELD_CATEGORIES.DEVICE]: { 'en-US': 'Device', 'zh-CN': '设备' },
  [FIELD_CATEGORIES.GEO]: { 'en-US': 'Geography', 'zh-CN': '地理位置' },
  [FIELD_CATEGORIES.TRAFFIC_SOURCE]: { 'en-US': 'Traffic Source', 'zh-CN': '流量来源' },
  [FIELD_CATEGORIES.APP_INFO]: { 'en-US': 'App Info', 'zh-CN': '应用信息' },
  [FIELD_CATEGORIES.SCREEN_VIEW]: { 'en-US': 'Screen View', 'zh-CN': '屏幕浏览' },
  [FIELD_CATEGORIES.PAGE_VIEW]: { 'en-US': 'Page View', 'zh-CN': '页面浏览' },
  [FIELD_CATEGORIES.SESSION]: { 'en-US': 'Session', 'zh-CN': '会话' },
  [FIELD_CATEGORIES.USER]: { 'en-US': 'User', 'zh-CN': '用户' },
  [FIELD_CATEGORIES.SDK]: { 'en-US': 'SDK', 'zh-CN': 'SDK' },
  [FIELD_CATEGORIES.OTHER]: { 'en-US': 'Other', 'zh-CN': '其他' },
};

/**
 * System required fields that cannot be filtered out.
 */
export const SYSTEM_REQUIRED_FIELDS = [
  'event_id',
  'event_name',
  'event_timestamp',
  'app_id',
  'user_pseudo_id',
  'platform',
];

/**
 * All available event fields for filtering.
 */
export const EVENT_FIELDS: EventField[] = [
  // Event fields (system required)
  {
    name: 'event_id',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: true,
    displayName: { 'en-US': 'Event ID', 'zh-CN': '事件ID' },
    description: { 'en-US': 'Unique identifier for the event', 'zh-CN': '事件的唯一标识符' },
  },
  {
    name: 'event_name',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: true,
    displayName: { 'en-US': 'Event Name', 'zh-CN': '事件名称' },
    description: { 'en-US': 'Name of the event', 'zh-CN': '事件的名称' },
  },
  {
    name: 'event_timestamp',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: true,
    displayName: { 'en-US': 'Event Timestamp', 'zh-CN': '事件时间戳' },
    description: { 'en-US': 'Timestamp when the event occurred', 'zh-CN': '事件发生的时间戳' },
  },
  {
    name: 'app_id',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: true,
    displayName: { 'en-US': 'App ID', 'zh-CN': '应用ID' },
    description: { 'en-US': 'The ID of the application', 'zh-CN': '应用程序的ID' },
  },
  {
    name: 'user_pseudo_id',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: true,
    displayName: { 'en-US': 'User Pseudo ID', 'zh-CN': '用户伪ID' },
    description: { 'en-US': 'Pseudonymous identifier for the user', 'zh-CN': '用户的伪匿名标识符' },
  },
  {
    name: 'platform',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: true,
    displayName: { 'en-US': 'Platform', 'zh-CN': '平台' },
    description: { 'en-US': 'Platform of the event', 'zh-CN': '事件上报的平台' },
  },
  // Event fields (non-required)
  {
    name: 'event_time_msec',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: false,
    displayName: { 'en-US': 'Event Time (msec)', 'zh-CN': '事件时间(毫秒)' },
    description: { 'en-US': 'Event time in milliseconds', 'zh-CN': '事件时间（毫秒）' },
  },
  {
    name: 'event_value',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: false,
    displayName: { 'en-US': 'Event Value', 'zh-CN': '事件值' },
    description: { 'en-US': 'Value associated with the event', 'zh-CN': '与事件关联的值' },
  },
  {
    name: 'event_value_currency',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: false,
    displayName: { 'en-US': 'Event Value Currency', 'zh-CN': '事件值货币' },
    description: { 'en-US': 'Currency of the event value', 'zh-CN': '事件值的货币类型' },
  },
  {
    name: 'event_bundle_sequence_id',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: false,
    displayName: { 'en-US': 'Event Bundle Sequence ID', 'zh-CN': '事件包序列ID' },
    description: { 'en-US': 'Sequence ID of the event bundle', 'zh-CN': '事件包的序列ID' },
  },
  {
    name: 'ingest_time_msec',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: false,
    displayName: { 'en-US': 'Ingest Time (msec)', 'zh-CN': '摄取时间(毫秒)' },
    description: { 'en-US': 'Time when the event was ingested', 'zh-CN': '事件被摄取的时间' },
  },
  {
    name: 'project_id',
    category: FIELD_CATEGORIES.EVENT,
    isSystemRequired: false,
    displayName: { 'en-US': 'Project ID', 'zh-CN': '项目ID' },
    description: { 'en-US': 'Project ID associated with the application', 'zh-CN': '与应用相关联的项目ID' },
  },

  // Device fields
  {
    name: 'device_mobile_brand_name',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Mobile Brand Name', 'zh-CN': '设备品牌名称' },
    description: { 'en-US': 'Device brand name', 'zh-CN': '设备品牌名称' },
  },
  {
    name: 'device_mobile_model_name',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Mobile Model Name', 'zh-CN': '设备型号名称' },
    description: { 'en-US': 'Device model name', 'zh-CN': '设备型号名称' },
  },
  {
    name: 'device_manufacturer',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Device Manufacturer', 'zh-CN': '设备制造商名称' },
    description: { 'en-US': 'Device manufacturer name', 'zh-CN': '设备制造商名称' },
  },
  {
    name: 'device_carrier',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Network Carrier', 'zh-CN': '设备网络提供商名称' },
    description: { 'en-US': 'Device carrier name', 'zh-CN': '设备网络提供商名称' },
  },
  {
    name: 'device_network_type',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Network Type', 'zh-CN': '设备网络类型' },
    description: { 'en-US': 'Device network type', 'zh-CN': '设备的网络类型' },
  },
  {
    name: 'device_operating_system',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Operating System', 'zh-CN': '操作系统' },
    description: { 'en-US': 'Operating system type', 'zh-CN': '操作系统' },
  },
  {
    name: 'device_operating_system_version',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Operating System Version', 'zh-CN': '操作系统版本' },
    description: { 'en-US': 'Operating system version', 'zh-CN': '操作系统的版本' },
  },
  {
    name: 'device_vendor_id',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Device ID', 'zh-CN': '设备ID' },
    description: { 'en-US': 'Device vendor ID (IDFV/AndroidId)', 'zh-CN': '设备供应商ID' },
  },
  {
    name: 'device_advertising_id',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Device Advertising ID', 'zh-CN': '设备广告ID' },
    description: { 'en-US': 'Advertising ID/IDFA', 'zh-CN': '广告ID/IDFA' },
  },
  {
    name: 'device_system_language',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Operating System Language', 'zh-CN': '操作系统语言' },
    description: { 'en-US': 'Operating system language', 'zh-CN': '操作系统的语言' },
  },
  {
    name: 'device_time_zone_offset_seconds',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Timezone Offset', 'zh-CN': '时差' },
    description: { 'en-US': 'Offset from GMT in seconds', 'zh-CN': '与GMT的偏移量（以秒为单位）' },
  },
  {
    name: 'device_ua_browser',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'UserAgent Browser', 'zh-CN': 'UA浏览器' },
    description: { 'en-US': 'Browser derived from User Agent string', 'zh-CN': '从User Agent字符串中派生的浏览器' },
  },
  {
    name: 'device_ua_browser_version',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'UserAgent Browser Version', 'zh-CN': 'UA浏览器版本' },
    description: { 'en-US': 'Browser version derived from User Agent string', 'zh-CN': '从User Agent字符串中派生的浏览器版本' },
  },
  {
    name: 'device_ua_os',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'UserAgent OS', 'zh-CN': 'UA操作系统' },
    description: { 'en-US': 'OS derived from User Agent string', 'zh-CN': '从User Agent字符串中派生的操作系统' },
  },
  {
    name: 'device_ua_os_version',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'UserAgent OS Version', 'zh-CN': 'UA操作系统版本' },
    description: { 'en-US': 'OS version derived from User Agent string', 'zh-CN': '从User Agent字符串中派生的操作系统版本' },
  },
  {
    name: 'device_ua_device',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'UserAgent Device', 'zh-CN': 'UA设备' },
    description: { 'en-US': 'Device derived from User Agent string', 'zh-CN': '从User Agent字符串中派生的设备' },
  },
  {
    name: 'device_ua_device_category',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'UserAgent Device Category', 'zh-CN': 'UA设备类别' },
    description: { 'en-US': 'Device category derived from User Agent string', 'zh-CN': '从User Agent字符串中派生的设备类别' },
  },
  {
    name: 'device_screen_width',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Screen Width', 'zh-CN': '屏幕宽度' },
    description: { 'en-US': 'The screen width', 'zh-CN': '屏幕宽度' },
  },
  {
    name: 'device_screen_height',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Screen Height', 'zh-CN': '屏幕高度' },
    description: { 'en-US': 'The screen height', 'zh-CN': '屏幕高度' },
  },
  {
    name: 'device_viewport_width',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Viewport Width', 'zh-CN': '视区宽度' },
    description: { 'en-US': 'The website viewport width pixel', 'zh-CN': '视区宽度' },
  },
  {
    name: 'device_viewport_height',
    category: FIELD_CATEGORIES.DEVICE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Viewport Height', 'zh-CN': '视区高度' },
    description: { 'en-US': 'The website viewport height pixel', 'zh-CN': '视区高度' },
  },

  // Geo fields
  {
    name: 'geo_continent',
    category: FIELD_CATEGORIES.GEO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Continent', 'zh-CN': '大陆洲名' },
    description: { 'en-US': 'The continent based on IP addresses', 'zh-CN': '基于IP地址的大陆洲名' },
  },
  {
    name: 'geo_sub_continent',
    category: FIELD_CATEGORIES.GEO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Sub Continent', 'zh-CN': '子大陆洲名' },
    description: { 'en-US': 'The sub continent based on IP addresses', 'zh-CN': '基于IP地址的子大陆' },
  },
  {
    name: 'geo_country',
    category: FIELD_CATEGORIES.GEO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Country', 'zh-CN': '国家' },
    description: { 'en-US': 'The country based on IP addresses', 'zh-CN': '基于IP地址的国家' },
  },
  {
    name: 'geo_region',
    category: FIELD_CATEGORIES.GEO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Region', 'zh-CN': '地区' },
    description: { 'en-US': 'The region based on IP addresses', 'zh-CN': '基于IP地址的地区' },
  },
  {
    name: 'geo_metro',
    category: FIELD_CATEGORIES.GEO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Metro', 'zh-CN': '都市区' },
    description: { 'en-US': 'The metro area based on IP addresses', 'zh-CN': '基于IP地址的都市区' },
  },
  {
    name: 'geo_city',
    category: FIELD_CATEGORIES.GEO,
    isSystemRequired: false,
    displayName: { 'en-US': 'City', 'zh-CN': '城市' },
    description: { 'en-US': 'The city based on IP addresses', 'zh-CN': '基于IP地址的城市' },
  },
  {
    name: 'geo_locale',
    category: FIELD_CATEGORIES.GEO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Locale', 'zh-CN': '地理编号' },
    description: { 'en-US': 'The locale based on IP addresses', 'zh-CN': '基于IP地址的地理编号' },
  },

  // Traffic source fields
  {
    name: 'traffic_source_source',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Source', 'zh-CN': '流量来源' },
    description: { 'en-US': 'Name of the network source (Google, Facebook, etc.)', 'zh-CN': '网络来源的名称' },
  },
  {
    name: 'traffic_source_medium',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Source Medium', 'zh-CN': '流量媒介' },
    description: { 'en-US': 'Medium that acquired user (Email, Paid search, etc.)', 'zh-CN': '获取用户的媒介' },
  },
  {
    name: 'traffic_source_campaign',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Source Campaign', 'zh-CN': '活动名称' },
    description: { 'en-US': 'Marketing campaign that acquired user', 'zh-CN': '获取用户的营销活动' },
  },
  {
    name: 'traffic_source_content',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Source Content', 'zh-CN': '活动内容' },
    description: { 'en-US': 'Traffic source campaign content', 'zh-CN': '活动内容' },
  },
  {
    name: 'traffic_source_term',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Source Term', 'zh-CN': '流量来源关键词' },
    description: { 'en-US': 'Traffic source campaign term', 'zh-CN': '流量来源关键词' },
  },
  {
    name: 'traffic_source_campaign_id',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Source Campaign ID', 'zh-CN': '活动编号' },
    description: { 'en-US': 'Traffic source campaign ID', 'zh-CN': '活动编号' },
  },
  {
    name: 'traffic_source_clid_platform',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Click ID Platform', 'zh-CN': '点击ID平台' },
    description: { 'en-US': 'Click ID Platform', 'zh-CN': '点击ID平台' },
  },
  {
    name: 'traffic_source_clid',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Click ID', 'zh-CN': '点击ID' },
    description: { 'en-US': 'Click ID', 'zh-CN': '点击ID' },
  },
  {
    name: 'traffic_source_channel_group',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Channel Group', 'zh-CN': '首次访问安装来源' },
    description: { 'en-US': 'The first-captured channel', 'zh-CN': '第一个捕获的渠道' },
  },
  {
    name: 'traffic_source_category',
    category: FIELD_CATEGORIES.TRAFFIC_SOURCE,
    isSystemRequired: false,
    displayName: { 'en-US': 'Traffic Source Category', 'zh-CN': '流量源类别' },
    description: { 'en-US': 'Traffic source category', 'zh-CN': '流量源类别' },
  },

  // App info fields
  {
    name: 'app_package_id',
    category: FIELD_CATEGORIES.APP_INFO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Package/Bundle ID', 'zh-CN': '软件包名' },
    description: { 'en-US': 'The package name or Bundle ID', 'zh-CN': '应用程序的软件包名称或Bundle ID' },
  },
  {
    name: 'app_version',
    category: FIELD_CATEGORIES.APP_INFO,
    isSystemRequired: false,
    displayName: { 'en-US': 'App Version', 'zh-CN': '应用程序版本' },
    description: { 'en-US': 'Version Name of the application', 'zh-CN': '应用程序的版本号' },
  },
  {
    name: 'app_title',
    category: FIELD_CATEGORIES.APP_INFO,
    isSystemRequired: false,
    displayName: { 'en-US': 'App Title', 'zh-CN': '应用程序名称' },
    description: { 'en-US': 'The Name of the application', 'zh-CN': '应用程序名称' },
  },
  {
    name: 'app_install_source',
    category: FIELD_CATEGORIES.APP_INFO,
    isSystemRequired: false,
    displayName: { 'en-US': 'App Install Source', 'zh-CN': '应用程序安装商店' },
    description: { 'en-US': 'Store where applications are installed', 'zh-CN': '安装应用程序的商店' },
  },
  {
    name: 'app_start_is_first_time',
    category: FIELD_CATEGORIES.APP_INFO,
    isSystemRequired: false,
    displayName: { 'en-US': 'App Start First Time', 'zh-CN': '首次打开应用' },
    description: { 'en-US': 'Is the first time open app', 'zh-CN': '是否是首次打开应用' },
  },
  {
    name: 'app_exception_message',
    category: FIELD_CATEGORIES.APP_INFO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Exception Message', 'zh-CN': '异常消息' },
    description: { 'en-US': 'The message of exception', 'zh-CN': '异常事件发出的消息' },
  },
  {
    name: 'app_exception_stack',
    category: FIELD_CATEGORIES.APP_INFO,
    isSystemRequired: false,
    displayName: { 'en-US': 'Exception Stack', 'zh-CN': '异常堆栈信息' },
    description: { 'en-US': 'The stack details of exception', 'zh-CN': '异常事件捕获的详细堆栈信息' },
  },

  // Screen view fields
  {
    name: 'screen_view_screen_name',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Screen Name', 'zh-CN': '屏幕名称' },
    description: { 'en-US': 'The screen name', 'zh-CN': '屏幕名称' },
  },
  {
    name: 'screen_view_screen_id',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Screen ID', 'zh-CN': '屏幕编号' },
    description: { 'en-US': 'The screen ID', 'zh-CN': '屏幕编号' },
  },
  {
    name: 'screen_view_screen_unique_id',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Screen Unique ID', 'zh-CN': '屏幕唯一ID' },
    description: { 'en-US': 'The unique ID of screen during rendering', 'zh-CN': 'App渲染屏幕时生成唯一ID' },
  },
  {
    name: 'screen_view_previous_screen_name',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Previous Screen Name', 'zh-CN': '上一个屏幕名称' },
    description: { 'en-US': 'The previous screen name', 'zh-CN': '上一个屏幕名称' },
  },
  {
    name: 'screen_view_previous_screen_id',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Previous Screen ID', 'zh-CN': '上一个屏幕编号' },
    description: { 'en-US': 'The previous screen ID', 'zh-CN': '上一个屏幕编号' },
  },
  {
    name: 'screen_view_previous_screen_unique_id',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Previous Screen Unique ID', 'zh-CN': '上一个屏幕唯一ID' },
    description: { 'en-US': 'The unique ID of previous screen', 'zh-CN': 'App渲染上一个屏幕时生成唯一ID' },
  },
  {
    name: 'screen_view_previous_time_msec',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Previous Screen Time (msec)', 'zh-CN': '上一个屏幕时间(毫秒)' },
    description: { 'en-US': 'Previous screen view time in milliseconds', 'zh-CN': '上一个屏幕浏览时间（毫秒）' },
  },
  {
    name: 'screen_view_engagement_time_msec',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Screen Engagement Time (msec)', 'zh-CN': '屏幕参与时间(毫秒)' },
    description: { 'en-US': 'Screen engagement time in milliseconds', 'zh-CN': '屏幕参与时间（毫秒）' },
  },
  {
    name: 'screen_view_entrances',
    category: FIELD_CATEGORIES.SCREEN_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Entry Screen', 'zh-CN': '是否会话进入界面' },
    description: { 'en-US': 'First screen view in session is 1, others 0', 'zh-CN': '会话中的第一个屏幕浏览事件该值为1' },
  },

  // Page view fields
  {
    name: 'page_view_page_referrer',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Page Referrer', 'zh-CN': '前序页面' },
    description: { 'en-US': 'The url of the previous page', 'zh-CN': '前一个页面' },
  },
  {
    name: 'page_view_page_referrer_title',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Page Referrer Title', 'zh-CN': '前序页面标题' },
    description: { 'en-US': 'The title of the previous page', 'zh-CN': '前一个页面标题' },
  },
  {
    name: 'page_view_previous_time_msec',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Previous Page Time (msec)', 'zh-CN': '上一页面时间(毫秒)' },
    description: { 'en-US': 'Previous page view time in milliseconds', 'zh-CN': '上一页面浏览时间（毫秒）' },
  },
  {
    name: 'page_view_engagement_time_msec',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Page Engagement Time (msec)', 'zh-CN': '页面参与时间(毫秒)' },
    description: { 'en-US': 'Page engagement time in milliseconds', 'zh-CN': '页面参与时间（毫秒）' },
  },
  {
    name: 'page_view_page_title',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Page Title', 'zh-CN': '页面标题' },
    description: { 'en-US': 'The page title', 'zh-CN': '页面标题' },
  },
  {
    name: 'page_view_page_url',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Page URL', 'zh-CN': '页面URL' },
    description: { 'en-US': 'The page URL', 'zh-CN': '页面URL' },
  },
  {
    name: 'page_view_page_url_path',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Page URL Path', 'zh-CN': '页面URL路径' },
    description: { 'en-US': 'The page URL path', 'zh-CN': '页面URL路径' },
  },
  {
    name: 'page_view_hostname',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Host Name', 'zh-CN': '网站主机名' },
    description: { 'en-US': 'The website hostname', 'zh-CN': '网站主机名' },
  },
  {
    name: 'page_view_latest_referrer',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Latest Referrer', 'zh-CN': '最近一次站外链接' },
    description: { 'en-US': 'Last off-site link', 'zh-CN': '最近一次站外链接' },
  },
  {
    name: 'page_view_latest_referrer_host',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Latest Referrer Host', 'zh-CN': '最近一次站外链接域名' },
    description: { 'en-US': 'Last off-site domain name', 'zh-CN': '最近一次站外域名' },
  },
  {
    name: 'page_view_entrances',
    category: FIELD_CATEGORIES.PAGE_VIEW,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Entry Page', 'zh-CN': '是否为会话进入页面' },
    description: { 'en-US': 'First page view in session is 1, others 0', 'zh-CN': '会话中的第一个页面浏览事件该值为1' },
  },

  // Session fields
  {
    name: 'session_id',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session ID', 'zh-CN': '会话ID' },
    description: { 'en-US': 'The session ID', 'zh-CN': '会话ID' },
  },
  {
    name: 'session_start_time_msec',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Start Time (msec)', 'zh-CN': '会话开始时间(毫秒)' },
    description: { 'en-US': 'Session start time in milliseconds', 'zh-CN': '会话开始时间（毫秒）' },
  },
  {
    name: 'session_duration',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Duration (msec)', 'zh-CN': '会话时长(毫秒)' },
    description: { 'en-US': 'The session duration in milliseconds', 'zh-CN': '会话持续时间（毫秒）' },
  },
  {
    name: 'session_number',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Number', 'zh-CN': '会话编号' },
    description: { 'en-US': 'The session number', 'zh-CN': '当前用户的会话编号' },
  },
  {
    name: 'session_source',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Source', 'zh-CN': '会话来源' },
    description: { 'en-US': 'Traffic source for the session', 'zh-CN': '会话的流量来源' },
  },
  {
    name: 'session_medium',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Medium', 'zh-CN': '会话媒介' },
    description: { 'en-US': 'Traffic medium for the session', 'zh-CN': '会话的流量媒介' },
  },
  {
    name: 'session_campaign',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Campaign', 'zh-CN': '会话活动' },
    description: { 'en-US': 'Campaign for the session', 'zh-CN': '会话的活动' },
  },
  {
    name: 'session_content',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Content', 'zh-CN': '会话内容' },
    description: { 'en-US': 'Content for the session', 'zh-CN': '会话的内容' },
  },
  {
    name: 'session_term',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Term', 'zh-CN': '会话关键词' },
    description: { 'en-US': 'Term for the session', 'zh-CN': '会话的关键词' },
  },
  {
    name: 'session_campaign_id',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Campaign ID', 'zh-CN': '会话活动ID' },
    description: { 'en-US': 'Campaign ID for the session', 'zh-CN': '会话的活动ID' },
  },
  {
    name: 'session_clid_platform',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Click ID Platform', 'zh-CN': '会话点击ID平台' },
    description: { 'en-US': 'Click ID platform for the session', 'zh-CN': '会话的点击ID平台' },
  },
  {
    name: 'session_clid',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Click ID', 'zh-CN': '会话点击ID' },
    description: { 'en-US': 'Click ID for the session', 'zh-CN': '会话的点击ID' },
  },
  {
    name: 'session_channel_group',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Channel Group', 'zh-CN': '会话渠道组' },
    description: { 'en-US': 'Channel group for the session', 'zh-CN': '会话的渠道组' },
  },
  {
    name: 'session_source_category',
    category: FIELD_CATEGORIES.SESSION,
    isSystemRequired: false,
    displayName: { 'en-US': 'Session Source Category', 'zh-CN': '会话来源类别' },
    description: { 'en-US': 'Source category for the session', 'zh-CN': '会话的来源类别' },
  },

  // User fields
  {
    name: 'user_id',
    category: FIELD_CATEGORIES.USER,
    isSystemRequired: false,
    displayName: { 'en-US': 'User ID', 'zh-CN': '用户ID' },
    description: { 'en-US': 'The unique ID assigned to a user', 'zh-CN': '分配给用户的唯一ID' },
  },
  {
    name: 'user_first_touch_time_msec',
    category: FIELD_CATEGORIES.USER,
    isSystemRequired: false,
    displayName: { 'en-US': 'User First Touch Time (msec)', 'zh-CN': '用户首次触达时间(毫秒)' },
    description: { 'en-US': 'First touch time in milliseconds', 'zh-CN': '用户首次触达时间（毫秒）' },
  },
  {
    name: 'user_engagement_time_msec',
    category: FIELD_CATEGORIES.USER,
    isSystemRequired: false,
    displayName: { 'en-US': 'User Engagement Time (msec)', 'zh-CN': '用户参与时间(毫秒)' },
    description: { 'en-US': 'User engagement time in milliseconds', 'zh-CN': '用户参与时间（毫秒）' },
  },

  // SDK fields
  {
    name: 'sdk_error_code',
    category: FIELD_CATEGORIES.SDK,
    isSystemRequired: false,
    displayName: { 'en-US': 'Data Error Code', 'zh-CN': '数据错误代码' },
    description: { 'en-US': 'Error code when clickstream data is invalid', 'zh-CN': '上报数据时出现错误的代码' },
  },
  {
    name: 'sdk_error_message',
    category: FIELD_CATEGORIES.SDK,
    isSystemRequired: false,
    displayName: { 'en-US': 'Data Error Message', 'zh-CN': '数据错误信息' },
    description: { 'en-US': 'Error message when clickstream data is invalid', 'zh-CN': '上报数据时出现错误的信息' },
  },
  {
    name: 'sdk_version',
    category: FIELD_CATEGORIES.SDK,
    isSystemRequired: false,
    displayName: { 'en-US': 'SDK Version', 'zh-CN': 'SDK版本' },
    description: { 'en-US': 'The version of the SDK', 'zh-CN': 'SDK的版本' },
  },
  {
    name: 'sdk_name',
    category: FIELD_CATEGORIES.SDK,
    isSystemRequired: false,
    displayName: { 'en-US': 'SDK Name', 'zh-CN': 'SDK名称' },
    description: { 'en-US': 'The name of the SDK', 'zh-CN': 'SDK的名称' },
  },

  // Other fields
  {
    name: 'upgrade_previous_app_version',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Upgrade Previous App Version', 'zh-CN': '应用升级前的版本' },
    description: { 'en-US': 'The version before app upgrade', 'zh-CN': '应用升级前的版本' },
  },
  {
    name: 'upgrade_previous_os_version',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Upgrade Previous OS Version', 'zh-CN': '操作系统升级前的版本' },
    description: { 'en-US': 'The version before OS upgrade', 'zh-CN': '操作系统升级前的版本' },
  },
  {
    name: 'search_key',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Search Key', 'zh-CN': '搜索关键词' },
    description: { 'en-US': 'The name of the search keyword', 'zh-CN': '搜索关键词' },
  },
  {
    name: 'search_term',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Search Term', 'zh-CN': '搜索内容' },
    description: { 'en-US': 'The search content', 'zh-CN': '搜索内容' },
  },
  {
    name: 'outbound_link_classes',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Link Class', 'zh-CN': '外链类' },
    description: { 'en-US': 'The content of class in tag <a>', 'zh-CN': '标签<a>中class里的内容' },
  },
  {
    name: 'outbound_link_domain',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Outbound Link Domain', 'zh-CN': '外链域名' },
    description: { 'en-US': 'The domain of the outbound link', 'zh-CN': '外链域名' },
  },
  {
    name: 'outbound_link_id',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Outbound Link ID', 'zh-CN': '外链ID' },
    description: { 'en-US': 'The ID of the outbound link', 'zh-CN': '外链ID' },
  },
  {
    name: 'outbound_link_url',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Outbound Link URL', 'zh-CN': '外链URL' },
    description: { 'en-US': 'The URL of the outbound link', 'zh-CN': '外链URL' },
  },
  {
    name: 'outbound_link',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Outbound Link', 'zh-CN': '是否外链' },
    description: { 'en-US': 'If the domain is not in configured domain list', 'zh-CN': '如果该域不在配置的域名列表中' },
  },
  {
    name: 'scroll_engagement_time_msec',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Scroll Engagement Time (msec)', 'zh-CN': '滚动参与时间(毫秒)' },
    description: { 'en-US': 'Scroll engagement time in milliseconds', 'zh-CN': '滚动参与时间（毫秒）' },
  },
  {
    name: 'custom_parameters_json_str',
    category: FIELD_CATEGORIES.OTHER,
    isSystemRequired: false,
    displayName: { 'en-US': 'Custom Parameters (JSON)', 'zh-CN': '自定义参数(JSON)' },
    description: { 'en-US': 'Custom parameters as JSON string', 'zh-CN': '自定义参数的JSON字符串' },
  },
];

/**
 * Get all available fields.
 */
export function getAvailableFields(): EventField[] {
  return EVENT_FIELDS;
}

/**
 * Get fields grouped by category.
 */
export function getFieldsByCategory(): Record<string, EventField[]> {
  const result: Record<string, EventField[]> = {};
  for (const field of EVENT_FIELDS) {
    if (!result[field.category]) {
      result[field.category] = [];
    }
    result[field.category].push(field);
  }
  return result;
}

/**
 * Get system required field names.
 */
export function getSystemRequiredFieldNames(): string[] {
  return SYSTEM_REQUIRED_FIELDS;
}
