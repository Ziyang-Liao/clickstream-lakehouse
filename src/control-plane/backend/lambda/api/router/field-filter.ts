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
import { body, query } from 'express-validator';
import {
  defaultPageValueValid,
  defaultOrderValueValid,
  isProjectExisted,
  isPipelineExisted,
  isValidEmpty,
  isXSSRequest,
  validate,
} from '../common/request-valid';
import { FieldFilterService } from '../service/field-filter';

const router_field_filter: express.Router = express.Router();
const fieldFilterServ: FieldFilterService = new FieldFilterService();

/**
 * POST /api/filter - Create a new field filter rule
 * Requirements: 1.1
 */
router_field_filter.post(
  '',
  validate([
    body().custom(isValidEmpty).custom(isXSSRequest),
    body('projectId').custom(isProjectExisted),
    body('pipelineId').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'body',
      path: 'projectId',
    })),
    body('filterMode').custom(isValidEmpty),
    body('fields').isArray(),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    return fieldFilterServ.create(req, res, next);
  },
);

/**
 * GET /api/filter - List field filter rules for a pipeline
 * Requirements: 1.2
 */
router_field_filter.get(
  '',
  validate([
    query('projectId').custom(isProjectExisted),
    query('pipelineId').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'query',
      path: 'projectId',
    })),
    query().custom((value, { req }) => defaultPageValueValid(value, {
      req,
      location: 'body',
      path: '',
    }))
      .custom((value, { req }) => defaultOrderValueValid(value, {
        req,
        location: 'body',
        path: '',
      })),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    return fieldFilterServ.listByPipeline(req, res, next);
  },
);

/**
 * GET /api/filter/rule - Get a specific field filter rule
 * Requirements: 1.2
 */
router_field_filter.get(
  '/rule',
  validate([
    query('projectId').custom(isProjectExisted),
    query('pipelineId').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'query',
      path: 'projectId',
    })),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    return fieldFilterServ.get(req, res, next);
  },
);

/**
 * GET /api/filter/effective - Get the effective filter rule for an application
 * Priority: app-level rule > pipeline-level rule
 * Requirements: 5.2, 5.3, 5.4
 */
router_field_filter.get(
  '/effective',
  validate([
    query('projectId').custom(isProjectExisted),
    query('pipelineId').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'query',
      path: 'projectId',
    })),
    query('appId').custom(isValidEmpty),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    return fieldFilterServ.getEffectiveRule(req, res, next);
  },
);

/**
 * PUT /api/filter - Update a field filter rule
 * Requirements: 1.3
 */
router_field_filter.put(
  '',
  validate([
    body().custom(isValidEmpty).custom(isXSSRequest),
    body('projectId').custom(isProjectExisted),
    body('pipelineId').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'body',
      path: 'projectId',
    })),
    body('filterMode').custom(isValidEmpty),
    body('fields').isArray(),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    return fieldFilterServ.update(req, res, next);
  },
);

/**
 * DELETE /api/filter - Delete a field filter rule
 * Requirements: 1.4
 */
router_field_filter.delete(
  '',
  validate([
    query('projectId').custom(isProjectExisted),
    query('pipelineId').custom((value, { req }) => isPipelineExisted(value, {
      req,
      location: 'query',
      path: 'projectId',
    })),
  ]),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    return fieldFilterServ.delete(req, res, next);
  },
);

/**
 * GET /api/filter/available-fields - Get all available fields for filtering
 */
router_field_filter.get(
  '/available-fields',
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    return fieldFilterServ.getAvailableFields(req, res, next);
  },
);

export {
  router_field_filter,
};
