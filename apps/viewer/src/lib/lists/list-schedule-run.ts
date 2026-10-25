/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine (#78), run. The saved definition (`ListScheduleDef`, the engine's) becomes a `ListDefinition`
 * and runs through `runListFederated`, the Lists panel's own function, and its result becomes the export model through
 * `buildExportModel`, the panel's own export projection (with the models' units, like the panel). So the table on the sheet, the CSV and the
 * XLSX hold the numbers the panel shows for the same definition: there is no second computation to disagree.
 *
 * Which elements the list keeps is the schedule filter's (#287, `passesElementFilter`): the classes pick the candidates, the storeys,
 * predefined types and property tests cut them, and the survivors are handed to the list as its element scope.
 */

import { IfcTypeEnum, IfcTypeEnumFromString } from '@ifc-lite/data';
import { executeList, type ColumnDefinition, type ListDataProvider, type ListDefinition, type ListResult } from '@ifc-lite/lists';
import type { ProjectUnits } from '@ifc-lite/parser';
import {
  LIST_COUNT_ID, listFigureKind, passesElementFilter, predefinedTypeText, propertyValueText,
  type ListCell, type ListScheduleDef, type ListTableSource, type OccurrenceFacts, type PropertyFact, type SubReportFilter,
} from '@bimvoice/ifcsheet';
import type { ViewerState } from '@/store';
import { listExportModel } from '../document/prepare-list-table';
import { evaluatorModelsFromState } from '../model-tags/evaluator-models';
import type { ExportModel } from './export/model';
import { runListFederated, type ModelProviderPair } from './run-list';

/** The part of a project schedule a run reads. */
export interface ListScheduleInput {
  id: string;
  name: string;
  list: ListScheduleDef;
}

/** What a run gives: the panel's own result and its export model. */
export interface ListScheduleRun {
  model: ExportModel;
  /** The result's columns, with the quantity types the engine annotated them with (what decides how a figure is written). */
  columns: ColumnDefinition[];
  result: ListResult;
  /** Whether the list is grouped (the model then holds the pivot: a row per group, Count, sums). */
  grouped: boolean;
}

/** The IFC classes a filter names as the list engine's types; `null` when it names none (every element). A name that is no IFC class matches nothing: the lookup answers `Unknown` for it, which is a type of its own. */
function entityTypesOf(filter: SubReportFilter | undefined): IfcTypeEnum[] | null {
  if (!filter?.classes) return null;
  return filter.classes.map((c) => IfcTypeEnumFromString(c)).filter((t) => t !== IfcTypeEnum.Unknown);
}

/** The element dimensions of a filter (everything but the classes, which pick the list's candidates). */
const elementDimensions = (filter: SubReportFilter | undefined): SubReportFilter => ({ ...filter, classes: undefined });
const restricts = (f: SubReportFilter): boolean => !!(f.levels || f.predefined || f.properties?.length);

/** The columns of the definition as the list engine takes them. */
function listColumnsOf(def: ListScheduleDef): ColumnDefinition[] {
  return def.columns.map((c) => ({ id: c.id, source: c.source, ...(c.psetName ? { psetName: c.psetName } : {}), propertyName: c.propertyName, ...(c.label ? { label: c.label } : {}) }));
}

/** The list the definition is, without its element scope (`listDefinitionOf` adds it): what the Lists panel would hold for the same table. */
function baseListDefinition(schedule: ListScheduleInput): ListDefinition {
  const { list } = schedule;
  const entityTypes = entityTypesOf(list.filter) ?? [];
  const groupBy = list.groupBy ?? [];
  return {
    id: schedule.id, name: schedule.name, createdAt: 0, updatedAt: 0,
    entityTypes, groups: [], columns: listColumnsOf(list),
    ...(groupBy.length > 0 ? { grouping: { columnId: groupBy[0], columnIds: groupBy, sumColumnIds: list.sum ?? [], view: 'schedule' as const } } : {}),
  };
}

function factsOf(provider: ListDataProvider, id: number, withProperties: boolean): OccurrenceFacts {
  const properties: PropertyFact[] = [];
  if (withProperties) {
    for (const set of provider.getPropertySets(id)) {
      for (const p of set.properties) {
        const value = propertyValueText(p.value);
        if (value !== null) properties.push({ pset: set.name, name: p.name, value });
      }
    }
  }
  return {
    level: provider.getStoreyName?.(id) ?? '', ifcClass: provider.getEntityTypeName(id),
    predefinedType: predefinedTypeText(provider.getEntityPredefinedType?.(id)), properties,
  };
}

/**
 * The elements of each model the schedule keeps, by model id: the list engine's candidates for the classes, cut by the schedule filter's
 * other dimensions. The one place the filter is applied, for the sheet, the files and the checks.
 */
function listScopeIds(schedule: ListScheduleInput, pairs: readonly ModelProviderPair[]): Record<string, number[]> {
  const base = baseListDefinition(schedule);
  const classes = schedule.list.filter?.classes;
  // A filter that names classes and none of them is an IFC class keeps nothing; the list engine would read "no types" as every element.
  const noClass = !!classes && base.entityTypes.length === 0;
  const dims = elementDimensions(schedule.list.filter);
  const out: Record<string, number[]> = {};
  for (const { modelId, provider } of pairs) {
    if (noClass) { out[modelId] = []; continue; }
    const candidates = executeList({ ...base, columns: [], grouping: undefined, sortBy: undefined }, provider, modelId).rows.map((r) => r.entityId);
    out[modelId] = restricts(dims) ? candidates.filter((id) => passesElementFilter(dims, factsOf(provider, id, !!dims.properties?.length))) : candidates;
  }
  return out;
}

/** The list the schedule runs: its definition with the elements the filter kept as its scope. */
function listDefinitionOf(schedule: ListScheduleInput, pairs: readonly ModelProviderPair[]): ListDefinition {
  return { ...baseListDefinition(schedule), entityTypes: [], expressIdsByModel: listScopeIds(schedule, pairs) };
}

/** Run the schedule's list over the loaded models and project it as the Lists panel exports it. */
export async function runListSchedule(
  schedule: ListScheduleInput, pairs: readonly ModelProviderPair[], modelUnits: Map<string, ProjectUnits>, state: ViewerState,
  options: { signal?: AbortSignal; today?: Date } = {},
): Promise<ListScheduleRun> {
  options.signal?.throwIfAborted();
  const definition = listDefinitionOf(schedule, pairs);
  const result = await runListFederated(definition, pairs, state, { evaluatorModels: evaluatorModelsFromState(state), signal: options.signal });
  options.signal?.throwIfAborted();
  const model = listExportModel(definition, result, modelUnits, state, options.today);
  return { model, columns: result.columns, result, grouped: model.schedule !== null };
}

/** The words a table says that the Lists engine does not. */
export interface ListSourceWords {
  count: string;
  total: string;
}

/**
 * The run as the table reads it (`listScheduleTable`): the panel's pivot when the list is grouped (a row per group, Count, the sums, and the
 * totals row), else a row per element. The kind of every figure column comes from the quantity the engine annotated the column with.
 */
export function listTableSourceOf(run: ListScheduleRun, def: Pick<ListScheduleDef, 'totals'>, words: ListSourceWords): ListTableSource {
  const { model } = run;
  const kindOf = (id: string) => (id === LIST_COUNT_ID ? 'count' as const : listFigureKind(run.columns.find((c) => c.id === id)?.quantityType));
  if (!model.schedule) {
    return { columns: model.columns.map((c) => ({ id: c.id, label: c.label, numeric: c.numeric, kind: kindOf(c.id) })), rows: model.rows, totals: null };
  }
  const columns = model.schedule.columns.map((c) => ({ id: c.id, label: c.id === LIST_COUNT_ID ? words.count : c.label, numeric: c.numeric, kind: kindOf(c.id) }));
  const totals: ListCell[] = columns.map((c, i) => (i === 0 ? words.total : c.id === LIST_COUNT_ID ? model.totals.count : (model.totals.sums[c.id] ?? null)));
  return { columns, rows: model.schedule.rows, totals: def.totals === false ? null : totals };
}
