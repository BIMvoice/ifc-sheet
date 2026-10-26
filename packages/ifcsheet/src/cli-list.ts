/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet list model.ifc --project p.ifclite-project.json --schedule <id>` (#78): a schedule built from the Lists engine, run on the
 * command line. The rows and totals are the Lists engine's, run over the engine's own provider (`list-provider.ts`) by the steps the app
 * runs (`list-run.ts`), so they are the numbers the app prints for the same definition; the CSV is the app's file (`exportCsv`). Text, CSV or JSON.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ClassificationMapping } from './classification.js';
import { openModel, type OpenedModel } from './model.js';
import { listScheduleCsv, listScheduleTableOn, listTableIsEmpty } from './list-headless.js';
import { readProjectFile } from './project-read.js';
import { listTableText } from './list-figures.js';
import { sheetFormat } from './units-and-numbers.js';
import type { ListScheduleTable } from './list-schedule.js';
import type { ProjectSchedule } from './sub-reports.js';
import type { CliIo } from './cli.js';

export { listTableText };

export interface ListArgs {
  model: string;
  project: string;
  /** The schedule's id or name; absent: the project's only list schedule. */
  schedule?: string;
  csv: boolean;
  json: boolean;
  locale: string;
}

const cannotRead = (file: string, error: unknown): string =>
  `ifcsheet: cannot read ${file}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`;

const isList = (s: ProjectSchedule): s is ProjectSchedule & { list: NonNullable<ProjectSchedule['list']> } => s.kind === 'list' && !!s.list;

/** The list schedules of a project, each with its table on the model. */
export function listSchedulesOn(model: OpenedModel, schedules: readonly ProjectSchedule[], locale: string, modelName: string, classificationMappings: readonly ClassificationMapping[] = []): { schedule: ProjectSchedule; table: ListScheduleTable }[] {
  return schedules.filter(isList).map((schedule) => ({ schedule, table: listScheduleTableOn(model, { id: schedule.id, name: schedule.name, list: schedule.list }, locale, { modelName, classificationMappings }) }));
}

/** `ifcsheet list`: exit 0 with the table, 1 when a file cannot be read, the schedule is not found or the list has no rows. */
export async function list(args: ListArgs, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  let projectText: string;
  try { bytes = new Uint8Array(await readFile(args.model)); } catch (error) { io.stderr(cannotRead(args.model, error)); return 1; }
  try { projectText = await readFile(args.project, 'utf8'); } catch (error) { io.stderr(cannotRead(args.project, error)); return 1; }
  let project;
  try { project = readProjectFile(projectText); } catch (error) { io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`); return 1; }
  const lists = project.schedules.filter(isList);
  if (lists.length === 0) {
    io.stderr(`ifcsheet: ${args.project} holds no list schedules; build one in the app (Schedule from the model) and save the project.\n`);
    return 1;
  }
  const found = args.schedule === undefined ? (lists.length === 1 ? lists[0] : undefined) : lists.find((s) => s.id === args.schedule) ?? lists.find((s) => s.name === args.schedule);
  if (!found) {
    io.stderr(`ifcsheet: ${args.schedule === undefined ? 'the project holds more than one list schedule; name one with --schedule' : `no list schedule "${args.schedule}"`}: ${lists.map((s) => `${s.id} (${s.name})`).join(', ')}\n`);
    return 1;
  }
  // The values come from the entity tables: no geometry is needed or measured.
  const model = await openModel(bytes, { geometry: false });
  const [{ table }] = listSchedulesOn(model, [found], args.locale, basename(args.model), project.classificationMappings);
  if (listTableIsEmpty(table)) {
    io.stderr(`ifcsheet: nothing to list: the elements of "${found.name}" are not in ${args.model}.\n`);
    return 1;
  }
  if (args.json) {
    const total = table.bold.length > 0 ? table.bold[0] : -1;
    io.stdout(`${JSON.stringify({ file: args.model, project: args.project, schedule: { id: found.id, name: found.name }, header: table.header, rows: table.rows.filter((_, i) => i !== total), totals: total >= 0 ? table.rows[total] : null }, null, 2)}\n`);
  }
  else if (args.csv) io.stdout(listScheduleCsv(table, args.locale));
  else io.stdout(listTableText(table, sheetFormat(args.locale, project.unitsAndNumbers)));
  return 0;
}
