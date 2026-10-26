/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities (antemasuratoare, #75) as a table on paper, in the joinery schedule's primitives (paper millimetres), so it places,
 * prints and exports to DXF the same way: title, a header (Nr. crt., Cod articol, Denumire, U.M., Cantitate), a row per article and, when the
 * schedule asks, a row per type under it; under the table, what was refused, left out or only partly counted. The rows are the engine's
 * `boqTable` (the one the XLSX and CSV write), so the file holds the rows the sheet prints.
 */

import { boqTable, textWidthEm, truncateToWidth, type BoqCell, type BoqResult, type BoqSay } from '@bimvoice/ifcsheet';
import { sheetNumber, type SheetLocale } from '@bimvoice/ifcsheet/names';
import type { ScheduleLayout } from './schedule-layout';
import { layoutPagedTable, PEN, TEXT, type PagedOptions, type TableBlock, type TableItem } from './paged-table';

export interface BoqSheetLabels {
  /** The language the figures on paper are written in ("12,50" in Romanian); the CSV and XLSX never use it. */
  locale: SheetLocale;
  title: string;
  say: BoqSay;
  /** A row per type under each article. */
  detail: boolean;
}

/** Number, code, description, unit, quantity. */
const COLUMNS = [14, 34, 120, 14, 28] as const;
const NOTE_SIZE = 2.2;
const NOTE_H = 3.6;
const WIDTH = COLUMNS.reduce((a, b) => a + b, 0);

/** `text` broken into lines that fit `width` mm at `size`, at spaces. */
function wrap(text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidthEm(next) * size > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A cell cut at its column's width with "…" (the file keeps it whole). */
const fit = (text: string, column: number, bold: boolean): string => (textWidthEm(text, bold) * TEXT <= column - 3 ? text : truncateToWidth(text, (column - 3) / TEXT, bold));

export function layoutBoq(result: BoqResult, labels: BoqSheetLabels, paging: PagedOptions = {}): ScheduleLayout {
  const table = boqTable(result, labels.say, { title: labels.title, detail: labels.detail });
  const bold = new Set(table.bold);
  const shown = (v: BoqCell): string => (v === null ? '–' : typeof v === 'number' ? sheetNumber(labels.locale, v) : v);
  const block: TableBlock = {
    columns: COLUMNS, header: table.header, numeric: (c) => c === 0 || c === 4, skipEmpty: true,
    rows: table.rows.map((row, i) => {
      const isBold = bold.has(i);
      // The number is a whole number; only the quantity is a measured figure.
      const cells = row.map((v, c) => fit(c === 0 ? (v === '' || v === null ? '' : String(v)) : c === 4 ? shown(v) : String(v ?? ''), COLUMNS[c], isBold));
      // A rule under every article; the detail rows under it are lighter.
      const last = i === table.rows.length - 1;
      return { cells, bold: isBold, rule: last || !table.rows[i + 1] || table.rows[i + 1][0] !== '' ? PEN.grid : 0 };
    }),
  };
  const notes: TableItem[] = table.notes.flatMap((note) => wrap(note, WIDTH, NOTE_SIZE).map((text): TableItem => ({ kind: 'text', h: NOTE_H, dy: NOTE_H * 0.75, size: NOTE_SIZE, text })));
  const items: TableItem[] = [{ kind: 'table', block }, ...(notes.length > 0 ? [{ kind: 'gap', h: 2 } as TableItem, ...notes] : [])];
  return layoutPagedTable(labels.title, 4, items, paging);
}
