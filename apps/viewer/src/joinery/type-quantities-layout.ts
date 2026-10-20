/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The quantities by type as a table on paper, in the joinery schedule's
 * primitives (paper millimetres), so it places, prints and exports to DXF the
 * same way: title, a header, per type a line per storey (and a total line when
 * the type spans several), then a total per IFC class of element (no total
 * across classes, see `TypeQuantities.classTotals`). The CSV and XLSX share
 * the same lines.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import type { ScheduleLayout, SchedulePrim } from './schedule-layout';
import type { Totals, TypeQuantities } from './type-quantities';

export interface TypeQuantityLabels {
  title: string;
  type: string;
  class: string;
  level: string;
  count: string;
  length: string;
  area: string;
  volume: string;
  noQto: string;
  total: string;
  noType: string;
  /** The level of an element on no storey. */
  noLevel: string;
}

export interface TypeQuantityLine {
  /** The type's name, or its class and the "(no type)" label. */
  type: string;
  className: string;
  /** The storey, the "total" label on a type's total line. */
  level: string;
  totals: Totals;
  /** The first line of its type; each class total is its own first line. */
  first: boolean;
  total: boolean;
  /** A total per class of element, after the type rows. */
  classTotal: boolean;
}

const plainClass = (c: string): string => c.replace(/^Ifc/, '');

/** The table's lines, in print order. */
export function typeQuantityLines(data: TypeQuantities, labels: TypeQuantityLabels): TypeQuantityLine[] {
  const lines: TypeQuantityLine[] = [];
  for (const row of data.rows) {
    const type = row.typeName ?? `${plainClass(row.className)} ${labels.noType}`;
    const base = { type, className: row.className };
    const levels = data.levels.filter((l) => row.byLevel[l]);
    levels.forEach((l, i) => lines.push({ ...base, level: l || labels.noLevel, totals: row.byLevel[l], first: i === 0, total: false, classTotal: false }));
    if (levels.length > 1) lines.push({ ...base, level: labels.total, totals: row.total, first: false, total: true, classTotal: false });
  }
  for (const c of data.classTotals) lines.push({ type: labels.total, className: c.className, level: '', totals: c.total, first: true, total: true, classTotal: true });
  return lines;
}

const ROW = 6;
const TEXT = 2.5;
const PAD = 1.5;
const COLUMNS = [58, 28, 28, 14, 20, 20, 20, 14] as const;
const PEN = { frame: 0.35, grid: 0.18 } as const;

const fixed = (v: number | null, digits = 2): string => (v === null ? '–' : v.toFixed(digits));

export function layoutTypeQuantities(data: TypeQuantities, labels: TypeQuantityLabels): ScheduleLayout {
  const prims: SchedulePrim[] = [];
  const width = COLUMNS.reduce((a, b) => a + b, 0);
  const lefts = COLUMNS.map((_, i) => COLUMNS.slice(0, i).reduce((a, b) => a + b, 0));
  const titleH = 10;
  const lines = typeQuantityLines(data, labels);
  const table: { cells: string[]; bold: boolean; rule: boolean; frameBelow?: boolean }[] = [
    { cells: [labels.type, labels.class, labels.level, labels.count, labels.length, labels.area, labels.volume, labels.noQto], bold: true, rule: true },
    ...lines.map((l, i) => ({
      cells: [l.first ? l.type : '', l.first ? plainClass(l.className) : '', l.level, String(l.totals.count), fixed(l.totals.length), fixed(l.totals.area), fixed(l.totals.volume), l.totals.noQto ? String(l.totals.noQto) : ''],
      bold: l.total,
      // A rule under the last line of each type.
      rule: i === lines.length - 1 || lines[i + 1].first,
      // A frame rule above the class totals.
      frameBelow: !l.classTotal && lines[i + 1]?.classTotal === true,
    })),
  ];
  const height = titleH + table.length * ROW;
  prims.push({ kind: 'text', x: 0, y: titleH - 3, text: labels.title, size: 4, anchor: 'start', bold: true });
  table.forEach((row, r) => {
    const top = titleH + r * ROW;
    row.cells.forEach((text, c) => {
      const numeric = c >= 3;
      const x = numeric ? lefts[c] + COLUMNS[c] - PAD : lefts[c] + PAD;
      if (text) prims.push({ kind: 'text', x, y: top + ROW / 2 + TEXT * 0.35, text, size: TEXT, anchor: numeric ? 'end' : 'start', bold: row.bold });
    });
    prims.push({ kind: 'line', x1: 0, y1: top + ROW, x2: width, y2: top + ROW, w: r === 0 || row.frameBelow ? PEN.frame : row.rule ? PEN.grid : 0 });
  });
  prims.push({ kind: 'line', x1: 0, y1: titleH, x2: width, y2: titleH, w: PEN.frame });
  for (const x of [...lefts, width]) prims.push({ kind: 'line', x1: x, y1: titleH, x2: x, y2: height, w: x === 0 || x === width ? PEN.frame : PEN.grid });
  return { width, height, prims: prims.filter((p) => p.kind !== 'line' || p.w > 0) };
}

/** The table as CSV, numbers unformatted, the type on every line; type names are model text, so every cell is formula-guarded (#1506). */
export function typeQuantitiesCsv(data: TypeQuantities, labels: TypeQuantityLabels): string {
  const num = (v: number | null) => (v === null ? '' : String(v));
  const lines = [[labels.type, labels.class, labels.level, labels.count, labels.length, labels.area, labels.volume, labels.noQto]];
  for (const l of typeQuantityLines(data, labels)) lines.push([l.type, l.className, l.level, String(l.totals.count), num(l.totals.length), num(l.totals.area), num(l.totals.volume), String(l.totals.noQto)]);
  return lines.map((l) => l.map((c) => escapeCsvCell(c)).join(',')).join('\n');
}
