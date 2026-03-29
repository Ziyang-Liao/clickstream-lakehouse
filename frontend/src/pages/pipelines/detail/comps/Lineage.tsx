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
  Container,
  Header,
  SpaceBetween,
  Table,
  Badge,
  SplitPanel,
  ColumnLayout,
  StatusIndicator,
} from '@cloudscape-design/components';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getLineageGraph, getFieldLineage, getFieldImpact } from 'apis/lineage';

interface LineageNode {
  id: string;
  name: string;
  layer: string;
  type: string;
  fields?: string[];
  job?: string;
}

interface LineageEdge {
  source: string;
  target: string;
}

interface FieldLineageItem {
  table: string;
  field: string;
  transform: string;
  logic?: string;
}

interface ImpactData {
  jobs: string[];
  tables: string[];
  views: string[];
  reports: string[];
}

interface TabContentProps {
  pipelineInfo?: IPipeline;
}

const LAYER_ORDER = ['collection', 'ingestion', 'etl', 'ods', 'modeling', 'consumption'];
const LAYER_LABELS: Record<string, { en: string; zh: string; color: 'blue' | 'grey' | 'green' | 'red' }> = {
  collection: { en: 'Collection', zh: '采集层', color: 'blue' },
  ingestion: { en: 'Ingestion', zh: '接入层', color: 'green' },
  etl: { en: 'ETL', zh: 'ETL 层', color: 'grey' },
  ods: { en: 'ODS', zh: 'ODS 层', color: 'red' },
  modeling: { en: 'Modeling', zh: '建模层', color: 'blue' },
  consumption: { en: 'Consumption', zh: '消费层', color: 'green' },
};

const Lineage: React.FC<TabContentProps> = () => {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const [nodes, setNodes] = useState<LineageNode[]>([]);
  const [edges, setEdges] = useState<LineageEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [fieldLineage, setFieldLineage] = useState<any>(null);
  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);

  useEffect(() => {
    getLineageGraph()
      .then((data: any) => {
        if (data.success) {
          setNodes(data.data.nodes);
          setEdges(data.data.edges);
        }
      })
      .catch(() => {});
  }, []);

  const handleFieldClick = useCallback((table: string, field: string) => {
    setSelectedField(`${table}.${field}`);
    setSplitOpen(true);
    Promise.all([
      getFieldLineage(table, field),
      getFieldImpact(table, field),
    ]).then(([lineageRes, impactRes]: any[]) => {
      if (lineageRes.success) setFieldLineage(lineageRes.data);
      if (impactRes.success) setImpact(impactRes.data);
    }).catch(() => {});
  }, []);

  const nodesByLayer = LAYER_ORDER.map(layer => ({
    layer,
    label: LAYER_LABELS[layer],
    nodes: nodes.filter(n => n.layer === layer),
  }));

  return (
    <SpaceBetween direction="vertical" size="l">
      <Container
        header={
          <Header variant="h2" description={isZh
            ? '数据从采集到报表的完整流转路径，点击表节点查看字段级血缘'
            : 'Full data flow from collection to reports. Click a table node to explore field-level lineage.'}>
            {isZh ? '数据血缘' : 'Data Lineage'}
          </Header>
        }
      >
        {/* DAG visualization as layered table */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 16, minWidth: 1200, padding: '16px 0' }}>
            {nodesByLayer.map(({ layer, label, nodes: layerNodes }) => (
              <div key={layer} style={{ flex: 1, minWidth: 180 }}>
                <Box textAlign="center" margin={{ bottom: 's' }}>
                  <Badge color={label.color}>{isZh ? label.zh : label.en}</Badge>
                </Box>
                <SpaceBetween direction="vertical" size="xs">
                  {layerNodes.map(node => (
                    <div
                      key={node.id}
                      onClick={() => {
                        setSelectedNode(node);
                        if (node.fields) setSplitOpen(true);
                      }}
                      style={{
                        padding: '8px 12px',
                        border: `2px solid ${selectedNode?.id === node.id ? '#0972d3' : '#e0e0e0'}`,
                        borderRadius: 8,
                        cursor: node.fields ? 'pointer' : 'default',
                        background: selectedNode?.id === node.id ? '#f0f8ff' : '#fff',
                        fontSize: 13,
                      }}
                    >
                      <Box fontWeight="bold">{node.name}</Box>
                      {node.job && <Box color="text-body-secondary" fontSize="body-s">{node.job}</Box>}
                      {node.fields && (
                        <Box color="text-body-secondary" fontSize="body-s">
                          {node.fields.length} {isZh ? '个字段' : 'fields'} →
                        </Box>
                      )}
                    </div>
                  ))}
                </SpaceBetween>
              </div>
            ))}
          </div>
        </div>
      </Container>

      {/* Field list for selected table node */}
      {selectedNode?.fields && (
        <Container header={<Header variant="h3">{selectedNode.name} — {isZh ? '字段列表' : 'Fields'}</Header>}>
          <Table
            columnDefinitions={[
              {
                id: 'field',
                header: isZh ? '字段名' : 'Field Name',
                cell: (item: string) => (
                  <Box>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); handleFieldClick(selectedNode.name, item); }}
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      <code>{item}</code>
                    </a>
                  </Box>
                ),
              },
            ]}
            items={selectedNode.fields}
            variant="embedded"
            stickyHeader
          />
        </Container>
      )}

      {/* Field lineage + impact split panel */}
      {splitOpen && selectedField && (
        <Container header={<Header variant="h3">{isZh ? '字段血缘' : 'Field Lineage'}: <code>{selectedField}</code></Header>}>
          <SpaceBetween direction="vertical" size="l">
            {/* Upstream */}
            {fieldLineage?.upstream && (
              <div>
                <Box variant="h4">{isZh ? '上游来源' : 'Upstream'}</Box>
                <Table
                  columnDefinitions={[
                    { id: 'table', header: isZh ? '来源表' : 'Source', cell: (i: FieldLineageItem) => <code>{i.table}</code> },
                    { id: 'field', header: isZh ? '来源字段' : 'Field', cell: (i: FieldLineageItem) => <code>{i.field}</code> },
                    { id: 'transform', header: isZh ? '转换' : 'Transform', cell: (i: FieldLineageItem) => <Badge>{i.transform}</Badge> },
                    { id: 'logic', header: isZh ? '逻辑' : 'Logic', cell: (i: FieldLineageItem) => i.logic || '-' },
                  ]}
                  items={fieldLineage.upstream}
                  variant="embedded"
                />
              </div>
            )}

            {/* Downstream */}
            {fieldLineage?.downstream && (
              <div>
                <Box variant="h4">{isZh ? '下游去向' : 'Downstream'}</Box>
                <Table
                  columnDefinitions={[
                    { id: 'table', header: isZh ? '目标表' : 'Target', cell: (i: FieldLineageItem) => <code>{i.table}</code> },
                    { id: 'field', header: isZh ? '目标字段' : 'Field', cell: (i: FieldLineageItem) => <code>{i.field}</code> },
                    { id: 'transform', header: isZh ? 'Job' : 'Job', cell: (i: FieldLineageItem) => <Badge>{i.transform}</Badge> },
                    { id: 'logic', header: isZh ? '计算逻辑' : 'Logic', cell: (i: FieldLineageItem) => i.logic ? <code>{i.logic}</code> : '-' },
                  ]}
                  items={fieldLineage.downstream}
                  variant="embedded"
                />
              </div>
            )}

            {/* Impact Analysis */}
            {impact && (
              <div>
                <Box variant="h4">{isZh ? '影响分析' : 'Impact Analysis'}</Box>
                <SpaceBetween direction="vertical" size="m">
                  {/* S3 Tables Path */}
                  <Container header={<Header variant="h4">
                    <Badge color="blue">S3 Tables</Badge> {isZh ? '路径 (EMR Serverless + Iceberg)' : 'Path (EMR Serverless + Iceberg)'}
                  </Header>}>
                    <ColumnLayout columns={2} variant="text-grid">
                      <div>
                        <Box variant="awsui-key-label">{isZh ? '影响的 Spark Job' : 'Affected Spark Jobs'} ({impact.jobs.length})</Box>
                        {impact.jobs.map((j: string) => <div key={j}><StatusIndicator type="info">{j}</StatusIndicator></div>)}
                      </div>
                      <div>
                        <Box variant="awsui-key-label">{isZh ? '影响的 Iceberg 表' : 'Affected Iceberg Tables'} ({impact.tables.length})</Box>
                        {impact.tables.map((t: string) => <div key={t}><code>{t}</code></div>)}
                      </div>
                    </ColumnLayout>
                    <Box margin={{ top: 's' }} color="text-body-secondary">
                      {isZh ? '消费方式: Athena 即席查询' : 'Consumption: Athena ad-hoc query'}
                    </Box>
                  </Container>

                  {/* Redshift Path */}
                  <Container header={<Header variant="h4">
                    <Badge color="red">Redshift</Badge> {isZh ? '路径 (Redshift Serverless + QuickSight)' : 'Path (Redshift Serverless + QuickSight)'}
                  </Header>}>
                    <ColumnLayout columns={2} variant="text-grid">
                      <div>
                        <Box variant="awsui-key-label">{isZh ? '影响的存储过程/视图' : 'Affected Views/SPs'} ({impact.views.length})</Box>
                        {impact.views.map((v: string) => <div key={v}><code style={{ fontSize: 11 }}>{v}</code></div>)}
                      </div>
                      <div>
                        <Box variant="awsui-key-label">{isZh ? '影响的 QuickSight 报表' : 'Affected QuickSight Reports'} ({impact.reports.length})</Box>
                        {impact.reports.map((r: string) => <div key={r}><StatusIndicator type="warning">{r}</StatusIndicator></div>)}
                      </div>
                    </ColumnLayout>
                    <Box margin={{ top: 's' }} color="text-body-secondary">
                      {isZh ? '消费方式: QuickSight Dashboard' : 'Consumption: QuickSight Dashboard'}
                    </Box>
                  </Container>
                </SpaceBetween>
              </div>
            )}
          </SpaceBetween>
        </Container>
      )}
    </SpaceBetween>
  );
};

export default Lineage;
