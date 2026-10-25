/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one CSV writer and the one XLSX writer of every schedule (#80). Each kind of schedule hands over the table it draws as an
 * `ExportTable` (`schedule-layout.ts`, `material-takeoff-layout.ts`, `room-finishes-layout.ts`, `type-quantities-layout.ts`,
 * `urban-layout.ts`, `register-layout.ts` next to the layout that draws it, from the same rows), and these two functions write
 * it: so the file holds the rows the sheet prints, and every cell passes through the same formula guard (#1506).
 *
 * CSV is machine-readable: figures are plain numbers (`1234.5`, never `1.234,5`; the sheet's language does not change them).
 * It is UTF-8 with a byte order mark (Excel reads a file without one as the system's ANSI code page and breaks Romanian
 * diacritics), CRLF line ends, and `,` or `;` as the delimiter (`csvDelimiter`). XLSX keeps figures as numeric cells.
 *
 * The project's "Units and numbers" (#88) changes neither file's figures: a decimal comma in a CSV or a text cell would turn a number
 * into a string a spreadsheet cannot add up, so a comma project still gets `1234.5`. It changes what a spreadsheet needs to open them:
 * the CSV delimiter follows the project's separator (`;` when it is a comma), and an XLSX figure column that names its kind
 * (`ExportTable.kinds`) shows the project's decimals through the cell's number format. The decimal mark itself is the opening
 * spreadsheet's regional setting: a number format in the file cannot carry one.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import { decimalMarkOf, decimalsOf, groupingOff, type NumberKind, type SheetLocale } from '@bimvoice/ifcsheet/names';
import type ExcelJS from 'exceljs';
import { neutralizeSpreadsheetFormula } from '@/lib/lists/export/model';
import { sanitizeFilename } from '@/lib/export/download';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv;charset=utf-8';

/** A cell: text, a figure, or empty. */
export type ExportCell = string | number | null;

export interface ExportTable {
  /** The worksheet's name (XLSX), cut to Excel's 31 characters. */
  name: string;
  /** The column headings; empty for a table that carries its own heading rows (the urban indicators). */
  header: readonly string[];
  /** The rows as the sheet prints them: same order, same rows, figures unformatted. An empty row is a gap. */
  rows: readonly (readonly ExportCell[])[];
  /** Rows set in bold (totals, a heading row inside the table), by index in `rows`. */
  bold?: readonly number[];
  /** Columns that hold figures (right-aligned in XLSX). */
  numeric?: readonly number[];
  /** What a figure column measures, by column index: the XLSX gives its cells the project's decimals for that kind (#88). */
  kinds?: Readonly<Record<number, NumberKind>>;
  /** Lines the sheet prints under the table (notes, rules), one cell each. */
  notes?: readonly string[];
  /** Rows the file adds that the sheet does not print (a total row), after `rows`. */
  footer?: readonly (readonly ExportCell[])[];
  /** Part of the workbook only: not in the CSV (the Elements sheet of a joinery schedule). */
  workbookOnly?: boolean;
}

export interface ScheduleExport {
  /** The schedule's title, the bold first row of every worksheet. */
  title: string;
  tables: readonly ExportTable[];
}

const BOM = '﻿';

/**
 * The delimiter a spreadsheet in `locale` splits a double-clicked .csv on: Excel takes the system's list separator, which is `;`
 * wherever the decimal mark is a comma (Romanian, German, French ...) and `,` elsewhere. The figures stay `.`-decimal either way.
 */
export function csvDelimiter(locale: SheetLocale): ',' | ';' {
  // The project's separator (#88) decides it like the language does: a comma project opens in a spreadsheet that wants `;`.
  return decimalMarkOf(locale) === ',' ? ';' : ',';
}

/** One CSV cell: text is guarded (a number-shaped identifier like `-007` too), a figure is written as is. */
function csvCell(v: ExportCell, delimiter: string): string {
  if (v === null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? escapeCsvCell(String(v), { delimiter, exemptNumbers: true }) : '';
  return escapeCsvCell(v, { delimiter, exemptNumbers: false });
}

/** The CSV of the schedule: the tables that are not workbook-only, a blank line between them, the notes under each. */
export function exportCsv(data: ScheduleExport, options: { delimiter?: string } = {}): string {
  const delimiter = options.delimiter ?? ',';
  const line = (cells: readonly ExportCell[]) => cells.map((c) => csvCell(c, delimiter)).join(delimiter);
  const blocks = data.tables.filter((t) => !t.workbookOnly).map((t) => [
    ...(t.header.length ? [line(t.header)] : []),
    ...t.rows.map(line),
    ...(t.footer ?? []).map(line),
    ...(t.notes ?? []).map((n) => line([n])),
  ].join('\r\n'));
  return `${BOM}${blocks.join('\r\n\r\n')}\r\n`;
}

const guarded = (v: ExportCell): ExportCell => (typeof v === 'string' ? neutralizeSpreadsheetFormula(v) : v);

/** The workbook of the schedule: a worksheet per table, the title over it, figures as numeric cells. */
export async function exportXlsx(data: ScheduleExport, options: { locale?: SheetLocale } = {}): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IFC-Lite';
  for (const table of data.tables) {
    const ws = wb.addWorksheet(sheetName(table.name) || 'Sheet', { views: [{ state: 'frozen', ySplit: table.header.length ? 2 : 1 }] });
    const width = Math.max(table.header.length, ...table.rows.map((r) => r.length), 1);
    ws.addRow([neutralizeSpreadsheetFormula(data.title)]);
    if (width > 1) ws.mergeCells(1, 1, 1, width);
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    if (table.header.length) {
      const h = ws.addRow(table.header.map(guarded));
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; });
    }
    for (let i = 0; i < width; i++) {
      const col = ws.getColumn(i + 1);
      const longest = Math.max(table.header[i]?.length ?? 0, ...table.rows.map((r) => (typeof r[i] === 'string' ? (r[i] as string).length : 0)));
      col.width = Math.max(10, Math.min(40, longest + 4));
      if (table.numeric?.includes(i)) col.alignment = { horizontal: 'right' };
    }
    const bold = new Set(table.bold ?? []);
    const figures = (row: ExcelJS.Row): void => { for (const [col, kind] of Object.entries(table.kinds ?? {})) { const fmt = options.locale === undefined ? undefined : numberFormatCode(options.locale, kind); const cell = row.getCell(Number(col) + 1); if (fmt && typeof cell.value === 'number') cell.numFmt = fmt; } };
    table.rows.forEach((r, i) => { const row = ws.addRow(r.map(guarded)); figures(row); if (bold.has(i)) row.font = { bold: true }; });
    for (const r of table.footer ?? []) { const row = ws.addRow(r.map(guarded)); figures(row); row.font = { bold: true }; }
    for (const n of table.notes ?? []) ws.addRow([neutralizeSpreadsheetFormula(n)]);
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME });
}

/**
 * The number format of a figure of `kind` in an XLSX cell: its decimals when the project sets them (`0.00`, with the thousands
 * grouping the sheet prints for areas and volumes unless the project turned it off), else none, so a project that sets nothing
 * writes the cells it always wrote.
 */
export function numberFormatCode(locale: SheetLocale, kind: NumberKind): string | undefined {
  const places = decimalsOf(locale, kind, -1);
  if (places < 0) return undefined;
  const grouped = !groupingOff(locale) && (kind === 'area' || kind === 'volume');
  return `${grouped ? '#,##0' : '0'}${places > 0 ? `.${'0'.repeat(places)}` : ''}`;
}

/** Excel's worksheet names: 31 characters, none of `\ / ? * [ ] :`. */
const sheetName = (name: string): string => name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);

/**
 * The file's name: the schedule's name as the person typed it (letters of any script stay, what a file name cannot hold becomes `-`,
 * `sanitizeFilename`), or `fallback` (a plain ASCII word in the interface's language) when it leaves nothing; then the extension.
 */
export function scheduleFileName(name: string, fallback: string, extension: 'csv' | 'xlsx'): string {
  return `${sanitizeFilename(name, { fallback })}.${extension}`;
}
