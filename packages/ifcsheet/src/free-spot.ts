/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Finding a free spot for a symbol on a drawing: the first candidate place
 * whose box, grown by a margin, touches none of what is already drawn there.
 * Pure, in paper millimetres (y down), so margins are what the reader sees.
 * The engine owns it so a site plan's north arrow and scale bar are placed
 * by one rule on the screen, in the PDF and in the DXF (`site-marks.ts`, #430).
 */

import type { Pt } from './draft-types.js';
import { insideRing } from './plot-geometry.js';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What a symbol must keep clear of: a line (a dimension, a boundary edge), a box (a label), or an area it may not sit in (the footprint). */
export type Obstacle =
  | { kind: 'segment'; a: Pt; b: Pt }
  | { kind: 'box'; box: Box }
  | { kind: 'area'; ring: readonly Pt[] };

export const boxOf = (pts: readonly Pt[]): Box => ({
  x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)),
});

/** Whether two boxes overlap once `a` is grown by `m` on every side. */
export const overlaps = (a: Box, b: Box, m: number): boolean => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.y0 - m < b.y1 && a.y1 + m > b.y0;

/** Whether segment ab crosses or lies in `box` (Liang–Barsky clip). */
export function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Whether `box` grown by `m` touches `o`. */
export function hits(box: Box, o: Obstacle, m: number): boolean {
  const grown = { x0: box.x0 - m, y0: box.y0 - m, x1: box.x1 + m, y1: box.y1 + m };
  switch (o.kind) {
    case 'box': return overlaps(box, o.box, m);
    case 'segment': return segmentHitsBox(o.a, o.b, grown);
    case 'area': {
      const corners = [{ x: grown.x0, y: grown.y0 }, { x: grown.x1, y: grown.y0 }, { x: grown.x1, y: grown.y1 }, { x: grown.x0, y: grown.y1 }];
      if (corners.some((c) => insideRing(c, o.ring)) || o.ring.some((p) => p.x > grown.x0 && p.x < grown.x1 && p.y > grown.y0 && p.y < grown.y1)) return true;
      return o.ring.some((p, i) => segmentHitsBox(p, o.ring[(i + 1) % o.ring.length], grown));
    }
  }
}

/** A box of `size` with its top-left corner at `at`. */
export const boxAt = (at: Pt, size: { w: number; h: number }): Box => ({ x0: at.x, y0: at.y, x1: at.x + size.w, y1: at.y + size.h });

/**
 * The top-left corner of the first box of `size`, among `candidates` (top-left
 * corners, in order of preference), that clears every obstacle by `margin`;
 * `null` when none does.
 */
export function freeSpot(size: { w: number; h: number }, candidates: readonly Pt[], obstacles: readonly Obstacle[], margin: number): Pt | null {
  return candidates.find((c) => !obstacles.some((o) => hits(boxAt(c, size), o, margin))) ?? null;
}

/**
 * Candidates inside `area` for a box of `size`: its four corners (inset by
 * `inset`) in the order `corners` names them, then every `step` across it,
 * nearest the first corner first.
 */
export function areaCandidates(area: Box, size: { w: number; h: number }, inset: number, corners: readonly ('tl' | 'tr' | 'bl' | 'br')[], step: number): Pt[] {
  const left = area.x0 + inset;
  const right = area.x1 - inset - size.w;
  const top = area.y0 + inset;
  const bottom = area.y1 - inset - size.h;
  if (right < left || bottom < top) return [];
  const at = { tl: { x: left, y: top }, tr: { x: right, y: top }, bl: { x: left, y: bottom }, br: { x: right, y: bottom } };
  const grid: Pt[] = [];
  for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) grid.push({ x, y });
  // Nearest the preferred corner first, so a symbol that cannot sit in it stays close by.
  const first = at[corners[0] ?? 'tl'];
  grid.sort((a, b) => Math.hypot(a.x - first.x, a.y - first.y) - Math.hypot(b.x - first.x, b.y - first.y));
  return [...corners.map((c) => at[c]), ...grid];
}
