/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing register as a table on paper, in the schedule's primitives
 * (paper millimetres), so it places, prints and exports to DXF the way the
 * other schedules do: title, a header, one line per sheet of the set.
 */

import type { RegisterRow } from '@/project/drawing-register';
import type { ScheduleLayout, SchedulePrim } from './schedule-layout';

export interface RegisterLabels {
  title: string;
  number: string;
  sheetTitle: string;
  scale: string;
  revision: string;
  date: string;
}

const ROW = 6;
const TEXT = 2.5;
const PAD = 1.5;
const COLUMNS = [24, 120, 28, 22, 28] as const;
const PEN = { frame: 0.35, grid: 0.18 } as const;

export function layoutRegister(rows: readonly RegisterRow[], labels: RegisterLabels): ScheduleLayout {
  const prims: SchedulePrim[] = [];
  const width = COLUMNS.reduce((a, b) => a + b, 0);
  const lefts = COLUMNS.map((_, i) => COLUMNS.slice(0, i).reduce((a, b) => a + b, 0));
  const titleH = 10;
  const table: string[][] = [
    [labels.number, labels.sheetTitle, labels.scale, labels.revision, labels.date],
    ...rows.map((r) => [r.number, r.title, r.scale, r.revision, r.date]),
  ];
  const height = titleH + table.length * ROW;
  prims.push({ kind: 'text', x: 0, y: titleH - 3, text: labels.title, size: 4, anchor: 'start', bold: true });
  table.forEach((cells, r) => {
    const top = titleH + r * ROW;
    cells.forEach((text, c) => {
      if (text) prims.push({ kind: 'text', x: lefts[c] + PAD, y: top + ROW / 2 + TEXT * 0.35, text, size: TEXT, anchor: 'start', bold: r === 0 });
    });
    prims.push({ kind: 'line', x1: 0, y1: top + ROW, x2: width, y2: top + ROW, w: r === 0 || r === table.length - 1 ? PEN.frame : PEN.grid });
  });
  prims.push({ kind: 'line', x1: 0, y1: titleH, x2: width, y2: titleH, w: PEN.frame });
  for (const x of [...lefts, width]) prims.push({ kind: 'line', x1: x, y1: titleH, x2: x, y2: height, w: x === 0 || x === width ? PEN.frame : PEN.grid });
  return { width, height, prims };
}
