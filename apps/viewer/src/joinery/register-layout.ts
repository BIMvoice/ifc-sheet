/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing register as a table on paper, in the schedule's primitives
 * (paper millimetres), so it places, prints and exports to DXF the way the
 * other schedules do: title, a header, one line per sheet of the set.
 *
 * A register taller than its sheet's drawing area is first drawn smaller,
 * down to text of `REGISTER_MIN_TEXT_MM`, and past that split into pages of
 * that size, each with its title and header: the first page on the register's
 * own sheet, the next ones on continuation sheets (`syncRegisterPages`).
 */

import type { RegisterRow } from '@/project/drawing-register';
import type { ScheduleLayout, SchedulePrim } from './schedule-layout';
import type { ExportTable } from './schedule-export';

export interface RegisterLabels {
  title: string;
  number: string;
  sheetTitle: string;
  scale: string;
  revision: string;
  date: string;
}

/** Full size, paper mm: row height, text height, cell padding, column widths. */
const ROW_MM = 6;
const TEXT_MM = 2.5;
const PAD_MM = 1.5;
const COLUMN_MM = [24, 120, 28, 22, 28] as const;
const PEN = { frame: 0.35, grid: 0.18 } as const;
const TITLE_H = 10;
const TITLE_TEXT = 4;

/** The smallest text a register is shrunk to before it is split into pages, paper mm. */
export const REGISTER_MIN_TEXT_MM = 1.8;
/** Clear paper kept above and below the table in the drawing area, mm. */
const FIT_MARGIN_MM = 5;

/** How a register of `rows` sheets is drawn in a drawing area `areaHeight` mm tall: at what size, and in how many pages of how many rows. */
export interface RegisterFit {
  /** Size against the table's full size (text `2.5 × scale` mm). */
  scale: number;
  perPage: number;
  pages: number;
}

export function registerFit(rows: number, areaHeight: number): RegisterFit {
  const room = areaHeight - 2 * FIT_MARGIN_MM;
  const whole = room / (TITLE_H + (rows + 1) * ROW_MM);
  if (whole >= 1) return { scale: 1, perPage: Math.max(rows, 1), pages: 1 };
  const smallest = REGISTER_MIN_TEXT_MM / TEXT_MM;
  if (whole >= smallest) return { scale: whole, perPage: Math.max(rows, 1), pages: 1 };
  const perPage = Math.max(1, Math.floor((room / smallest - TITLE_H) / ROW_MM) - 1);
  return { scale: smallest, perPage, pages: Math.ceil(rows / perPage) };
}

/** Page `page` (from 0) of the register under `fit`: its rows, and `title (2/3)` once there are several pages. */
export function layoutRegisterPage(rows: readonly RegisterRow[], labels: RegisterLabels, fit: RegisterFit, page: number): ScheduleLayout {
  const own = rows.slice(page * fit.perPage, (page + 1) * fit.perPage);
  const title = fit.pages > 1 ? `${labels.title} (${page + 1}/${fit.pages})` : labels.title;
  return layoutRegister(own, { ...labels, title }, fit.scale);
}

/** The table at `scale` times its full size (text 2.5 mm, rows 6 mm). */
export function layoutRegister(rows: readonly RegisterRow[], labels: RegisterLabels, scale = 1): ScheduleLayout {
  const prims: SchedulePrim[] = [];
  const k = scale;
  const row = ROW_MM * k;
  const text = TEXT_MM * k;
  const pad = PAD_MM * k;
  const columns = COLUMN_MM.map((c) => c * k);
  const width = columns.reduce((a, b) => a + b, 0);
  const lefts = columns.map((_, i) => columns.slice(0, i).reduce((a, b) => a + b, 0));
  const titleH = TITLE_H * k;
  const table: string[][] = [
    [labels.number, labels.sheetTitle, labels.scale, labels.revision, labels.date],
    ...rows.map((r) => [r.number, r.title, r.scale, r.revision, r.date]),
  ];
  const height = titleH + table.length * row;
  prims.push({ kind: 'text', x: 0, y: titleH - 3 * k, text: labels.title, size: TITLE_TEXT * k, anchor: 'start', bold: true });
  table.forEach((cells, r) => {
    const top = titleH + r * row;
    cells.forEach((value, c) => {
      if (value) prims.push({ kind: 'text', x: lefts[c] + pad, y: top + row / 2 + text * 0.35, text: value, size: text, anchor: 'start', bold: r === 0 });
    });
    prims.push({ kind: 'line', x1: 0, y1: top + row, x2: width, y2: top + row, w: r === 0 || r === table.length - 1 ? PEN.frame : PEN.grid });
  });
  prims.push({ kind: 'line', x1: 0, y1: titleH, x2: width, y2: titleH, w: PEN.frame });
  for (const x of [...lefts, width]) prims.push({ kind: 'line', x1: x, y1: titleH, x2: x, y2: height, w: x === 0 || x === width ? PEN.frame : PEN.grid });
  return { width, height, prims };
}

/** The register as the table of its CSV and XLSX: every sheet of the set, whatever pages the table is drawn over. */
export function registerTable(rows: readonly RegisterRow[], labels: RegisterLabels): ExportTable {
  return {
    name: labels.title || labels.number, header: [labels.number, labels.sheetTitle, labels.scale, labels.revision, labels.date],
    rows: rows.map((r) => [r.number, r.title, r.scale, r.revision, r.date]),
  };
}
