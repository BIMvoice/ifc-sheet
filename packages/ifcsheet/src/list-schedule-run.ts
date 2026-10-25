/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine (#78), run. The saved definition (`ListScheduleDef`) becomes a `ListDefinition`, the list runs
 * through `listCandidates` and `listResultOf` (the functions the app's `runListFederated` is made of), and the result becomes the export
 * model through `buildExportModel`, the Lists panel's own export projection (with the models' units, like the panel). The app, the command
 * line and the MCP tools all take these steps from here, so the table on the sheet, the CSV and the XLSX hold the numbers the panel shows
 * for the same definition: there is no second computation to disagree. They differ only in the provider they hand in (the app's over its
 * viewer store, `list-provider.ts` over a model read headlessly) and the Rules step the app adds for lists that have conditions.
 *
 * Which elements the list keeps is the schedule filter's (#287, `passesElementFilter`): the classes pick the candidates, the storeys,
 * predefined types and property tests cut them, and the survivors are handed to the list as its element scope.
 */

import { IfcTypeEnum, IfcTypeEnumFromString } from '@ifc-lite/data';
import type { ColumnDefinition, ListDataProvider, ListDefinition, ListResult } from '@ifc-lite/lists';
import type { ProjectUnits } from '@ifc-lite/parser';
import { buildExportModel, type ExportModel } from './list-export-model.js';
import { detectNumericColumns } from './list-numeric-columns.js';
import { withListClassification, type ListClassificationContext } from './list-classification.js';
import { listCandidates, listResultOf, type ListProviderPair } from './list-run.js';
import { LIST_COUNT_ID, listFigureKind, type ListCell, type ListScheduleDef, type ListTableSource } from './list-schedule.js';
import { passesElementFilter, predefinedTypeText, propertyValueText, type OccurrenceFacts, type PropertyFact, type SubReportFilter } from './schedule-filter.js';

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
function listScopeIds(schedule: ListScheduleInput, pairs: readonly ListProviderPair[]): Record<string, number[]> {
  const base = baseListDefinition(schedule);
  const classes = schedule.list.filter?.classes;
  // A filter that names classes and none of them is an IFC class keeps nothing; the list engine would read "no types" as every element.
  const noClass = !!classes && base.entityTypes.length === 0;
  const dims = elementDimensions(schedule.list.filter);
  const out: Record<string, number[]> = {};
  const candidates = noClass ? new Map<string, number[]>() : listCandidates(base, pairs);
  for (const { modelId, provider } of pairs) {
    if (noClass) { out[modelId] = []; continue; }
    const ids = candidates.get(modelId) ?? [];
    out[modelId] = restricts(dims) ? ids.filter((id) => passesElementFilter(dims, factsOf(provider, id, !!dims.properties?.length))) : ids;
  }
  return out;
}

/** The list the schedule runs: its definition with the elements the filter kept as its scope. */
export function listDefinitionOf(schedule: ListScheduleInput, pairs: readonly ListProviderPair[]): ListDefinition {
  return { ...baseListDefinition(schedule), entityTypes: [], expressIdsByModel: listScopeIds(schedule, pairs) };
}

/** The export projection of a list's result, as the Lists panel builds it: one function for the document tables and the schedules. */
export function listExportModel(list: ListDefinition, result: ListResult, modelUnits: Map<string, ProjectUnits>, unitDisplayOverrides: Record<string, string>, today: Date = new Date()): ExportModel {
  return buildExportModel({
    title: list.name, columns: result.columns, rows: result.rows, grouping: list.grouping,
    numericCols: detectNumericColumns(result.columns, result.rows), columnWidths: [],
    generatedAt: today.toLocaleString(), modelUnits, unitDisplayOverrides,
  });
}

/** The run of a definition over a result the caller computed: the export model, the annotated columns and whether the list is grouped. */
export function listRunOf(definition: ListDefinition, result: ListResult, modelUnits: Map<string, ProjectUnits>, unitDisplayOverrides: Record<string, string>, today?: Date): ListScheduleRun {
  const model = listExportModel(definition, result, modelUnits, unitDisplayOverrides, today);
  return { model, columns: result.columns, result, grouped: model.schedule !== null };
}

/**
 * The schedule run with no Rules step (a schedule's definition has no conditions): the command line's and the MCP tools' run, over providers
 * built from the models they read. Equal to the app's `runListFederated` for a list with no Rules groups, which calls the same two steps.
 */
export function runListScheduleHeadless(
  schedule: ListScheduleInput, pairs: readonly ListProviderPair[], modelUnits: Map<string, ProjectUnits>,
  options: { unitDisplayOverrides?: Record<string, string>; today?: Date; classification?: ListClassificationContext } = {},
): ListScheduleRun {
  // The office classification (#351): the same wrapping step as the app's run (`withListClassification`).
  pairs = options.classification ? withListClassification(schedule.list, pairs, options.classification) : pairs;
  const definition = listDefinitionOf(schedule, pairs);
  const scope = definition.expressIdsByModel ?? {};
  const result = listResultOf(definition, pairs, (modelId) => scope[modelId] ?? []);
  return listRunOf(definition, result, modelUnits, options.unitDisplayOverrides ?? {}, options.today);
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
