/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit's areas and urban indicators as a table on paper, in the
 * joinery schedule's primitives (paper millimetres), so it places, prints
 * and exports to DXF like the other schedules: the storeys with their
 * elevation against ±0.00, built and useful areas and whether Ad for CUT
 * counts them, the useful area by room category, then Ac, Ad, Ad for CUT,
 * Au, the site area, POT and CUT, and under them the rules they were
 * measured by. A figure the model does not give prints as "—".
 */

import type { ScheduleLayout, SchedulePrim } from '@/joinery/schedule-layout';
import type { UrbanIndicators } from './indicators';

export interface UrbanLabels {
  title: string;
  level: string;
  elevation: string;
  built: string;
  useful: string;
  /** The column saying whether Ad for CUT counts a storey, and its two answers. */
  inCut: string;
  yes: string;
  no: string;
  belowGround: (name: string) => string;
  /** The storey containing ±0.00, Ac's. */
  ground: (name: string) => string;
  category: string;
  area: string;
  ac: string;
  ad: string;
  adCut: string;
  au: string;
  site: string;
  pot: string;
  cut: string;
  /** The rule lines printed under the table, from the figures they explain. */
  rules: (r: UrbanIndicators) => string[];
  /** A remark printed under the table (levels whose holes were all counted), or empty. */
  note: string;
  /** A figure that is a lower bound: `≥ 120.00`. */
  atLeast: (value: string) => string;
  /** The footnote for a level with elements that could not be measured. */
  unmeasured: (count: number, level: string) => string;
}

/** An elevation as drawings write it: +2.70, -1.50, ±0.00. */
export function signedLevel(v: number): string {
  const text = Math.abs(v).toFixed(2);
  return text === '0.00' ? '±0.00' : `${v < 0 ? '-' : '+'}${text}`;
}

const ROW = 6;
const TEXT = 2.5;
const PAD = 1.5;
const GAP = 4;
const TITLE_H = 10;
/** Level, elevation, built, useful, in Ad for CUT; the two-column tables span the same width. */
const STOREY_COLUMNS = [56, 20, 28, 28, 14] as const;
/** About the characters a 2 mm note line holds across the table. */
const NOTE_CHARS = 120;
const WIDTH = STOREY_COLUMNS.reduce((a, b) => a + b, 0);
const PAIR_COLUMNS = [WIDTH - 30, 30] as const;
const PEN = { frame: 0.35, grid: 0.18 } as const;

export const NONE = '—';
const m2 = (v: number | null): string => (v === null ? NONE : v.toFixed(2));

/** One ruled table from `top`, its first row a bold header when `header`; columns after the first are right-aligned figures. Returns its bottom. */
function table(prims: SchedulePrim[], top: number, columns: readonly number[], rows: readonly string[][], header: boolean): number {
  const lefts = columns.map((_, i) => columns.slice(0, i).reduce((a, b) => a + b, 0));
  rows.forEach((cells, r) => {
    const y = top + r * ROW;
    const bold = header && r === 0;
    cells.forEach((text, c) => {
      const figure = c > 0;
      prims.push({ kind: 'text', x: figure ? lefts[c] + columns[c] - PAD : lefts[c] + PAD, y: y + ROW / 2 + TEXT * 0.35, text, size: TEXT, anchor: figure ? 'end' : 'start', bold });
    });
    prims.push({ kind: 'line', x1: 0, y1: y + ROW, x2: WIDTH, y2: y + ROW, w: (header && r === 0) || r === rows.length - 1 ? PEN.frame : PEN.grid });
  });
  const bottom = top + rows.length * ROW;
  prims.push({ kind: 'line', x1: 0, y1: top, x2: WIDTH, y2: top, w: PEN.frame });
  for (const x of [...lefts, WIDTH]) prims.push({ kind: 'line', x1: x, y1: top, x2: x, y2: bottom, w: x === 0 || x === WIDTH ? PEN.frame : PEN.grid });
  return bottom;
}

export function layoutUrban(r: UrbanIndicators, labels: UrbanLabels): ScheduleLayout {
  const low = (text: string, atLeast: boolean) => (atLeast && text !== NONE ? labels.atLeast(text) : text);
  const prims: SchedulePrim[] = [{ kind: 'text', x: 0, y: TITLE_H - 3, text: labels.title, size: 4, anchor: 'start', bold: true }];
  let y = table(prims, TITLE_H, STOREY_COLUMNS, [
    [labels.level, labels.elevation, labels.built, labels.useful, labels.inCut],
    ...r.storeys.map((s) => [
      s.belowGround ? labels.belowGround(s.name) : s.ground ? labels.ground(s.name) : s.name,
      signedLevel(s.elevation), low(m2(s.builtArea), s.unmeasured > 0), m2(s.usefulArea), s.inCut ? labels.yes : labels.no,
    ]),
  ], true);
  if (r.auByCategory.length) {
    y = table(prims, y + GAP, PAIR_COLUMNS, [[labels.category, labels.area], ...r.auByCategory.map((c) => [c.category, m2(c.area)])], true);
  }
  y = table(prims, y + GAP, PAIR_COLUMNS, [
    [labels.ac, low(m2(r.ac), r.acAtLeast)],
    [labels.ad, low(m2(r.ad), r.adAtLeast)],
    [labels.adCut, low(m2(r.adCut), r.adCutAtLeast)],
    [labels.au, m2(r.au)],
    [labels.site, m2(r.siteArea)],
    [labels.pot, low(r.pot === null ? NONE : `${r.pot.toFixed(2)} %`, r.acAtLeast)],
    [labels.cut, low(r.cut === null ? NONE : r.cut.toFixed(2), r.adCutAtLeast)],
  ], false);
  const notes = [
    ...labels.rules(r),
    ...r.storeys.filter((s) => s.unmeasured > 0).map((s) => labels.unmeasured(s.unmeasured, s.name)),
    ...(labels.note ? [labels.note] : []),
  ].flatMap((note) => wrapNote(note));
  for (const note of notes) {
    y += GAP;
    prims.push({ kind: 'text', x: 0, y, text: note, size: 2, anchor: 'start' });
  }
  if (notes.length) y += 1;
  return { width: WIDTH, height: y, prims };
}

/** A note broken at spaces into lines of about `chars` characters (2 mm text). */
export function wrapNote(note: string, chars = NOTE_CHARS): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of note.split(' ')) {
    if (line && line.length + 1 + word.length > chars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
