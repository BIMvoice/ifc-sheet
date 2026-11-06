/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Height labels on the major contours of a plan (#182). `withContours` leaves the places along each major contour on the
 * drawing (`contourLabels`: a point, the contour's direction there, its height); once a scale and a number format are
 * known, {@link layoutContourLabels} turns them into the figures to print and breaks the contour lines under each, so the
 * label reads. The app's live view and sheets and the headless sheets (PDF, DXF, `ifcsheet build`) call the same two
 * functions, so a label stands where it does everywhere. A label too close to the plan's edge is left out.
 */

import type { Drawing2D, DrawingLine, Point2D } from '@ifc-lite/drawing-2d';
import { DEFAULT_DIM_STYLE } from './draft-styles.js';
import { formatDimension, readableDeg } from './draft-look.js';
import type { SheetLocale } from './units-and-numbers.js';

/** The class the contours carry: the terrain's own. */
export const CONTOUR_IFC_TYPE = 'IfcGeographicElement';
/** Label text height, paper mm. */
export const CONTOUR_LABEL_MM = 2.5;
/** A letter's width as a share of the text height, for the room a label takes. */
const GLYPH_WIDTH = 0.6;
/** Clear paper around a label's text where the contour is broken, mm. */
const PAD_MM = 0.8;

/** A place for a label: on a major contour, the contour's direction there (degrees, the drawing's x towards y), its height in metres. */
export interface ContourLabel { at: Point2D; angle: number; height: number }

/** A drawing that carries the label places of its contours. */
export type WithContourLabels = { contourLabels?: readonly ContourLabel[] };

/** A label to print: text height `size` (paper mm), `angle` in screen degrees (clockwise, y down) already folded to read left to right. */
export interface ContourText { at: Point2D; text: string; angle: number; size: number }

export const contourLabelsOf = (drawing: Drawing2D): readonly ContourLabel[] => (drawing as Drawing2D & WithContourLabels).contourLabels ?? [];

/** The label places along one contour's polyline, spaced `spacing` apart (at least one on a contour longer than a quarter of it). */
export function labelPlaces(ring: readonly Point2D[], height: number, spacing: number): ContourLabel[] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    total += Math.hypot(ring[i + 1].x - ring[i].x, ring[i + 1].y - ring[i].y);
    lengths.push(total);
  }
  if (!(spacing > 0) || total < spacing / 4) return [];
  const count = Math.max(1, Math.floor(total / spacing));
  const out: ContourLabel[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const s = (total * (k + 0.5)) / count;
    while (seg < lengths.length - 1 && lengths[seg] < s) seg++;
    const a = ring[seg];
    const b = ring[seg + 1];
    const before = seg === 0 ? 0 : lengths[seg - 1];
    const len = lengths[seg] - before;
    const u = len > 0 ? (s - before) / len : 0;
    out.push({ at: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, height });
  }
  return out;
}

/** The part of segment `l` outside the box (centre `c`, half sizes `hl` along `deg`, `hh` across), as up to two lines. */
function breakLine(l: DrawingLine, c: Point2D, deg: number, hl: number, hh: number): DrawingLine[] {
  const cos = Math.cos((deg * Math.PI) / 180);
  const sin = Math.sin((deg * Math.PI) / 180);
  const local = (p: Point2D): Point2D => ({ x: (p.x - c.x) * cos + (p.y - c.y) * sin, y: -(p.x - c.x) * sin + (p.y - c.y) * cos });
  const p = local(l.line.start);
  const q = local(l.line.end);
  let t0 = 0;
  let t1 = 1;
  for (const [a, d, h] of [[p.x, q.x - p.x, hl], [p.y, q.y - p.y, hh]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(a) > h) return [l];
      continue;
    }
    const lo = (-h - a) / d;
    const hi = (h - a) / d;
    t0 = Math.max(t0, Math.min(lo, hi));
    t1 = Math.min(t1, Math.max(lo, hi));
  }
  if (t0 >= t1) return [l];
  const at = (t: number): Point2D => ({ x: l.line.start.x + (l.line.end.x - l.line.start.x) * t, y: l.line.start.y + (l.line.end.y - l.line.start.y) * t });
  const out: DrawingLine[] = [];
  if (t0 > 1e-9) out.push({ ...l, line: { start: l.line.start, end: at(t0) } });
  if (t1 < 1 - 1e-9) out.push({ ...l, line: { start: at(t1), end: l.line.end } });
  return out;
}

/**
 * The figures to print for `drawing`'s contour labels at 1:`scale` (heights in the project's length unit and decimals, as a
 * dimension's), and `drawing` with its contour lines broken under each. A label whose room crosses the drawing's edge is left
 * out. The same drawing and no figures when it has no labels.
 */
export function layoutContourLabels<T extends Drawing2D>(drawing: T, scale: number, locale: SheetLocale): { drawing: T; texts: ContourText[] } {
  const places = contourLabelsOf(drawing);
  if (places.length === 0 || !(scale > 0)) return { drawing, texts: [] };
  const metres = scale / 1000;
  const { min, max } = drawing.bounds;
  const texts: ContourText[] = [];
  let lines = drawing.lines;
  for (const place of places) {
    const text = formatDimension(locale, place.height, DEFAULT_DIM_STYLE);
    const hl = ((text.length * CONTOUR_LABEL_MM * GLYPH_WIDTH) / 2 + PAD_MM) * metres;
    const hh = (CONTOUR_LABEL_MM / 2 + PAD_MM / 2) * metres;
    const reach = Math.hypot(hl, hh);
    if (place.at.x - reach < min.x || place.at.x + reach > max.x || place.at.y - reach < min.y || place.at.y + reach > max.y) continue;
    lines = lines.flatMap((l) => {
      if (l.ifcType !== CONTOUR_IFC_TYPE) return [l];
      const { start, end } = l.line;
      if (Math.max(start.x, end.x) < place.at.x - reach || Math.min(start.x, end.x) > place.at.x + reach || Math.max(start.y, end.y) < place.at.y - reach || Math.min(start.y, end.y) > place.at.y + reach) return [l];
      return breakLine(l, place.at, place.angle, hl, hh);
    });
    texts.push({ at: place.at, text, angle: readableDeg(place.angle), size: CONTOUR_LABEL_MM });
  }
  return { drawing: texts.length ? { ...drawing, lines } : drawing, texts };
}
