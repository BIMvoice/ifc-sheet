/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a view's colour scheme adds to a headless sheet (#92): the fills of its rooms and elements, clipped to the viewport, and the
 * legend of its colours in a free place of the drawing area. The values and their colours are the engine's one assignment
 * (`colour-scheme.ts`, via `resolveScheme`), the same the app draws and lists, so a PDF or DXF made here and the sheet on screen agree.
 */

import type { Drawing2D, Point2D } from '@ifc-lite/drawing-2d';
import { clipPolygon } from './clip.js';
import { orderedFills, type SchemeResult } from './colour-fills.js';
import { schemeTitle, type SchemeEntry } from './colour-scheme.js';
import { findPattern, hatchSegments, type HatchPattern } from './hatch.js';
import type { Polyline, SheetText } from './sheet-graphic.js';
import type { SurfaceFill } from './surface-fills.js';
import type { Rect } from './sheet-frame.js';

/** One filled region of a sheet: its loops (an outer boundary and any holes, each ending where it starts) filled even-odd. */
export interface SheetFill {
  loops: Polyline[];
  /** `#rrggbb`. */
  colour: string;
  /** A coloured surface of an elevation or section (#499): painted in the PDF, kept out of the DXF, which carries the lines only. */
  surface?: true;
  /** The pattern drawn over the colour (#493): its name, and its strokes on the paper (each a run of two points), clipped to the region. */
  hatch?: { pattern: string; strokes: Polyline[]; /** Pen of the strokes, paper mm. */ width: number };
}

/** The ink of a fill's hatch; its pen is the graphic standard's hairline (the pen of a material's hatch), paper mm. */
export const FILL_HATCH = { ink: '#000000', pen: 0.13 } as const;
/** Strokes drawn for one region at most: a pattern too fine for its region gives up rather than flood the sheet. */
const MAX_STROKES = 20000;

/** `loops` (each ending where it starts) hatched with the pattern named `name`, in paper mm; `undefined` when the pattern is unknown or solid. */
export function hatchOf(loops: readonly Polyline[], name: string, patterns: readonly HatchPattern[], width: number = FILL_HATCH.pen): SheetFill['hatch'] {
  const pattern = findPattern(name, patterns);
  if (!pattern || pattern.solid) return undefined;
  // Pattern lengths are millimetres as printed at 1:1, and the region is already on the paper in millimetres: scale 1.
  const { segments } = hatchSegments(loops.map((l) => l.slice(0, -1)), pattern, { scale: 1, angleDeg: 0, maxSegments: MAX_STROKES });
  // A dot (a zero-length stroke) is drawn as a speck a tenth of a millimetre long.
  const strokes = segments.map((s): Polyline => [s.a, s.a.x === s.b.x && s.a.y === s.b.y ? { x: s.b.x + 0.1, y: s.b.y } : s.b]);
  return strokes.length > 0 ? { pattern: pattern.name, strokes, width } : undefined;
}

/**
 * The coloured surfaces of an elevation or section in one viewport (#499), under the linework and under a colour scheme's fills: one
 * region per triangle in the order given (far to near), because a region's loops are filled even-odd and overlapping triangles would
 * cancel out.
 */
export function viewportSurfaceFills(surfaces: readonly SurfaceFill[], at: (p: Point2D) => Point2D, box: Rect): SheetFill[] {
  const out: SheetFill[] = [];
  for (const s of surfaces) {
    const ring = clipPolygon(s.polygon.outer.map(at), box);
    if (ring.length >= 3) out.push({ loops: [closed(ring)], colour: s.surfaceColour, surface: true });
  }
  return out;
}

const closed = (pts: readonly Point2D[]): Point2D[] => [...pts, pts[0]];

/** The fills a scheme paints in one viewport, under the linework: the rooms first, then the painted elements' cut faces. */
export function viewportFills(drawing: Pick<Drawing2D, 'cutPolygons'>, scheme: SchemeResult, at: (p: Point2D) => Point2D, box: Rect, patterns: readonly HatchPattern[] = [], pen: number = FILL_HATCH.pen): SheetFill[] {
  const out: SheetFill[] = [];
  const add = (outer: readonly Point2D[], holes: readonly (readonly Point2D[])[], colour: string, pattern?: string): void => {
    const loops = [outer, ...holes].map((l) => clipPolygon(l.map(at), box)).filter((l) => l.length >= 3).map(closed);
    if (loops.length === 0 || clipPolygon(outer.map(at), box).length < 3) return;
    const hatch = pattern ? hatchOf(loops, pattern, patterns, pen) : undefined;
    out.push({ loops, colour, ...(hatch ? { hatch } : {}) });
  };
  for (const f of orderedFills(scheme.fills)) add(f.outer, f.holes, f.colour, f.hatch);
  for (const p of drawing.cutPolygons) {
    const colour = scheme.elementColours.get(p.entityId);
    if (colour) add(p.polygon.outer, p.polygon.holes, colour);
  }
  return out;
}

const ROW = 5;
const SWATCH = { w: 8, h: 3.4 };
const PAD = 3;
const TEXT = 2.8;
const TITLE = 3.4;

export interface SheetLegend {
  box: Rect;
  fills: SheetFill[];
  /** The frame and the swatch outlines. */
  lines: Polyline[];
  texts: SheetText[];
}

const rect = (r: Rect): Polyline => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }];
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The size of the legend of `entries`, paper mm. */
function legendSize(entries: readonly SchemeEntry[], title: string): { w: number; h: number } {
  const widest = Math.max(title.length * TITLE * 0.6, ...entries.map((e) => e.label.length * TEXT * 0.56 + SWATCH.w + 3));
  return { w: PAD * 2 + widest, h: PAD * 2 + TITLE * 1.6 + entries.length * ROW };
}

/**
 * The legend of a scheme's entries in the free place of `area` nearest its bottom-right corner that clears every rectangle of
 * `taken` (the viewports and their titles); where no place is free, in that corner. `null` when there is nothing to list.
 */
export function schemeLegend(entries: readonly SchemeEntry[], property: string, area: Rect, taken: readonly Rect[], heading?: string, patterns: readonly HatchPattern[] = [], pen: number = FILL_HATCH.pen): SheetLegend | null {
  if (entries.length === 0) return null;
  const title = heading?.trim() || schemeTitle(property);
  const { w, h } = legendSize(entries, title);
  const step = 4;
  let spot: Rect | null = null;
  for (let y = area.y + area.h - h; y >= area.y && !spot; y -= step) {
    for (let x = area.x + area.w - w; x >= area.x; x -= step) {
      const candidate = { x, y, w, h };
      if (!taken.some((t) => meets(candidate, t))) { spot = candidate; break; }
    }
  }
  const box = spot ?? { x: area.x + area.w - w, y: area.y + area.h - h, w, h };
  const out: SheetLegend = { box, fills: [], lines: [rect(box)], texts: [{ at: { x: box.x + PAD, y: box.y + PAD + TITLE }, text: title, size: TITLE }] };
  entries.forEach((e, i) => {
    const y = box.y + PAD + TITLE * 1.6 + i * ROW;
    const swatch = { x: box.x + PAD, y: y + (ROW - SWATCH.h) / 2, w: SWATCH.w, h: SWATCH.h };
    const swatchLoop = rect(swatch);
    const hatch = e.hatch ? hatchOf([swatchLoop], e.hatch, patterns, pen) : undefined;
    out.fills.push({ loops: [swatchLoop], colour: e.colour, ...(hatch ? { hatch } : {}) });
    out.lines.push(rect(swatch));
    out.texts.push({ at: { x: swatch.x + SWATCH.w + 3, y: y + ROW / 2 + TEXT * 0.35 }, text: e.label, size: TEXT });
  });
  return out;
}
