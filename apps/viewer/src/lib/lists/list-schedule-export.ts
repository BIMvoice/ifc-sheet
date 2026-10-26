/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a schedule built from the Lists engine exports (#78): the table the sheet draws (`listScheduleTable`, from the run the sheet reads),
 * handed to the one CSV and XLSX writer (`schedule-export.ts`), so every cell passes the formula guard and the file holds the rows the sheet prints.
 * Run when the button is pressed, so the file is the table as it stands. `null` when there is nothing to list.
 */

import { listScheduleTable, type ListScheduleTable } from '@bimvoice/ifcsheet';
import type { NumberKind } from '@bimvoice/ifcsheet/names';
import { useViewerStore } from '@/store';
import type { ProjectSchedule } from '@/project/types';
import type { ExportTable, ScheduleExport } from '@/joinery/schedule-export';
import { prepareListProviders } from './prepare-providers';
import { listTableSourceOf, runListSchedule, type ListSourceWords } from './list-schedule-run';

export type ListExportWords = ListSourceWords & { yes: string; no: string };

/** The table in the export writer's shape: a count has no decimals of its own, so it names no kind. */
export function listExportTable(table: ListScheduleTable): ExportTable {
  const kinds: Record<number, NumberKind> = {};
  for (const [column, kind] of Object.entries(table.kinds)) if (kind !== 'count') kinds[Number(column)] = kind;
  return { name: table.name, header: table.header, rows: table.rows, bold: table.bold, numeric: table.numeric, kinds };
}

export async function listScheduleExport(schedule: ProjectSchedule, words: ListExportWords): Promise<ScheduleExport | null> {
  if (!schedule.list) return null;
  const state = useViewerStore.getState();
  const { pairs, modelUnits } = prepareListProviders(state, {});
  if (pairs.length === 0) return null;
  const run = await runListSchedule({ id: schedule.id, name: schedule.name, list: schedule.list }, pairs, modelUnits, state);
  const table = listScheduleTable(listTableSourceOf(run, schedule.list, words), schedule.list, schedule.name, words);
  return table.rows.length === 0 ? null : { title: schedule.name, tables: [listExportTable(table)] };
}
