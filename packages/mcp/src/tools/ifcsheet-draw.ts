/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The set as drawn: the engine's `sheetGraphics` for every sheet, and on a
 * schedule's sheet the schedule's table. The engine has no schedule sheet yet
 * (the app composes those), so the table is set here as plain text rows in the
 * sheet's drawing area; the rows themselves are the engine's own (the room
 * schedule `ifcsheet rooms` prints, the bill of quantities `ifcsheet boq`
 * prints), read from the model each time, so a drawn schedule is never stale.
 * Every tool that writes a drawing (PDF, DXF, issue) goes through `drawSet`.
 */

import {
  boqSayFor, boqTable, boqTableCells, drawingArea, listTableCells, roomSchedule, roomScheduleCsv, roomScheduleRows, sheetFormat,
  type BoqArticle, type SheetLocale, type UnitsAndNumbers,
} from '@bimvoice/ifcsheet';
import { boqCsv, boqResult } from '@bimvoice/ifcsheet/cli-boq';
import { listScheduleCsv, listScheduleTableOn, listTableIsEmpty, type OpenedModel, type SheetGraphic } from '@bimvoice/ifcsheet/headless';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import type { SetSchedule, SheetModelEntry, SheetSetEntry } from './ifcsheet-store.js';

export interface ScheduleTable {
  /** The rows, header first, every cell as text. What the tool returns: a figure of a list or a bill of quantities is its plain number, for the agent that reads it back. */
  rows: string[][];
  /** The rows as the sheet prints them, header first: the figures in the language and the document's "Units and numbers" (`sheetNumber`), as the app's sheet and `ifcsheet` write them. Absent: `rows`. */
  printed?: string[][];
  /** Lines under the table: what was refused or only partly counted. */
  notes: string[];
  /** The same table as CSV, for the issue. */
  csv: string;
}

/** The locales the schedules are worded in. */
export const SCHEDULE_LOCALES = ['en', 'ro'] as const;

/**
 * The table of a schedule, read from the model now. The figures are written for people on a sheet, so they follow the language and the document's
 * "Units and numbers" (`units`), as the app's sheet does; the CSV keeps its plain numbers. Throws UNSUPPORTED_OPERATION when the model has nothing for it.
 */
export async function scheduleTable(schedule: SetSchedule, model: OpenedModel, units?: UnitsAndNumbers): Promise<ScheduleTable> {
  const format = sheetFormat(schedule.locale, units);
  if (schedule.kind === 'rooms') {
    const { readRooms } = await import('@bimvoice/ifcsheet/headless');
    const read = readRooms(model.dataStore, model.meshes);
    const rooms = roomSchedule(read.levels, read.rooms);
    if (rooms.rooms === 0) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: 'The model has no rooms (IfcSpace) to list.' });
    return { rows: roomScheduleRows(rooms, schedule.locale as SheetLocale), printed: roomScheduleRows(rooms, format), notes: [], csv: roomScheduleCsv(rooms, schedule.locale as SheetLocale) };
  }
  if (schedule.kind === 'list') {
    if (!schedule.list) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: 'The list schedule holds no definition.' });
    // The Lists engine's rows over the model, by the steps the app runs: the same numbers as `ifcsheet list` and the app's table.
    const table = listScheduleTableOn(model, { id: schedule.id, name: schedule.name ?? 'List', list: schedule.list }, schedule.locale, { classificationMappings: schedule.classificationMappings ?? [] });
    if (listTableIsEmpty(table)) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: 'The list has no rows: no element of the model matches its filter.' });
    return { rows: [table.header, ...table.rows.map((r) => r.map((c) => (c === null ? '' : String(c))))], printed: [table.header, ...listTableCells(table, format)], notes: [], csv: listScheduleCsv(table, schedule.locale) };
  }
  const articles: readonly BoqArticle[] = schedule.boqArticles ?? [];
  if (articles.length === 0) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: 'The project holds no bill-of-quantities articles.' });
  const table = boqTable(boqResult(model.dataStore, articles), boqSayFor(schedule.locale), {});
  return { rows: [table.header, ...table.rows.map((r) => r.map((c) => (c === null ? '' : String(c))))], printed: [table.header, ...boqTableCells(table, format)], notes: table.notes, csv: boqCsv(table, schedule.locale) };
}

const TEXT_MM = 2.5;
const ROW_MM = 5;
const CHAR_EM = 0.6;
const GAP_MM = 6;

/** How many table rows (the header counts) fit a drawing area of `area`. */
export const scheduleCapacity = (area: { h: number }): number => Math.max(0, Math.floor((area.h - 3 * GAP_MM) / ROW_MM));

/** `table` set as text rows in `area` (paper mm); returns how many rows were drawn. Columns are as wide as their longest cell. */
function setTable(sheet: SheetGraphic, area: { x: number; y: number; w: number; h: number }, title: string, table: ScheduleTable): number {
  const rows = table.printed ?? table.rows;
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => [...(r[c] ?? '')].length)) * TEXT_MM * CHAR_EM);
  const xs = widths.map((_, c) => area.x + GAP_MM + widths.slice(0, c).reduce((a, w) => a + w + GAP_MM, 0));
  sheet.texts.push({ at: { x: area.x + GAP_MM, y: area.y + GAP_MM }, text: title, size: 4 });
  const capacity = scheduleCapacity(area);
  const drawn = rows.slice(0, capacity);
  drawn.forEach((row, i) => row.forEach((cell, c) => {
    if (cell) sheet.texts.push({ at: { x: xs[c], y: area.y + 2 * GAP_MM + (i + 1) * ROW_MM }, text: cell, size: TEXT_MM });
  }));
  return drawn.length;
}

export interface DrawnSet {
  sheets: SheetGraphic[];
  /** Per schedule: the table and how many of its rows fit the sheet (the rest are in the CSV of the issue). */
  schedules: { schedule: SetSchedule; table: ScheduleTable; drawn: number }[];
}

/** Every sheet of the set as shapes on its paper, schedules included. */
export async function drawSet(entry: SheetSetEntry, model: SheetModelEntry): Promise<DrawnSet> {
  const { sheetGraphics } = await import('@bimvoice/ifcsheet/headless');
  const sheets = await sheetGraphics(entry.set, model.model);
  const schedules: DrawnSet['schedules'] = [];
  for (const schedule of entry.schedules) {
    const sheet = entry.set.document.sheets.find((s) => s.id === schedule.sheetId);
    const graphic = sheets.find((g) => g.sheetId === schedule.sheetId);
    if (!sheet || !graphic) continue;
    const table = await scheduleTable(schedule, model.model, entry.set.document.unitsAndNumbers);
    schedules.push({ schedule, table, drawn: setTable(graphic, drawingArea(sheet), sheet.name, table) });
  }
  return { sheets, schedules };
}
