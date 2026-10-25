/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine (#78), run in the app. The saved definition becomes a `ListDefinition` and runs through
 * `runListFederated`, the Lists panel's own function, and its result becomes the export model through the panel's own export projection
 * (with the models' units, like the panel). Both steps and the table are the engine's (`list-schedule-run.ts` in `@bimvoice/ifcsheet`),
 * which the command line and the MCP tools run too over a headless provider: the app adds only the Rules step and the viewer's state.
 */

import type { ProjectUnits } from '@ifc-lite/parser';
import { listDefinitionOf, listRunOf, type ListScheduleInput, type ListScheduleRun } from '@bimvoice/ifcsheet/list-projection';
import type { ViewerState } from '@/store';
import { evaluatorModelsFromState } from '../model-tags/evaluator-models';
import { runListFederated, type ModelProviderPair } from './run-list';

export { listTableSourceOf, type ListScheduleInput, type ListScheduleRun, type ListSourceWords } from '@bimvoice/ifcsheet/list-projection';

/** Run the schedule's list over the loaded models and project it as the Lists panel exports it. */
export async function runListSchedule(
  schedule: ListScheduleInput, pairs: readonly ModelProviderPair[], modelUnits: Map<string, ProjectUnits>, state: ViewerState,
  options: { signal?: AbortSignal; today?: Date } = {},
): Promise<ListScheduleRun> {
  options.signal?.throwIfAborted();
  const definition = listDefinitionOf(schedule, pairs);
  const result = await runListFederated(definition, pairs, state, { evaluatorModels: evaluatorModelsFromState(state), signal: options.signal });
  options.signal?.throwIfAborted();
  return listRunOf(definition, result, modelUnits, state.unitDisplayOverrides, options.today);
}
