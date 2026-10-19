/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room finishes as a table on paper, in the joinery schedule's primitives
 * (paper millimetres), so it places, prints and exports to DXF the same way:
 * title, a header, a line per finish of each room. The CSV and XLSX share the
 * same lines (`finishLines`).
 */

import { escapeCsvCell } from '@ifc-lite/export';
import type { ScheduleLayout, SchedulePrim } from './schedule-layout';
import { finishLines, SURFACES, type FinishLine, type RoomFinishes } from './room-finishes';

export interface RoomFinishLabels {
  title: string;
  number: string;
  room: string;
  level: string;
  floor: string;
  wall: string;
  ceiling: string;
  /** The area column's heading, with its unit. */
  area: string;
}

const ROW = 6;
const TEXT = 2.5;
const PAD = 1.5;
const COLUMNS = [14, 34, 22, 40, 14, 40, 14, 40, 14] as const;
const PEN = { frame: 0.35, grid: 0.18 } as const;

const fixed = (v: number | null, digits = 2): string => (v === null ? '–' : v.toFixed(digits));

/** The header cells: three room columns, then a finish and an area per surface. */
export function finishHeader(labels: RoomFinishLabels): string[] {
  return [labels.number, labels.room, labels.level, ...SURFACES.flatMap((s) => [labels[s], labels.area])];
}

/** A line's cells as numbers-or-text: room, then name and area of each surface. */
function cells(l: FinishLine, area: (v: number | null) => string): string[] {
  return [
    l.first ? l.number : '', l.first ? l.name : '', l.first ? l.level : '',
    ...SURFACES.flatMap((s) => (l[s] ? [l[s].name, area(l[s].area)] : ['', ''])),
  ];
}

export function layoutRoomFinishes(rooms: readonly RoomFinishes[], labels: RoomFinishLabels): ScheduleLayout {
  const prims: SchedulePrim[] = [];
  const width = COLUMNS.reduce((a, b) => a + b, 0);
  const lefts = COLUMNS.map((_, i) => COLUMNS.slice(0, i).reduce((a, b) => a + b, 0));
  const titleH = 10;
  const lines = finishLines(rooms);
  const table = [
    { cells: finishHeader(labels), bold: true, rule: true },
    // A rule under the last line of each room.
    ...lines.map((l, i) => ({ cells: cells(l, fixed), bold: false, rule: i === lines.length - 1 || lines[i + 1].first })),
  ];
  const height = titleH + table.length * ROW;
  prims.push({ kind: 'text', x: 0, y: titleH - 3, text: labels.title, size: 4, anchor: 'start', bold: true });
  table.forEach((row, r) => {
    const top = titleH + r * ROW;
    row.cells.forEach((text, c) => {
      const numeric = c >= 3 && c % 2 === 0;
      const x = numeric ? lefts[c] + COLUMNS[c] - PAD : lefts[c] + PAD;
      if (text) prims.push({ kind: 'text', x, y: top + ROW / 2 + TEXT * 0.35, text, size: TEXT, anchor: numeric ? 'end' : 'start', bold: row.bold });
    });
    prims.push({ kind: 'line', x1: 0, y1: top + ROW, x2: width, y2: top + ROW, w: r === 0 ? PEN.frame : row.rule ? PEN.grid : 0 });
  });
  prims.push({ kind: 'line', x1: 0, y1: titleH, x2: width, y2: titleH, w: PEN.frame });
  for (const x of [...lefts, width]) prims.push({ kind: 'line', x1: x, y1: titleH, x2: x, y2: height, w: x === 0 || x === width ? PEN.frame : PEN.grid });
  return { width, height, prims: prims.filter((p) => p.kind !== 'line' || p.w > 0) };
}

/** The table's rows for CSV and XLSX: the room on every line, areas unformatted ('' when the model gives none). */
export function finishRows(rooms: readonly RoomFinishes[]): (string | number | null)[][] {
  return finishLines(rooms).map((l) => [
    l.number, l.name, l.level,
    ...SURFACES.flatMap((s) => [l[s]?.name ?? '', l[s]?.area ?? null]),
  ]);
}

/** The finishes as CSV; room and finish names are model text, so every cell is formula-guarded (#1506). */
export function roomFinishesCsv(rooms: readonly RoomFinishes[], labels: RoomFinishLabels): string {
  const lines = [finishHeader(labels), ...finishRows(rooms).map((r) => r.map((v) => (v === null ? '' : String(v))))];
  return lines.map((l) => l.map((c) => escapeCsvCell(c)).join(',')).join('\n');
}
