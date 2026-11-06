/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The boxes a plan draws over its cut that a tag or a dimension figure keeps clear of (#707): the door leaves and swings, the window
 * frames, roof lines and grid, each stroke cut into boxes at most {@link OBSTACLE_PITCH} long so a slanting line or a swing arc is not
 * taken for the corner of its bounding box. The app (`overlayObstacleBoxes`) and the headless annotate run (`annotateSetHeadless`)
 * both call this, so a swing keeps the same label off it in both.
 */

import type { DraftShape, Pt } from '../draft-types.js';
import { openingPens } from '../plan-openings.js';
import type { OpeningSymbol } from '../opening-symbols.js';
import type { Rect } from '../text-leader.js';

/** A box of an obstacle; `dashed`: part of a dashed overlay line (a roof edge, a grid line), which a line may run across. */
export type ObstacleBox = Rect & { dashed?: boolean };

/** A pen of the plan's overlays: its strokes, and whether they are dashed (or in a line type of their own). */
export interface ObstacleOverlay { shapes: readonly DraftShape[]; dashed?: boolean | undefined; lineType?: unknown }

const OBSTACLE_PITCH = 0.2;

function boxOf(pts: readonly Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

function segmentBoxes(a: Pt, b: Pt, out: Rect[]): void {
  const n = Math.min(64, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / OBSTACLE_PITCH)));
  for (let i = 0; i < n; i++) {
    out.push(boxOf([{ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, { x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n }]));
  }
}

function shapeBoxes(sh: DraftShape, out: Rect[]): void {
  if (sh.type === 'line') segmentBoxes(sh.a, sh.b, out);
  else if (sh.type === 'polyline') {
    for (let i = 0; i + 1 < sh.pts.length; i++) segmentBoxes(sh.pts[i]!, sh.pts[i + 1]!, out);
    if (sh.closed && sh.pts.length > 2) segmentBoxes(sh.pts[sh.pts.length - 1]!, sh.pts[0]!, out);
  } else if (sh.type === 'circle') out.push({ x0: sh.c.x - sh.r, y0: sh.c.y - sh.r, x1: sh.c.x + sh.r, y1: sh.c.y + sh.r });
  else if (sh.type === 'arc') {
    // An arc runs counter-clockwise from `start` to `end`; its swept chords, not the square round it, are what it occupies.
    const sweep = (((sh.end - sh.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    const steps = Math.max(2, Math.min(64, Math.ceil((sweep * sh.r) / OBSTACLE_PITCH)));
    const at = (i: number): Pt => ({ x: sh.c.x + sh.r * Math.cos(sh.start + (sweep * i) / steps), y: sh.c.y + sh.r * Math.sin(sh.start + (sweep * i) / steps) });
    for (let i = 0; i < steps; i++) out.push(boxOf([at(i), at(i + 1)]));
  }
}

/** The boxes of the strokes of `overlays`; those of a dashed or line-typed overlay are marked dashed. */
export function overlayObstacleBoxes(overlays: readonly ObstacleOverlay[]): ObstacleBox[] {
  const out: ObstacleBox[] = [];
  for (const o of overlays) {
    const from = out.length;
    for (const sh of o.shapes) shapeBoxes(sh, out);
    if (o.dashed || o.lineType) for (let i = from; i < out.length; i++) out[i] = { ...out[i]!, dashed: true };
  }
  return out;
}

/** The boxes of a plan's door and window symbols (`planOpeningSymbols`): what the app's `planSymbolObstacles` reads from them. */
export const openingObstacles = (symbols: readonly OpeningSymbol[]): ObstacleBox[] => overlayObstacleBoxes(openingPens(symbols));
