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
import { body, param, query } from 'express-validator';
import { logger } from '../common/powertools';
import {
  isPipelineExisted,
  isProjectExisted,
  isXSSRequest,
  validate,
} from '../common/request-valid';
import { S3TablesModelingService } from '../service/s3tables-modeling';

const router_s3tables_modeling: express.Router = express.Router();
const s3TablesModelingServ: S3TablesModelingService = new S3TablesModelingService();

/**
 * POST /api/pipeline/:id/s3tables-modeling/trigger - Trigger S3 Tables data modeling job
 * Requirements: 7.2, 7.5, 6.6
 */
router_s3tables_modeling.post(
  '/:id/s3tables-modeling/trigger',
  validate([
    body().custom(isXSSRequest),
    param('id').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'query',
      path: 'pid',
    })),
    query('pid').custom(isProjectExisted),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.info('POST /api/pipeline/:id/s3tables-modeling/trigger');
    return s3TablesModelingServ.trigger(req, res, next);
  },
);

/**
 * GET /api/pipeline/:id/s3tables-modeling/status - Get S3 Tables modeling status
 * Requirements: 7.3
 */
router_s3tables_modeling.get(
  '/:id/s3tables-modeling/status',
  validate([
    param('id').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'query',
      path: 'pid',
    })),
    query('pid').custom(isProjectExisted),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.info('GET /api/pipeline/:id/s3tables-modeling/status');
    return s3TablesModelingServ.getStatus(req, res, next);
  },
);

/**
 * GET /api/pipeline/:id/s3tables-modeling/jobs - Get S3 Tables modeling job history
 * Requirements: 7.4
 */
router_s3tables_modeling.get(
  '/:id/s3tables-modeling/jobs',
  validate([
    param('id').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'query',
      path: 'pid',
    })),
    query('pid').custom(isProjectExisted),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.info('GET /api/pipeline/:id/s3tables-modeling/jobs');
    return s3TablesModelingServ.getJobs(req, res, next);
  },
);

export {
  router_s3tables_modeling,
};
