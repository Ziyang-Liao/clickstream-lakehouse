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

import express from 'express';
import { param } from 'express-validator';
import { validate } from '../common/request-valid';
import lineageGraph from '../config/lineage-graph.json';

const router_lineage: express.Router = express.Router();

// GET /api/lineage/graph — full table-level DAG
router_lineage.get(
  '/graph',
  async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      res.json({
        success: true,
        data: {
          nodes: lineageGraph.nodes,
          edges: lineageGraph.edges,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/lineage/field/:table/:field — field-level lineage (upstream + downstream)
router_lineage.get(
  '/field/:table/:field',
  validate([
    param('table').isString(),
    param('field').isString(),
  ]),
  async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const key = `${_req.params.table}.${_req.params.field}`;
      const fieldLineage = lineageGraph.fieldLineage[key as keyof typeof lineageGraph.fieldLineage];
      if (!fieldLineage) {
        return res.status(404).json({ success: false, message: 'Field lineage not found' });
      }
      return res.json({ success: true, data: { field: key, ...fieldLineage } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/lineage/impact/:table/:field — impact analysis for a field
router_lineage.get(
  '/impact/:table/:field',
  validate([
    param('table').isString(),
    param('field').isString(),
  ]),
  async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const key = `${_req.params.table}.${_req.params.field}`;
      const impact = lineageGraph.impactAnalysis[key as keyof typeof lineageGraph.impactAnalysis];
      if (!impact) {
        return res.status(404).json({ success: false, message: 'Impact analysis not found' });
      }
      return res.json({ success: true, data: { field: key, ...impact } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/lineage/impact/:table — impact analysis for a table
router_lineage.get(
  '/impact/:table',
  validate([
    param('table').isString(),
  ]),
  async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const tableName = _req.params.table;
      // Aggregate impact across all fields of this table
      const fieldKeys = Object.keys(lineageGraph.impactAnalysis)
        .filter(k => k.startsWith(`${tableName}.`));
      if (fieldKeys.length === 0) {
        return res.status(404).json({ success: false, message: 'Table not found in impact analysis' });
      }
      const jobs = new Set<string>();
      const tables = new Set<string>();
      const views = new Set<string>();
      const reports = new Set<string>();
      for (const key of fieldKeys) {
        const impact = lineageGraph.impactAnalysis[key as keyof typeof lineageGraph.impactAnalysis];
        impact.jobs.forEach((j: string) => jobs.add(j));
        impact.tables.forEach((t: string) => tables.add(t));
        impact.views.forEach((v: string) => views.add(v));
        impact.reports.forEach((r: string) => reports.add(r));
      }
      return res.json({
        success: true,
        data: {
          table: tableName,
          jobs: [...jobs],
          tables: [...tables],
          views: [...views],
          reports: [...reports],
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router_lineage };
