/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a site plan puts its own north arrow and scale bar on the paper: in a
 * free spot (`freeSpot`) of its viewport — a corner first, else anywhere
 * across it — clear by a few millimetres of the setback dimensions and their
 * values, the coordinate labels, the plot boundary and the footprint; beside
 * the viewport when nothing inside is free. The arrow is placed first and the
 * bar keeps clear of it too. Pure, in paper millimetres.
 */

import type { Pt } from '@/drafting/types';
import { areaCandidates, boxAt, freeSpot, type Box, type Obstacle } from './free-spot';
import { scaleBarTicks } from './scale-bar';
import type { Setback } from './plot';

/** The north arrow's scale on paper (its circle is 18 symbol mm across) and the half side of the square it turns in, N included. */
export const SITE_ARROW_SCALE = 0.7;
const ARROW_HALF_MM = 14.5 * SITE_ARROW_SCALE;
/** The scale bar's height on paper, labels included, and the room its unit takes after it. */
const BAR_H_MM = 6;
const BAR_UNIT_MM = 6;
/** Clear space round each symbol, and the search step. */
export const SITE_SYMBOL_MARGIN_MM = 3;
const STEP_MM = 2;
const DIM_TEXT_MM = 2.5;

export interface SiteSymbolInput {
  /** The viewport's box on the paper. */
  viewport: Box;
  /** Viewport scale denominator. */
  scale: number;
  /** A drawing point on the paper. */
  toPaper: (p: Pt) => Pt;
  boundary: readonly Pt[] | null;
  footprint: readonly (readonly Pt[])[] | null;
  setbacks: readonly Setback[];
  /** How each setback's value prints. */
  setbackText: (metres: number) => string;
  /** The boxes of the coordinate labels already on the paper. */
  labels: readonly Box[];
}

export interface SiteSymbolPlaces {
  /** Centre of the north arrow, paper mm. */
  arrow: Pt;
  /** Start of the scale bar (its zero tick, at the bar's bottom edge), paper mm. */
  bar: Pt;
  /** The boxes they take, for checking. */
  arrowBox: Box;
  barBox: Box;
}

/** The boxes and lines a site plan's own symbols must keep clear of, on the paper. */
export function siteObstacles(input: SiteSymbolInput): Obstacle[] {
  const out: Obstacle[] = [];
  const ring = (pts: readonly Pt[]) => pts.map(input.toPaper);
  if (input.boundary) {
    const b = ring(input.boundary);
    b.forEach((p, i) => out.push({ kind: 'segment', a: p, b: b[(i + 1) % b.length] }));
  }
  for (const f of input.footprint ?? []) out.push({ kind: 'area', ring: ring(f) });
  for (const s of input.setbacks) {
    const a = input.toPaper(s.from);
    const b = input.toPaper(s.to);
    out.push({ kind: 'segment', a, b });
    // Its value, centred on the line whichever way it reads.
    const half = Math.max((input.setbackText(s.distance).length * DIM_TEXT_MM * 0.62) / 2 + DIM_TEXT_MM, DIM_TEXT_MM * 1.5);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    out.push({ kind: 'box', box: { x0: mid.x - half, y0: mid.y - half, x1: mid.x + half, y1: mid.y + half } });
  }
  for (const box of input.labels) out.push({ kind: 'box', box });
  return out;
}

export function siteSymbolPlaces(input: SiteSymbolInput): SiteSymbolPlaces {
  const obstacles = siteObstacles(input);
  const vp = input.viewport;
  const arrowSize = { w: ARROW_HALF_MM * 2, h: ARROW_HALF_MM * 2 };
  const arrowAt = freeSpot(arrowSize, areaCandidates(vp, arrowSize, SITE_SYMBOL_MARGIN_MM, ['tr', 'tl', 'br', 'bl'], STEP_MM), obstacles, SITE_SYMBOL_MARGIN_MM,
    { x: vp.x1 + SITE_SYMBOL_MARGIN_MM, y: vp.y0 });
  const arrowBox = boxAt(arrowAt, arrowSize);
  const ticks = scaleBarTicks(input.scale);
  const barSize = { w: ((ticks[ticks.length - 1] * 1000) / input.scale) + BAR_UNIT_MM, h: BAR_H_MM };
  const barAt = freeSpot(barSize, areaCandidates(vp, barSize, SITE_SYMBOL_MARGIN_MM, ['bl', 'br', 'tl', 'tr'], STEP_MM), [...obstacles, { kind: 'box', box: arrowBox }],
    SITE_SYMBOL_MARGIN_MM, { x: vp.x1 + SITE_SYMBOL_MARGIN_MM, y: arrowBox.y1 + SITE_SYMBOL_MARGIN_MM * 2 });
  const barBox = boxAt(barAt, barSize);
  return {
    arrow: { x: arrowAt.x + ARROW_HALF_MM, y: arrowAt.y + ARROW_HALF_MM },
    // The bar's labels stand above it: its start is the box's bottom-left corner.
    bar: { x: barAt.x, y: barAt.y + BAR_H_MM },
    arrowBox,
    barBox,
  };
}

/**
 * The paper box a coordinate point and its label take (`live-symbols.ts`
 * stacks the lines 2 mm high, 3 mm apart, from 3 mm right of the point), the
 * point at `p` on the paper, `k` paper mm per symbol mm.
 */
export function coordinateLabelBox(p: Pt, k: number, lines: readonly string[]): Box {
  const longest = Math.max(0, ...lines.map((l) => l.length));
  const n = Math.max(1, lines.length);
  return { x0: p.x - 2.5 * k, y0: p.y - (3 + 3 * (n - 1)) * k, x1: p.x + (3 + longest * 2 * 0.62) * k, y1: p.y + 2.5 * k };
}
