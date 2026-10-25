/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A list schedule (#78) run on a model the engine opened itself, without the app: the command line's `ifcsheet list` and the MCP tools'
 * `kind: "list"` schedule. The model is read through `createHeadlessListProvider`, the rows, groups and totals come from the steps the
 * app's `runListFederated` is made of (`list-run.ts`) and the table from `listScheduleTable`, the function the sheet, the CSV and the XLSX
 * of the app are drawn from. Nothing here computes a figure.
 *
 * Own entry with the headless chain: it loads the parser.
 */

import { ProjectUnits, extractProjectUnits } from '@ifc-lite/parser';
import { listScheduleTable, listExportTable, type ListScheduleDef, type ListScheduleTable } from './list-schedule.js';
import { createHeadlessListProvider } from './list-provider.js';
import { listTableSourceOf, runListScheduleHeadless, type ListScheduleRun } from './list-schedule-run.js';
import { listWordsFor } from './list-words.js';
import type { OpenedModel } from './model.js';
import { csvDelimiter, exportCsv } from './schedule-csv.js';

/** The id the opened model has among the list engine's models; rows and units are keyed by it. */
const MODEL_ID = 'model';

export interface HeadlessListOptions {
  /** What the `model` column prints; the file's name. */
  modelName?: string;
  /** The date the export model is stamped with (tests pin it). */
  today?: Date;
}

/** The list schedule run over the model: the Lists engine's own result and its export model. */
export function runListScheduleOn(model: OpenedModel, schedule: { id: string; name: string; list: ListScheduleDef }, options: HeadlessListOptions = {}): ListScheduleRun {
  const store = model.dataStore;
  const units = store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty();
  const pairs = [{ modelId: MODEL_ID, provider: createHeadlessListProvider(store, options.modelName ?? '') }];
  return runListScheduleHeadless(schedule, pairs, new Map([[MODEL_ID, units]]), { ...(options.today ? { today: options.today } : {}) });
}

/** The table of a list schedule on the model, in the words of `locale` (`ro` or English): the table the sheet draws, a row per group and the totals row. */
export function listScheduleTableOn(model: OpenedModel, schedule: { id: string; name: string; list: ListScheduleDef }, locale: string, options: HeadlessListOptions = {}): ListScheduleTable {
  const words = listWordsFor(locale);
  return listScheduleTable(listTableSourceOf(runListScheduleOn(model, schedule, options), schedule.list, words), schedule.list, schedule.name, words);
}

/** The CSV of the table: the app's file (`exportCsv`, one writer), `;` between columns where the language writes a decimal comma. */
export function listScheduleCsv(table: ListScheduleTable, locale: string): string {
  return exportCsv({ title: table.name, tables: [listExportTable(table)] }, { delimiter: csvDelimiter(locale) });
}

/** Whether the list printed no element: a grouped list still prints its totals row (all zero), which is not a row of the list. */
export const listTableIsEmpty = (table: ListScheduleTable): boolean => table.rows.length - table.bold.length === 0;
