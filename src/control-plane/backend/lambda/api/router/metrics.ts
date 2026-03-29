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
import { param, query } from 'express-validator';
import { validate } from '../common/request-valid';
import metricsCatalog from '../config/metrics-catalog.json';

const router_metrics: express.Router = express.Router();

// GET /api/metrics/catalog — list all metrics, optionally filter by category
router_metrics.get(
  '/catalog',
  validate([
    query('category').optional().isString(),
  ]),
  async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const category = _req.query.category as string | undefined;
      let metrics = metricsCatalog.metrics;
      if (category) {
        metrics = metrics.filter(m => m.category === category);
      }
      res.json({
        success: true,
        data: {
          categories: metricsCatalog.categories,
          metrics,
          total: metrics.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/metrics/catalog/:metricId — get single metric detail
router_metrics.get(
  '/catalog/:metricId',
  validate([
    param('metricId').isString(),
  ]),
  async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const metric = metricsCatalog.metrics.find(m => m.id === _req.params.metricId);
      if (!metric) {
        return res.status(404).json({ success: false, message: 'Metric not found' });
      }
      return res.json({ success: true, data: metric });
    } catch (err) {
      next(err);
    }
  },
);

export { router_metrics };
