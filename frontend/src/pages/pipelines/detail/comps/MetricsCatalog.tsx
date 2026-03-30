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

import {
  Box,
  Cards,
  Container,
  Header,
  Input,
  Select,
  SpaceBetween,
  Badge,
  ExpandableSection,
  ColumnLayout,
  Link,
} from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMetricsCatalog } from 'apis/metrics';

interface MetricItem {
  id: string;
  name: string;
  nameZh: string;
  category: string;
  description: string;
  descriptionZh: string;
  formula: string;
  sourceJob: string;
  sourceTable: string;
  sourceFields: string[];
  outputField: string;
  schedule: string;
  redshiftView: string | null;
  reportSheet: string | null;
}

interface CategoryItem {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
}

interface TabContentProps {
  pipelineInfo?: IPipeline;
}

const CATEGORY_COLORS: Record<string, 'blue' | 'green' | 'red' | 'grey'> = {
  user_scale: 'blue',
  retention: 'green',
  engagement: 'red',
  event: 'grey',
  page: 'blue',
  device: 'grey',
  geo: 'green',
  acquisition: 'red',
  lifecycle: 'blue',
  user_value: 'green',
};

const MetricsCatalog: React.FC<TabContentProps> = () => {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const [metrics, setMetrics] = useState<MetricItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [filterText, setFilterText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<any>(null);

  useEffect(() => {
    getMetricsCatalog()
      .then((data: any) => {
        if (data.success) {
          setMetrics(data.data.metrics);
          setCategories(data.data.categories);
        }
      })
      .catch(() => { /* no-op */ });
  }, []);

  const filteredMetrics = metrics.filter(m => {
    const matchText = !filterText ||
      m.name.toLowerCase().includes(filterText.toLowerCase()) ||
      m.nameZh.includes(filterText) ||
      m.description.toLowerCase().includes(filterText.toLowerCase());
    const matchCategory = !selectedCategory?.value || m.category === selectedCategory.value;
    return matchText && matchCategory;
  });

  const categoryOptions = [
    { label: isZh ? '全部分类' : 'All Categories', value: '' },
    ...categories.map(c => ({
      label: isZh ? c.nameZh : c.name,
      value: c.id,
    })),
  ];

  return (
    <SpaceBetween direction="vertical" size="l">
      <Container
        header={
          <Header
            variant="h2"
            description={isZh
              ? '系统内置指标的定义、计算口径和数据来源'
              : 'Definitions, formulas, and data sources for built-in metrics'}
            counter={`(${filteredMetrics.length})`}
          >
            {isZh ? '指标目录' : 'Metric Catalog'}
          </Header>
        }
      >
        <SpaceBetween direction="horizontal" size="s">
          <div style={{ width: 300 }}>
            <Input
              placeholder={isZh ? '搜索指标...' : 'Search metrics...'}
              value={filterText}
              onChange={({ detail }) => setFilterText(detail.value)}
              type="search"
            />
          </div>
          <div style={{ width: 200 }}>
            <Select
              selectedOption={selectedCategory || categoryOptions[0]}
              onChange={({ detail }) => setSelectedCategory(detail.selectedOption)}
              options={categoryOptions}
            />
          </div>
        </SpaceBetween>
      </Container>

      <Cards
        cardDefinition={{
          header: (item: MetricItem) => (
            <SpaceBetween direction="horizontal" size="xs">
              <span>{item.name}</span>
              <Badge color={CATEGORY_COLORS[item.category] || 'grey'}>
                {categories.find(c => c.id === item.category)?.[isZh ? 'nameZh' : 'name'] || item.category}
              </Badge>
            </SpaceBetween>
          ),
          sections: [
            {
              id: 'description',
              content: (item: MetricItem) => (
                <Box color="text-body-secondary">
                  {isZh ? item.descriptionZh : item.description}
                </Box>
              ),
            },
            {
              id: 'details',
              content: (item: MetricItem) => (
                <ExpandableSection headerText={isZh ? '详细信息' : 'Details'}>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{isZh ? '计算口径' : 'Formula'}</Box>
                      <Box><code>{item.formula}</code></Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{isZh ? '来源 Job' : 'Source Job'}</Box>
                      <Box>{item.sourceJob}</Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{isZh ? '来源表' : 'Source Table'}</Box>
                      <Box><code>{item.sourceTable}</code></Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{isZh ? '输出字段' : 'Output Field'}</Box>
                      <Box><code>{item.outputField}</code></Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{isZh ? '依赖字段' : 'Source Fields'}</Box>
                      <Box>{item.sourceFields.map(f => <Badge key={f}>{f}</Badge>)}</Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{isZh ? '更新频率' : 'Schedule'}</Box>
                      <Box><code>{item.schedule}</code></Box>
                    </div>
                    {item.redshiftView && (
                      <div>
                        <Box variant="awsui-key-label">{isZh ? 'Redshift 视图' : 'Redshift View'}</Box>
                        <Box><code>{item.redshiftView}</code></Box>
                      </div>
                    )}
                    {item.reportSheet && (
                      <div>
                        <Box variant="awsui-key-label">{isZh ? '关联报表' : 'Report'}</Box>
                        <Box><Link>{item.reportSheet}</Link></Box>
                      </div>
                    )}
                    <div>
                      <Box variant="awsui-key-label">{isZh ? '计算路径' : 'Compute Paths'}</Box>
                      <SpaceBetween direction="vertical" size="xxs">
                        <Box>
                          <Badge color="blue">S3 Tables</Badge>{' '}
                          EMR Serverless (Spark) → S3 Tables (Iceberg) → Athena
                        </Box>
                        {item.redshiftView && (
                          <Box>
                            <Badge color="red">Redshift</Badge>{' '}
                            Redshift SP ({item.redshiftView}) → QuickSight
                          </Box>
                        )}
                      </SpaceBetween>
                    </div>
                  </ColumnLayout>
                </ExpandableSection>
              ),
            },
          ],
        }}
        cardsPerRow={[{ cards: 1 }, { minWidth: 600, cards: 2 }]}
        items={filteredMetrics}
        loadingText="Loading metrics..."
        empty={
          <Box textAlign="center" color="inherit">
            <b>{isZh ? '没有找到指标' : 'No metrics found'}</b>
          </Box>
        }
      />
    </SpaceBetween>
  );
};

export default MetricsCatalog;
