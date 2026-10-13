/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material takeoff as a table on paper, in the joinery schedule's
 * primitives (paper millimetres), so it places, prints and exports to DXF
 * the same way: title, a header, one row per material, a total.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import type { ScheduleLayout, SchedulePrim } from './schedule-layout';
import type { TakeoffRow } from './material-takeoff';

export interface TakeoffLabels {
  title: string;
  material: string;
  elements: string;
  volume: string;
  area: string;
  usedIn: string;
  total: string;
}

const ROW = 6;
const TEXT = 2.5;
const PAD = 1.5;
const COLUMNS = [62, 18, 24, 24, 70] as const;
const PEN = { frame: 0.35, grid: 0.18 } as const;

const fixed = (v: number | null, digits = 2): string => (v === null ? '–' : v.toFixed(digits));

/** The `IfcWall` style class names, without the prefix, for people. */
const plainClass = (c: string): string => c.replace(/^Ifc/, '');

export function layoutMaterialTakeoff(rows: readonly TakeoffRow[], labels: TakeoffLabels): ScheduleLayout {
  const prims: SchedulePrim[] = [];
  const width = COLUMNS.reduce((a, b) => a + b, 0);
  const lefts = COLUMNS.map((_, i) => COLUMNS.slice(0, i).reduce((a, b) => a + b, 0));
  const titleH = 10;
  const sum = (key: 'volume' | 'area'): number | null => (rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null);
  const table: string[][] = [
    [labels.material, labels.elements, labels.volume, labels.area, labels.usedIn],
    ...rows.map((r) => [r.material, String(r.elements), fixed(r.volume), fixed(r.area), r.classes.map(plainClass).join(', ')]),
    [labels.total, String(rows.reduce((s, r) => s + r.elements, 0)), fixed(sum('volume')), fixed(sum('area')), ''],
  ];
  const height = titleH + table.length * ROW;
  prims.push({ kind: 'text', x: 0, y: titleH - 3, text: labels.title, size: 4, anchor: 'start', bold: true });
  table.forEach((cells, r) => {
    const top = titleH + r * ROW;
    const bold = r === 0 || r === table.length - 1;
    cells.forEach((text, c) => {
      const numeric = c >= 1 && c <= 3;
      const x = numeric ? lefts[c] + COLUMNS[c] - PAD : lefts[c] + PAD;
      prims.push({ kind: 'text', x, y: top + ROW / 2 + TEXT * 0.35, text, size: TEXT, anchor: numeric ? 'end' : 'start', bold });
    });
    prims.push({ kind: 'line', x1: 0, y1: top + ROW, x2: width, y2: top + ROW, w: r === 0 || r === table.length - 2 ? PEN.frame : PEN.grid });
  });
  prims.push({ kind: 'line', x1: 0, y1: titleH, x2: width, y2: titleH, w: PEN.frame });
  for (const x of [...lefts, width]) prims.push({ kind: 'line', x1: x, y1: titleH, x2: x, y2: height, w: x === 0 || x === width ? PEN.frame : PEN.grid });
  return { width, height, prims };
}

/** The takeoff as CSV, numbers unformatted; material names are model text, so every cell is formula-guarded (#1506). */
export function takeoffCsv(rows: readonly TakeoffRow[], labels: TakeoffLabels): string {
  const cell = (v: string) => escapeCsvCell(v);
  const lines = [[labels.material, labels.elements, labels.volume, labels.area, labels.usedIn]];
  for (const r of rows) lines.push([r.material, String(r.elements), r.volume === null ? '' : String(r.volume), r.area === null ? '' : String(r.area), r.classes.join(' ')]);
  return lines.map((l) => l.map(cell).join(',')).join('\n');
}
