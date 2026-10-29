/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a site plan puts its north arrow and graphic scale bar (#430): in a
 * free spot of its box (a corner first, else anywhere across it), clear by a
 * few millimetres of the plot boundary, the building's footprint, the setback
 * dimensions and their figures; beside the box (`besideMarkArea`) when nothing
 * inside is free. The arrow is placed first and the bar keeps clear of it.
 *
 * ONE rule, called by both sides: the web app's sheet (`SheetPaper`) and
 * `sheetGraphic` (PDF, DXF, `ifcsheet build`) pass the same drawing, drafts and
 * drawing-to-paper map and draw the shapes that come back, so the marks stand at
 * the same paper points on the screen and in the files. Pure, paper millimetres.
 *
 * The footprint is the convex hull of the cut faces that enclose the building
 * (`enclosureRings`): sync, needs no kernel, and a mark never sits in a notch or
 * a courtyard of the building. The setbacks are measured from it as the site
 * plan's own dimensions are (`setbacks`).
 */

import type { DrawingPolygon } from '@ifc-lite/drawing-2d';
import type { DraftEntity, Pt } from './draft-types.js';
import { areaCandidates, boxAt, freeSpot, type Box, type Obstacle } from './free-spot.js';
import { plotBoundaryOf, setbacks } from './plot-geometry.js';
import type { Rect } from './sheet-frame.js';
import { sheetNumber } from './sheet-number.js';
import type { SheetLocale } from './units-and-numbers.js';
import { ARROW_HALF_MM, ARROW_NEED_MM, BAR_NEED_MM, arrowMarkAt, barMarkAt, barSize, besideMarkArea, markArea, viewportMarks, type ViewportMarkShapes } from './viewport-marks.js';

export * from './plot-geometry.js';
export { hits, type Box, type Obstacle } from './free-spot.js';

/** Clear space round each mark, and the search step, mm. */
export const SITE_MARK_MARGIN_MM = 3;
const STEP_MM = 2;
const DIM_TEXT_MM = 2.5;

const ENCLOSURE = /^IFC(WALL|WALLSTANDARDCASE|WALLELEMENTEDCASE|COLUMN|COLUMNSTANDARDCASE|CURTAINWALL|DOOR|DOORSTANDARDCASE|WINDOW|WINDOWSTANDARDCASE|PLATE|MEMBER)$/i;

/** The rings of the drawing's cut faces that enclose the building (walls, columns, curtain walls, and the doors and windows closing the gaps). */
export function enclosureRings(polygons: readonly Pick<DrawingPolygon, 'isCut' | 'ifcType' | 'polygon'>[]): Pt[][] {
  const out: Pt[][] = [];
  for (const p of polygons) {
    if (p.isCut && ENCLOSURE.test(p.ifcType) && p.polygon.outer.length >= 3) out.push(p.polygon.outer.map((q) => ({ x: q.x, y: q.y })));
  }
  return out;
}

/** The convex hull of `pts` (monotone chain), counter-clockwise in a y-up frame; fewer than three distinct points give back what there is. */
export function convexHull(pts: readonly Pt[]): Pt[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (input: readonly Pt[]): Pt[] => {
    const h: Pt[] = [];
    for (const p of input) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** What a site plan's drawing gives the placement: the plot the user drew, the building's footprint, and the setbacks between them. */
export interface SiteMarkSource {
  /** The drawing's cut faces (its `cutPolygons`). */
  polygons: readonly Pick<DrawingPolygon, 'isCut' | 'ifcType' | 'polygon'>[];
  /** The project's drafts and the site plan's view id: the plot boundary is the one drawn on that view. */
  drafts: readonly DraftEntity[];
  viewId: string;
  /** A drawing point on the paper. */
  toPaper: (p: Pt) => Pt;
  locale: SheetLocale;
  /** The boxes of anything else already on the paper to keep clear of (the app's coordinate labels). */
  labels?: readonly Box[];
}

/** The boxes and lines a site plan's marks must keep clear of, on the paper. */
export function siteObstacles(src: SiteMarkSource): Obstacle[] {
  const out: Obstacle[] = [];
  const boundary = plotBoundaryOf(src.drafts, src.viewId);
  const hull = convexHull(enclosureRings(src.polygons).flat());
  if (boundary) {
    const b = boundary.map(src.toPaper);
    b.forEach((p, i) => out.push({ kind: 'segment', a: p, b: b[(i + 1) % b.length] }));
  }
  if (hull.length >= 3) out.push({ kind: 'area', ring: hull.map(src.toPaper) });
  for (const s of boundary && hull.length >= 3 ? setbacks([hull], boundary) : []) {
    const a = src.toPaper(s.from);
    const b = src.toPaper(s.to);
    out.push({ kind: 'segment', a, b });
    // Its value, centred on the line whichever way it reads.
    const text = sheetNumber(src.locale, s.distance, 2, { kind: 'length' });
    const half = Math.max((text.length * DIM_TEXT_MM * 0.62) / 2 + DIM_TEXT_MM, DIM_TEXT_MM * 1.5);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    out.push({ kind: 'box', box: { x0: mid.x - half, y0: mid.y - half, x1: mid.x + half, y1: mid.y + half } });
  }
  for (const box of src.labels ?? []) out.push({ kind: 'box', box });
  return out;
}

export interface SiteMarkInput {
  /** The viewport's box on the paper (`markBox`) and the frame above the title block. */
  box: Rect;
  drawingArea: Rect;
  scale: number;
  /** `northDegrees`; null: no arrow. */
  arrowDegrees: number | null;
  bar: boolean;
  locale: SheetLocale;
  obstacles: readonly Obstacle[];
  /** Where a mark that goes beside the box may not stand: the sheet's other viewports and titles, the title block. */
  taken?: readonly Rect[];
}

const boxFromRect = (r: Rect): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

/** The marks of a site plan viewport, placed by the one rule of this file; empty when nothing is asked for or nothing fits anywhere. */
export function siteMarks(input: SiteMarkInput): ViewportMarkShapes {
  const out: ViewportMarkShapes = { strokes: [], solids: [], texts: [] };
  const add = (s: ViewportMarkShapes) => { out.strokes.push(...s.strokes); out.solids.push(...s.solids); out.texts.push(...s.texts); };
  const inside = markArea(input.box, input.drawingArea);
  const area = inside ? boxFromRect(inside) : null;
  const obstacles: Obstacle[] = [...input.obstacles];
  const taken: Rect[] = [...(input.taken ?? [])];
  const spot = (size: { w: number; h: number }, corners: readonly ('tl' | 'tr' | 'bl' | 'br')[]) =>
    area ? freeSpot(size, areaCandidates(area, size, SITE_MARK_MARGIN_MM, corners, STEP_MM), obstacles, SITE_MARK_MARGIN_MM) : null;
  if (input.arrowDegrees !== null) {
    const size = { w: ARROW_HALF_MM * 2, h: ARROW_HALF_MM * 2 };
    const at = spot(size, ['tr', 'tl', 'br', 'bl']);
    if (at) {
      add(arrowMarkAt({ x: at.x + ARROW_HALF_MM, y: at.y + ARROW_HALF_MM }, input.arrowDegrees));
      obstacles.push({ kind: 'box', box: boxAt(at, size) });
    } else {
      const beside = besideMarkArea(input.box, input.drawingArea, ARROW_NEED_MM, taken);
      if (beside) {
        add(viewportMarks({ area: beside, scale: input.scale, arrowDegrees: input.arrowDegrees, bar: false, locale: input.locale }));
        taken.push(beside);
      }
    }
  }
  if (input.bar) {
    const size = barSize(input.scale, input.locale);
    const at = size ? spot(size, ['bl', 'br', 'tl', 'tr']) : null;
    if (size && at) add(barMarkAt(at.x + 2, at.y + size.h, size.halfM, input.scale, input.locale));
    else {
      const beside = besideMarkArea(input.box, input.drawingArea, BAR_NEED_MM, taken);
      if (beside) add(viewportMarks({ area: beside, scale: input.scale, arrowDegrees: null, bar: true, locale: input.locale }));
    }
  }
  return out;
}
