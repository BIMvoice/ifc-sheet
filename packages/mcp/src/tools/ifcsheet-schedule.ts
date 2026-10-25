/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet_add_schedule` (#165): a room or bill-of-quantities schedule on a sheet of its own. */

import { DEFAULT_SCHEME, ISO_PAPERS, drawingArea, freshProjectId, nextNumber } from '@bimvoice/ifcsheet';
import { SCHEDULE_LOCALES, scheduleCapacity, scheduleTable } from './ifcsheet-draw.js';
import { DOCUMENT_ID, invalid, optChoice, optText, pathOrInline, text } from './ifcsheet-shared.js';
import { getSheetSet, replaceSheetDocument } from './ifcsheet-store.js';
import type { Tool } from './types.js';
import { okResult } from './util.js';

const KINDS = ['rooms', 'boq'] as const;

export const ifcsheetAddSchedule: Tool = {
  name: 'ifcsheet_add_schedule',
  description:
    'Add a schedule on a new sheet of its own, in the schedules series (A-601 by default), landscape. kind "rooms": the room and area schedule of the model: every IfcSpace by level with its number, name and area in square metres (the model\'s NetFloorArea, else GrossFloorArea, else the footprint of its geometry), a total per level and for the building; the same rows as `ifcsheet rooms`. kind "boq": the bill of quantities (antemasuratoare) of the articles a saved project holds, summed over the model; give project_path (a .ifclite-project.json on the server) or project_json (its text); the same sums as `ifcsheet boq`. The table is read from the model whenever the set is drawn. Rows beyond what fits the paper are left off the sheet (rows_left_off says how many); a larger paper holds more, and the issue\'s CSV always has all. Returns the sheet, the rows counts and the first rows of the table.',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      kind: { type: 'string', enum: [...KINDS], description: 'The schedule.' },
      name: { type: 'string', description: 'The sheet\'s name. Default "Room and area schedule" or "Bill of quantities".' },
      paper: { type: 'string', enum: [...ISO_PAPERS], description: 'The sheet\'s paper, default A3.' },
      locale: { type: 'string', enum: [...SCHEDULE_LOCALES], description: 'The language and number format of the table: "ro" writes 12,50 and Romanian headings. Default en.' },
      project_path: { type: 'string', description: 'boq: a saved project on the server (inside the allowed paths). Give this or project_json.' },
      project_json: { type: 'string', description: 'boq: the text of a saved project file.' },
    },
    required: ['document_id', 'kind'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
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
    const schedule = { id: `schedule-${entry.schedules.length + 1}`, kind, sheetId: freshProjectId('sheet'), locale, ...(boqArticles ? { boqArticles } : {}) };
    // The table is read now: a model with nothing for the schedule is refused before the sheet is made.
    const table = await scheduleTable(schedule, entry.model.model);
    const name = optText(input, 'name')?.trim() || (kind === 'rooms' ? 'Room and area schedule' : 'Bill of quantities');
    const sheet = {
      id: schedule.sheetId, number: nextNumber(doc.sheets, 'schedules', doc.sheetNumbering ?? DEFAULT_SCHEME), series: 'schedules' as const,
      name, createdAt: Date.now(), paper, orientation: 'landscape' as const, viewports: [],
    };
    replaceSheetDocument(entry, { ...doc, sheets: [...doc.sheets, sheet] });
    entry.schedules.push(schedule);
    const left = Math.max(0, table.rows.length - scheduleCapacity(drawingArea(sheet)));
    return okResult(
      `Added ${kind === 'rooms' ? 'the room schedule' : 'the bill of quantities'} as sheet ${sheet.number} (${table.rows.length - 1} rows${left ? `, ${left} left off the ${paper}` : ''}).`,
      { document_id: entry.id, sheet: { id: sheet.id, number: sheet.number, name, paper }, kind, rows: table.rows.length - 1, rows_left_off: left, notes: table.notes, table: table.rows.slice(0, 8) },
    );
  },
};
