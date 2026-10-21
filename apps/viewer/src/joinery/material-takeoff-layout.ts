/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material takeoff as a table on paper, in the joinery schedule's
 * primitives (paper millimetres), so it places, prints and exports to DXF
 * the same way: title, a header, one row per material, a total.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import type { ScheduleLayout } from './schedule-layout';
import { layoutPagedTable, PEN, type PagedOptions, type TableBlock } from './paged-table';
import type { TakeoffRow } from './material-takeoff';

export interface TakeoffLabels {
  title: string;
  material: string;
  elements: string;
  volume: string;
  area: string;
  usedIn: string;
  total: string;
  /** How the table's figures are written as text on the sheet. Default `toFixed`; the CSV never uses it. */
  number?: (value: number, digits: number) => string;
}

const COLUMNS = [62, 18, 24, 24, 70] as const;

/** The `IfcWall` style class names, without the prefix, for people. */
const plainClass = (c: string): string => c.replace(/^Ifc/, '');

export function layoutMaterialTakeoff(rows: readonly TakeoffRow[], labels: TakeoffLabels, paging: PagedOptions = {}): ScheduleLayout {
  const fixed = (v: number | null, digits = 2): string => (v === null ? '–' : labels.number ? labels.number(v, digits) : v.toFixed(digits));
  const sum = (key: 'volume' | 'area'): number | null => (rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null);
  const table: string[][] = [
    ...rows.map((r) => [r.material, String(r.elements), fixed(r.volume), fixed(r.area), r.classes.map(plainClass).join(', ')]),
    [labels.total, String(rows.reduce((s, r) => s + r.elements, 0)), fixed(sum('volume')), fixed(sum('area')), ''],
  ];
  const block: TableBlock = {
    columns: COLUMNS, header: [labels.material, labels.elements, labels.volume, labels.area, labels.usedIn], numeric: (c) => c >= 1 && c <= 3,
    // A frame rule above the total.
    rows: table.map((cells, i) => ({ cells, bold: i === table.length - 1, rule: i === table.length - 2 ? PEN.frame : PEN.grid })),
  };
  return layoutPagedTable(labels.title, 4, [{ kind: 'table', block }], paging);
}

/** The takeoff as CSV, numbers unformatted; material names are model text, so every cell is formula-guarded (#1506). */
export function takeoffCsv(rows: readonly TakeoffRow[], labels: TakeoffLabels): string {
  const cell = (v: string) => escapeCsvCell(v);
  const lines = [[labels.material, labels.elements, labels.volume, labels.area, labels.usedIn]];
  for (const r of rows) lines.push([r.material, String(r.elements), r.volume === null ? '' : String(r.volume), r.area === null ? '' : String(r.area), r.classes.join(' ')]);
  return lines.map((l) => l.map(cell).join(',')).join('\n');
}
