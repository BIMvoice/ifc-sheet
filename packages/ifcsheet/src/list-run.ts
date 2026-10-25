/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The part of running a list that does not depend on how the models are held (#78): the candidates a list's type scope gives, and the
 * result over a chosen set of elements. The app's `runListFederated` (`apps/viewer/src/lib/lists/run-list.ts`) calls these two around its
 * Rules step, and the command line and the MCP tools call them with no Rules step, so a list gives the same rows, groups and summary in all
 * three: there is one orchestration of `executeList` and `summariseListRows`.
 */

import { executeList, summariseListRows, type ListDataProvider, type ListDefinition, type ListResult } from '@ifc-lite/lists';
import { mergeResultColumns } from './list-merge-columns.js';

/** One model as the list engine sees it. */
export interface ListProviderPair {
  modelId: string;
  provider: ListDataProvider;
}

/**
 * The elements the list's type or snapshot scope keeps, by model id. A first pass of `executeList` with no columns, no conditions and no
 * presentation: Rules groups, when a list has any, cut these further.
 */
export function listCandidates(definition: ListDefinition, pairs: readonly ListProviderPair[]): Map<string, number[]> {
  return new Map(pairs.map(({ modelId, provider }) => [modelId, executeList({
    ...definition, groups: [], legacyConditions: [], columns: [], grouping: undefined, sortBy: undefined,
  }, provider, modelId).rows.map(({ entityId }) => entityId)] as const));
}

/**
 * The list over the elements `idsOf` names for each model: one `executeList` per model, the rows flattened, the groups and summary
 * derived again over the merged rows (so grouping works across models), and the quantity and data types each part resolved merged back
 * onto the columns (what decides how a figure is converted and labelled).
 */
export function listResultOf(definition: ListDefinition, pairs: readonly ListProviderPair[], idsOf: (modelId: string) => readonly number[], executionTime = 0): ListResult {
  const parts = pairs.map(({ modelId, provider }) => executeList({
    ...definition, groups: [], legacyConditions: [], expressIdsByModel: { [modelId]: [...idsOf(modelId)] },
  }, provider, modelId));
  const rows = parts.flatMap((r) => r.rows);
  const { groups, summary } = summariseListRows(definition, rows);
  return { columns: mergeResultColumns(parts, definition.columns), rows, totalCount: rows.length, executionTime, groups, summary };
}
