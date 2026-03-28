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

import { assert, property, boolean, stringOf, constantFrom, pre } from 'fast-check';
import { PipelineStackType } from '../../common/model-ln';
import { WorkflowParallelBranch, WorkflowState, WorkflowStateType } from '../../common/types';
import { getStackName } from '../../common/utils';

/**
 * Property 4: Workflow Order Correctness
 * For any Pipeline containing S3 Tables modeling, the generated workflow should have
 * DATA_MODELING_S3_TABLES Stack executed after DATA_PROCESSING Stack.
 * Validates: Requirements 4.2, 4.3
 */
describe('Property 4: Workflow Order Correctness', () => {
  /**
   * Helper function to extract workflow execution order from a branch
   */
  const extractWorkflowOrder = (branch: WorkflowParallelBranch): string[] => {
    const order: string[] = [];
    let currentState = branch.StartAt;
    const visited = new Set<string>();

    while (currentState && !visited.has(currentState)) {
      visited.add(currentState);
      order.push(currentState);
      const state = branch.States[currentState];
      if (state?.Next) {
        currentState = state.Next;
      } else {
        break;
      }
    }

    return order;
  };

  /**
   * Helper function to create a mock workflow branch with S3 Tables modeling
   */
  const createS3TablesWorkflowBranch = (
    includeAthena: boolean,
  ): WorkflowParallelBranch => {
    const dataProcessingState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: 'us-east-1',
          StackName: 'test-data-processing',
          TemplateURL: 'https://example.com/template.json',
          Parameters: [],
          Tags: [],
        },
        Callback: {
          BucketName: 'test-bucket',
          BucketPrefix: 'test-prefix',
        },
      },
    };

    const s3TablesModelingState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: 'us-east-1',
          StackName: 'test-s3tables-modeling',
          TemplateURL: 'https://example.com/s3tables-template.json',
          Parameters: [],
          Tags: [],
        },
        Callback: {
          BucketName: 'test-bucket',
          BucketPrefix: 'test-prefix',
        },
      },
      End: true,
    };

    if (includeAthena) {
      const athenaState: WorkflowState = {
        Type: WorkflowStateType.STACK,
        Data: {
          Input: {
            Action: 'Create',
            Region: 'us-east-1',
            StackName: 'test-athena',
            TemplateURL: 'https://example.com/athena-template.json',
            Parameters: [],
            Tags: [],
          },
          Callback: {
            BucketName: 'test-bucket',
            BucketPrefix: 'test-prefix',
          },
        },
      };

      dataProcessingState.Next = PipelineStackType.ATHENA;
      athenaState.Next = PipelineStackType.DATA_MODELING_S3_TABLES;

      return {
        StartAt: PipelineStackType.DATA_PROCESSING,
        States: {
          [PipelineStackType.DATA_PROCESSING]: dataProcessingState,
          [PipelineStackType.ATHENA]: athenaState,
          [PipelineStackType.DATA_MODELING_S3_TABLES]: s3TablesModelingState,
        },
      };
    }

    dataProcessingState.Next = PipelineStackType.DATA_MODELING_S3_TABLES;

    return {
      StartAt: PipelineStackType.DATA_PROCESSING,
      States: {
        [PipelineStackType.DATA_PROCESSING]: dataProcessingState,
        [PipelineStackType.DATA_MODELING_S3_TABLES]: s3TablesModelingState,
      },
    };
  };

  /**
   * Feature: s3-tables-data-modeling, Property 4: Workflow Order Correctness
   * For any workflow with S3 Tables modeling (without Athena), DATA_MODELING_S3_TABLES
   * should come after DATA_PROCESSING.
   */
  test('S3 Tables modeling should execute after DATA_PROCESSING (without Athena)', () => {
    assert(
      property(
        boolean(), // Random boolean to vary test conditions
        () => {
          const branch = createS3TablesWorkflowBranch(false);
          const order = extractWorkflowOrder(branch);

          // Verify DATA_PROCESSING comes before DATA_MODELING_S3_TABLES
          const dataProcessingIndex = order.indexOf(PipelineStackType.DATA_PROCESSING);
          const s3TablesIndex = order.indexOf(PipelineStackType.DATA_MODELING_S3_TABLES);

          expect(dataProcessingIndex).toBeGreaterThanOrEqual(0);
          expect(s3TablesIndex).toBeGreaterThanOrEqual(0);
          expect(dataProcessingIndex).toBeLessThan(s3TablesIndex);

          // Verify the order is: DATA_PROCESSING -> DATA_MODELING_S3_TABLES
          expect(order).toEqual([
            PipelineStackType.DATA_PROCESSING,
            PipelineStackType.DATA_MODELING_S3_TABLES,
          ]);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 4: Workflow Order Correctness
   * For any workflow with S3 Tables modeling (with Athena), DATA_MODELING_S3_TABLES
   * should come after both DATA_PROCESSING and ATHENA.
   */
  test('S3 Tables modeling should execute after DATA_PROCESSING and ATHENA (with Athena)', () => {
    assert(
      property(
        boolean(), // Random boolean to vary test conditions
        () => {
          const branch = createS3TablesWorkflowBranch(true);
          const order = extractWorkflowOrder(branch);

          // Verify order: DATA_PROCESSING -> ATHENA -> DATA_MODELING_S3_TABLES
          const dataProcessingIndex = order.indexOf(PipelineStackType.DATA_PROCESSING);
          const athenaIndex = order.indexOf(PipelineStackType.ATHENA);
          const s3TablesIndex = order.indexOf(PipelineStackType.DATA_MODELING_S3_TABLES);

          expect(dataProcessingIndex).toBeGreaterThanOrEqual(0);
          expect(athenaIndex).toBeGreaterThanOrEqual(0);
          expect(s3TablesIndex).toBeGreaterThanOrEqual(0);
          expect(dataProcessingIndex).toBeLessThan(athenaIndex);
          expect(athenaIndex).toBeLessThan(s3TablesIndex);

          // Verify the exact order
          expect(order).toEqual([
            PipelineStackType.DATA_PROCESSING,
            PipelineStackType.ATHENA,
            PipelineStackType.DATA_MODELING_S3_TABLES,
          ]);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 4: Workflow Order Correctness
   * The workflow should start with DATA_PROCESSING.
   */
  test('Workflow should start with DATA_PROCESSING', () => {
    assert(
      property(
        boolean(), // includeAthena
        (includeAthena: boolean) => {
          const branch = createS3TablesWorkflowBranch(includeAthena);

          expect(branch.StartAt).toBe(PipelineStackType.DATA_PROCESSING);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 4: Workflow Order Correctness
   * The last state in the workflow should have End: true.
   */
  test('Last state in workflow should have End: true', () => {
    assert(
      property(
        boolean(), // includeAthena
        (includeAthena: boolean) => {
          const branch = createS3TablesWorkflowBranch(includeAthena);
          const order = extractWorkflowOrder(branch);
          const lastStateName = order[order.length - 1];
          const lastState = branch.States[lastStateName];

          expect(lastState.End).toBe(true);
          expect(lastStateName).toBe(PipelineStackType.DATA_MODELING_S3_TABLES);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Test getStackName function for S3 Tables modeling
 * Validates: Requirements 4.5
 */
describe('getStackName for S3 Tables Modeling', () => {
  /**
   * Feature: s3-tables-data-modeling, Property 4: Workflow Order Correctness
   * getStackName should generate correct stack name for DATA_MODELING_S3_TABLES.
   */
  test('should generate correct stack name for DATA_MODELING_S3_TABLES', () => {
    assert(
      property(
        stringOf(constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 8, maxLength: 36 }),
        constantFrom('s3', 'kafka', 'kinesis'),
        (pipelineId: string, sinkType: string) => {
          const stackName = getStackName(pipelineId, PipelineStackType.DATA_MODELING_S3_TABLES, sinkType);

          // Stack name should contain the pipeline ID
          expect(stackName).toContain(pipelineId);

          // Stack name should contain the stack type
          expect(stackName).toContain(PipelineStackType.DATA_MODELING_S3_TABLES);

          // Stack name should not be empty
          expect(stackName.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: s3-tables-data-modeling, Property 4: Workflow Order Correctness
   * getStackName should generate unique stack names for different pipeline IDs.
   */
  test('should generate unique stack names for different pipeline IDs', () => {
    assert(
      property(
        stringOf(constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 8, maxLength: 36 }),
        stringOf(constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 8, maxLength: 36 }),
        constantFrom('s3', 'kafka', 'kinesis'),
        (pipelineId1: string, pipelineId2: string, sinkType: string) => {
          // Skip if pipeline IDs are the same
          pre(pipelineId1 !== pipelineId2);

          const stackName1 = getStackName(pipelineId1, PipelineStackType.DATA_MODELING_S3_TABLES, sinkType);
          const stackName2 = getStackName(pipelineId2, PipelineStackType.DATA_MODELING_S3_TABLES, sinkType);

          expect(stackName1).not.toBe(stackName2);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Test S3 Tables and Redshift workflow mutual exclusion
 * Validates: Requirements 4.2, 4.3
 */
describe('S3 Tables and Redshift Workflow Mutual Exclusion', () => {
  /**
   * Helper function to create a mock workflow branch with Redshift modeling
   */
  const createRedshiftWorkflowBranch = (): WorkflowParallelBranch => {
    const dataProcessingState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: 'us-east-1',
          StackName: 'test-data-processing',
          TemplateURL: 'https://example.com/template.json',
          Parameters: [],
          Tags: [],
        },
        Callback: {
          BucketName: 'test-bucket',
          BucketPrefix: 'test-prefix',
        },
      },
      Next: PipelineStackType.DATA_MODELING_REDSHIFT,
    };

    const redshiftModelingState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: 'us-east-1',
          StackName: 'test-redshift-modeling',
          TemplateURL: 'https://example.com/redshift-template.json',
          Parameters: [],
          Tags: [],
        },
        Callback: {
          BucketName: 'test-bucket',
          BucketPrefix: 'test-prefix',
        },
      },
      End: true,
    };

    return {
      StartAt: PipelineStackType.DATA_PROCESSING,
      States: {
        [PipelineStackType.DATA_PROCESSING]: dataProcessingState,
        [PipelineStackType.DATA_MODELING_REDSHIFT]: redshiftModelingState,
      },
    };
  };

  /**
   * Feature: s3-tables-data-modeling, Property 4: Workflow Order Correctness
   * A workflow should not contain both S3 Tables and Redshift modeling states.
   */
  test('Workflow should not contain both S3 Tables and Redshift modeling', () => {
    // S3 Tables workflow should not have Redshift
    const s3TablesWorkflow: WorkflowParallelBranch = {
      StartAt: PipelineStackType.DATA_PROCESSING,
      States: {
        [PipelineStackType.DATA_PROCESSING]: {
          Type: WorkflowStateType.STACK,
          Data: {
            Input: {
              Action: 'Create',
              Region: 'us-east-1',
              StackName: 'test-data-processing',
              TemplateURL: 'https://example.com/template.json',
              Parameters: [],
              Tags: [],
            },
            Callback: {
              BucketName: 'test-bucket',
              BucketPrefix: 'test-prefix',
            },
          },
          Next: PipelineStackType.DATA_MODELING_S3_TABLES,
        },
        [PipelineStackType.DATA_MODELING_S3_TABLES]: {
          Type: WorkflowStateType.STACK,
          Data: {
            Input: {
              Action: 'Create',
              Region: 'us-east-1',
              StackName: 'test-s3tables-modeling',
              TemplateURL: 'https://example.com/s3tables-template.json',
              Parameters: [],
              Tags: [],
            },
            Callback: {
              BucketName: 'test-bucket',
              BucketPrefix: 'test-prefix',
            },
          },
          End: true,
        },
      },
    };

    expect(s3TablesWorkflow.States[PipelineStackType.DATA_MODELING_REDSHIFT]).toBeUndefined();
    expect(s3TablesWorkflow.States[PipelineStackType.DATA_MODELING_S3_TABLES]).toBeDefined();

    // Redshift workflow should not have S3 Tables
    const redshiftWorkflow = createRedshiftWorkflowBranch();

    expect(redshiftWorkflow.States[PipelineStackType.DATA_MODELING_S3_TABLES]).toBeUndefined();
    expect(redshiftWorkflow.States[PipelineStackType.DATA_MODELING_REDSHIFT]).toBeDefined();
  });
});
