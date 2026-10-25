/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet_add_schedule` (#165): a room, bill-of-quantities or Lists-engine schedule on a sheet of its own. */

import { DEFAULT_SCHEME, ISO_PAPERS, drawingArea, freshProjectId, nextNumber, readListScheduleDef, type ListScheduleDef } from '@bimvoice/ifcsheet';
import { SCHEDULE_LOCALES, scheduleCapacity, scheduleTable } from './ifcsheet-draw.js';
import { DOCUMENT_ID, DRY_RUN, dryPrefix, invalid, optBoolean, optChoice, optText, pathOrInline, text, workingEntry } from './ifcsheet-shared.js';
import { getSheetSet, replaceSheetDocument, type SetSchedule } from './ifcsheet-store.js';
import type { Tool } from './types.js';
import { okResult } from './util.js';

const KINDS = ['rooms', 'boq', 'list'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The definition of a list schedule from the tool input: read by the engine's own reader (`readListScheduleDef`, the one the project file is
 * read with), but strictly. The reader drops what is damaged so an old file still opens; a call is refused instead, naming what it would drop,
 * so an agent never gets a plainer table than it asked for.
 */
function listDefinition(raw: unknown): ListScheduleDef {
  if (!isObject(raw)) throw invalid('list is required for kind "list": an object with columns (and optionally filter, groupBy, sum, totals).');
  const def = readListScheduleDef(raw);
  const columns = Array.isArray(raw.columns) ? raw.columns : [];
  if (columns.length === 0) throw invalid('list.columns must hold at least one column: { id, source, propertyName, psetName?, label?, hidden? }.');
  if (def.columns.length !== columns.length) {
    const bad = columns.findIndex((c, i) => !def.columns.some((d) => d.id === (isObject(c) ? c.id : undefined)) || columns.findIndex((o) => isObject(o) && isObject(c) && o.id === c.id) !== i);
    throw invalid(`list.columns[${bad}] cannot be used: each column needs a unique string id, a source of attribute, property, quantity, material, classification or spatial, and a propertyName.`);
  }
  for (const key of ['groupBy', 'sum'] as const) {
    const given = raw[key];
    if (given === undefined) continue;
    if (!Array.isArray(given) || given.length !== (def[key] ?? []).length) throw invalid(`list.${key} must name distinct column ids of list.columns${key === 'sum' ? ' and needs groupBy' : ''}.`);
  }
  if (raw.totals !== undefined && raw.totals !== false) throw invalid('list.totals can only be false (the totals row of a grouped list is printed unless it is false).');
  return def;
}

export const ifcsheetAddSchedule: Tool = {
  name: 'ifcsheet_add_schedule',
  description:
    'Add a schedule on a new sheet of its own, in the schedules series (A-601 by default), landscape. kind "rooms": the room and area schedule of the model: every IfcSpace by level with its number, name and area in square metres (the model\'s NetFloorArea, else GrossFloorArea, else the footprint of its geometry), a total per level and for the building; the same rows as `ifcsheet rooms`. kind "boq": the bill of quantities (antemasuratoare) of the articles a saved project holds, summed over the model; give project_path (a .ifclite-project.json on the server) or project_json (its text); the same sums as `ifcsheet boq`. kind "list": a table built from the Lists engine, the app\'s "Schedule from the model": give list, the definition { filter?: { classes?, levels?, predefined?, properties? }, columns: [{ id, source: attribute|property|quantity|material|classification|spatial, propertyName, psetName?, label?, hidden? }], groupBy?: [column ids], sum?: [column ids], totals?: false }; its rows, counts and totals are the Lists panel\'s for that definition (the same as `ifcsheet list`), e.g. the walls by type with their count and NetSideArea. The table is read from the model whenever the set is drawn. Rows beyond what fits the paper are left off the sheet (rows_left_off says how many); a larger paper holds more, and the issue\'s CSV always has all. Returns the sheet, the rows counts and the first rows of the table; for rooms also total_row, the last row of the table: the building total (Au). With dry_run true no sheet is added: the same table and counts are returned.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      dry_run: DRY_RUN,
      kind: { type: 'string', enum: [...KINDS], description: 'The schedule.' },
      name: { type: 'string', description: 'The sheet\'s name. Default "Room and area schedule" or "Bill of quantities".' },
      paper: { type: 'string', enum: [...ISO_PAPERS], description: 'The sheet\'s paper, default A3.' },
      locale: { type: 'string', enum: [...SCHEDULE_LOCALES], description: 'The language and number format of the table: "ro" writes 12,50 and Romanian headings. Default en.' },
      project_path: { type: 'string', description: 'boq: a saved project on the server (inside the allowed paths). Give this or project_json.' },
      project_json: { type: 'string', description: 'boq: the text of a saved project file.' },
      list: { type: 'object', description: 'list: the definition of the table: { filter?, columns, groupBy?, sum?, totals? }.', additionalProperties: true },
    },
    required: ['document_id', 'kind'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const session = getSheetSet(ctx, text(input, 'document_id'));
    const dry = optBoolean(input, 'dry_run') ?? false;
    const entry = workingEntry(session, dry);
    const doc = entry.set.document;
    const kind = optChoice(input, 'kind', KINDS);
    if (!kind) throw invalid(`kind is required: one of ${KINDS.join(', ')}.`);
    const paper = optChoice(input, 'paper', ISO_PAPERS) ?? 'A3';
    const locale = optChoice(input, 'locale', SCHEDULE_LOCALES) ?? 'en';
    let boqArticles;
    if (kind === 'boq') {
      const given = await pathOrInline(input, ctx, 'project', 'saved project');
      const { readProjectFile } = await import('@bimvoice/ifcsheet/headless');
      let project;
      try {
        project = readProjectFile(given.text);
      } catch (err) {
        throw invalid(`${given.source} cannot be used as a project: ${(err as Error).message}`);
      }
      if (project.boqArticles.length === 0) throw invalid(`${given.source} holds no bill-of-quantities articles; add them in the app (Bill of quantities) and save the project.`);
      boqArticles = project.boqArticles;
    } else if (input.project_path !== undefined || input.project_json !== undefined) {
      throw invalid('project_path and project_json are for kind "boq".');
    }
    if (kind !== 'list' && input.list !== undefined) throw invalid('list is for kind "list".');
    const list = kind === 'list' ? listDefinition(input.list) : undefined;
    const name = optText(input, 'name')?.trim() || (kind === 'rooms' ? 'Room and area schedule' : kind === 'list' ? 'Schedule' : 'Bill of quantities');
    const schedule: SetSchedule = { id: `schedule-${entry.schedules.length + 1}`, kind, sheetId: freshProjectId('sheet'), locale, ...(boqArticles ? { boqArticles } : {}), ...(list ? { list, name } : {}) };
    // The table is read now: a model with nothing for the schedule is refused before the sheet is made.
    const table = await scheduleTable(schedule, entry.model.model);
    const sheet = {
      id: schedule.sheetId, number: nextNumber(doc.sheets, 'schedules', doc.sheetNumbering ?? DEFAULT_SCHEME), series: 'schedules' as const,
      name, createdAt: Date.now(), paper, orientation: 'landscape' as const, viewports: [],
    };
    replaceSheetDocument(entry, { ...doc, sheets: [...doc.sheets, sheet] });
    entry.schedules.push(schedule);
    const left = Math.max(0, table.rows.length - scheduleCapacity(drawingArea(sheet)));
    return okResult(
      dryPrefix(dry, `${dry ? 'Would add' : 'Added'} ${kind === 'rooms' ? 'the room schedule' : kind === 'list' ? `the list schedule "${name}"` : 'the bill of quantities'} as sheet ${sheet.number} (${table.rows.length - 1} rows${left ? `, ${left} left off the ${paper}` : ''}).`),
      { document_id: entry.id, dry_run: dry, sheet: { id: sheet.id, number: sheet.number, name, paper }, kind, rows: table.rows.length - 1, rows_left_off: left, notes: table.notes, table: table.rows.slice(0, 8), ...(kind === 'rooms' ? { total_row: table.rows[table.rows.length - 1] } : {}) },
    );
  },
};
