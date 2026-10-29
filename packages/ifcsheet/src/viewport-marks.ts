/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The north arrow and the graphic scale bar a viewport can carry
 * (`SheetViewport.northArrow` / `scaleBar`), as plain shapes on the paper,
 * millimetres from the sheet's top-left corner, y down.
 *
 * ONE layout, drawn by both sides: the PDF and DXF writers take it from
 * `sheetGraphic` and the web app's sheet draws these same shapes
 * (`ViewportMarks.tsx`), so the arrow turns by the same angle and the bar is
 * the same length on the screen and in the file. Nothing here reads a
 * global: the angle comes from the model's TrueNorth (`true-north.ts`), the
 * labels from the one number formatter (`sheet-number.ts`).
 *
 * A mark that does not fit the viewport's box is not drawn: a bar longer than
 * the room it has would run into the frame. The bar never takes more than half
 * the box's width and the arrow stands at the far right, so the two do not meet.
 */

import type { ProjectView, SheetViewport } from './document.js';
import type { Polyline, SheetText } from './sheet-graphic.js';
import type { Rect } from './sheet-frame.js';
import { sheetNumber } from './sheet-number.js';
import { textWidthEm } from './text-width.js';
import type { SheetLocale } from './units-and-numbers.js';
import type { PlanDirection } from './true-north.js';

/** The shapes of the marks of one viewport. `solids` are closed rings to fill; `strokes` are open runs, a closed ring repeating its first point. */
export interface ViewportMarkShapes {
  strokes: Polyline[];
  solids: Polyline[];
  texts: SheetText[];
}

/** Clear space between a mark and the edge of the box it sits in, mm. */
export const MARK_MARGIN_MM = 4;
/** The north arrow's radius (tip to centre), mm. */
export const ARROW_RADIUS_MM = 8;
/** Half the side of the square the arrow takes, its N included. */
export const ARROW_HALF_MM = 13;
/** The longest a scale bar is drawn, mm; a smaller box gets a shorter one. */
export const BAR_TARGET_MM = 100;
/** The shortest a scale bar is worth drawing, mm. */
export const BAR_MIN_MM = 20;
const BAR_H_MM = 2;
const TICK_MM = 1;
const LABEL_MM = 2.5;
const LABEL_GAP_MM = 0.8;
/** The distances a half of the bar may span: 1, 2, 2.5 and 5 of each decade (so 1:100 reads 0–5–10 m and 1:500 reads 0–25–50 m). */
const HALF_STEPS = [1, 2, 2.5, 5] as const;

/**
 * The plane a north arrow can be drawn for: a plan is the cut on the y axis,
 * not turned onto a custom plane.
 */
export interface MarkPlane {
  axis: 'x' | 'y' | 'z';
  flipped?: boolean;
  customPlane?: unknown;
}

/**
 * The angle a north arrow takes on a plan: degrees counter-clockwise as seen
 * on the paper, from the paper's up to true north. `north` is the model's
 * TrueNorth; without one the model's claim is project north (+Y), as the
 * site plan's arrow reads it. `null` on anything but a cardinal plan.
 *
 * A plan draws world (x, y) with the paper's y running down, so IFC +Y is up;
 * a reflected plan (`flipped`) mirrors the first axis.
 */
export function northDegrees(plane: MarkPlane, north: PlanDirection | null): number | null {
  if (plane.axis !== 'y' || plane.customPlane) return null;
  const n = north ?? { x: 0, y: 1 };
  const right = plane.flipped ? -n.x : n.x;
  const deg = (Math.atan2(-right, n.y) * 180) / Math.PI;
  return Object.is(deg, -0) ? 0 : deg;
}

/** The distance one half of the scale bar spans, metres, so the whole bar is at most `maxMm` of paper long; null when even the smallest would be too short. */
export function barHalfMetres(scale: number, maxMm: number): number | null {
  if (!(scale > 0) || !(maxMm > 0)) return null;
  const max = (maxMm * scale) / 1000 / 2;
  let best = 0;
  for (let decade = Math.floor(Math.log10(max)) - 1; decade <= Math.ceil(Math.log10(max)); decade++) {
    for (const k of HALF_STEPS) {
      const s = k * 10 ** decade;
      if (s <= max * (1 + 1e-9) && s > best) best = s;
    }
  }
  return best > 0 && (2 * best * 1000) / scale >= BAR_MIN_MM ? Number(best.toPrecision(12)) : null;
}

const ring = (pts: { x: number; y: number }[]): Polyline => [...pts, pts[0]];

/** What the arrow needs of its box and what the bar needs of its. */
export interface ViewportMarkInput {
  /** The room the marks sit in: the viewport's box, inside the frame and above the title block. */
  area: Rect;
  /** Drawing scale denominator. */
  scale: number;
  /** The arrow's angle (`northDegrees`); null: no arrow. */
  arrowDegrees: number | null;
  bar: boolean;
  /** How the bar's figures are written. */
  locale: SheetLocale;
}

function arrow(c: { x: number; y: number }, degrees: number, out: ViewportMarkShapes): void {
  const r = ARROW_RADIUS_MM;
  const t = (degrees * Math.PI) / 180;
  // Turn a point of the arrow counter-clockwise as seen on the paper (y down).
  const at = (x: number, y: number) => ({ x: c.x + x * Math.cos(t) + y * Math.sin(t), y: c.y - x * Math.sin(t) + y * Math.cos(t) });
  const tip = at(0, -r);
  const left = at(-0.4 * r, 0.8 * r);
  const right = at(0.4 * r, 0.8 * r);
  const notch = at(0, 0.35 * r);
  out.solids.push(ring([tip, left, notch]));
  out.strokes.push(ring([tip, left, notch, right]), [tip, notch]);
  const n = at(0, -r - 3.2);
  out.texts.push({ at: { x: n.x, y: n.y + 1.2 }, text: 'N', size: 3.5, align: 'center' });
}

function bar(x0: number, bottom: number, halfM: number, scale: number, locale: SheetLocale, out: ViewportMarkShapes): void {
  const half = (halfM * 1000) / scale;
  const top = bottom - BAR_H_MM;
  const xs = [x0, x0 + half, x0 + 2 * half];
  out.solids.push(ring([{ x: xs[0], y: top }, { x: xs[1], y: top }, { x: xs[1], y: bottom }, { x: xs[0], y: bottom }]));
  out.strokes.push(ring([{ x: xs[0], y: top }, { x: xs[2], y: top }, { x: xs[2], y: bottom }, { x: xs[0], y: bottom }]), [{ x: xs[1], y: top }, { x: xs[1], y: bottom }]);
  const figure = (m: number) => sheetNumber(locale, m, 2, { trim: true });
  const labels = [figure(0), figure(halfM), `${figure(2 * halfM)} m`];
  xs.forEach((x, i) => {
    out.strokes.push([{ x, y: top }, { x, y: top - TICK_MM }]);
    out.texts.push({ at: { x, y: top - TICK_MM - LABEL_GAP_MM }, text: labels[i], size: LABEL_MM, align: 'center' });
  });
}

/** The box a scale bar takes (its labels included) with its zero tick at `x0` and its bottom edge at `bottom`. */
function barBox(x0: number, bottom: number, lengthMm: number, lastLabel: string): Rect {
  const overhang = (textWidthEm(lastLabel) * LABEL_MM) / 2;
  const height = BAR_H_MM + TICK_MM + LABEL_GAP_MM + LABEL_MM;
  return { x: x0 - 2, y: bottom - height, w: lengthMm + overhang + 2, h: height };
}

/**
 * The marks of a viewport: the scale bar in the box's bottom-left corner, the
 * north arrow in its top-right, each `MARK_MARGIN_MM` clear of the box's edge.
 * Empty when nothing is asked for or nothing fits.
 */
export function viewportMarks(input: ViewportMarkInput): ViewportMarkShapes {
  const out: ViewportMarkShapes = { strokes: [], solids: [], texts: [] };
  const { area, scale } = input;
  const m = MARK_MARGIN_MM;
  const arrowFits = input.arrowDegrees !== null && area.w >= 2 * (ARROW_HALF_MM + m) && area.h >= 2 * (ARROW_HALF_MM + m);
  if (arrowFits && input.arrowDegrees !== null) arrow({ x: area.x + area.w - m - ARROW_HALF_MM, y: area.y + m + ARROW_HALF_MM }, input.arrowDegrees, out);
  if (input.bar) {
    const halfM = barHalfMetres(scale, Math.min(BAR_TARGET_MM, area.w * 0.5));
    if (halfM !== null) {
      const x0 = area.x + m + 2;
      const bottom = area.y + area.h - m;
      const last = `${sheetNumber(input.locale, 2 * halfM, 2, { trim: true })} m`;
      const box = barBox(x0, bottom, (2 * halfM * 1000) / scale, last);
      if (box.y >= area.y) bar(x0, bottom, halfM, scale, input.locale, out);
    }
  }
  return out;
}

/** Which marks a viewport shows. */
export interface ViewportMarkFlags {
  northArrow: boolean;
  scaleBar: boolean;
}

/**
 * The marks `vp` shows: what it says (`SheetViewport.northArrow` / `scaleBar`,
 * on or off), else off. A site plan's own arrow and bar are drawn by the app in
 * a free spot clear of the plot (`siteplan/site-symbols.ts`), so a site plan
 * takes no default here either (issue #430 is the proper avoidance for all); the headless build
 * draws a site plan's marks when the viewport asks for them, in `siteMarkArea`. A north arrow
 * is for plans only and a scale bar for a drawing that has a scale (not a 3D
 * view, a drafting view's detail or a key plan, which is the whole plan small);
 * a view that cannot carry a mark never shows it, whatever the viewport says.
 */
export function viewportMarkFlags(vp: Pick<SheetViewport, 'northArrow' | 'scaleBar' | 'keyPlanOf'>, view: ProjectView | undefined): ViewportMarkFlags {
  if (!view || vp.keyPlanOf !== undefined) return { northArrow: false, scaleBar: false };
  return {
    northArrow: view.kind === 'plan' && (vp.northArrow ?? false),
    scaleBar: view.kind !== '3d' && (vp.scaleBar ?? false),
  };
}

/** The room a viewport's marks sit in: its box where it lies inside the drawing area (the frame, above the title block); null when it does not. */
export function markArea(box: Rect, drawingArea: Rect): Rect | null {
  const x0 = Math.max(box.x, drawingArea.x);
  const y0 = Math.max(box.y, drawingArea.y);
  const x1 = Math.min(box.x + box.w, drawingArea.x + drawingArea.w);
  const y1 = Math.min(box.y + box.h, drawingArea.y + drawingArea.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** What a north arrow needs of its box (its square and the margin on each side), mm. */
export const ARROW_NEED_MM = { w: 2 * (ARROW_HALF_MM + MARK_MARGIN_MM), h: 2 * (ARROW_HALF_MM + MARK_MARGIN_MM) };
/** What a scale bar needs of its box: the shortest bar and its margins, and the height of the bar with its figures. */
export const BAR_NEED_MM = { w: 2 * BAR_MIN_MM + 2 * MARK_MARGIN_MM, h: BAR_H_MM + TICK_MM + LABEL_GAP_MM + LABEL_MM + 2 * MARK_MARGIN_MM };

/** Whether a mark that needs `need` fits in `r`. */
export function markFits(r: Rect | null, need: { w: number; h: number }): r is Rect {
  return r !== null && r.w >= need.w && r.h >= need.h;
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The room a site plan's mark sits in: inside its drawing box where the mark fits there (`markArea`), else in a strip right beside
 * the box (right, left, above, below), as deep as the mark needs and along the box's side, inside the drawing area and clear of
 * everything in `taken` (the sheet's other viewports, their titles, the title block). A small plot at a large scale so still gets its
 * arrow and bar next to it, never at the far side of the sheet or over another drawing. `null` when there is no such room.
 * The app places a site plan's marks in a free spot of its own (`siteplan/site-symbols.ts`), which needs the plot; the headless
 * build has only the box.
 */
export function siteMarkArea(box: Rect, drawingArea: Rect, need: { w: number; h: number }, taken: readonly Rect[] = []): Rect | null {
  const inside = markArea(box, drawingArea);
  if (markFits(inside, need)) return inside;
  const h = Math.max(box.h, need.h);
  const w = Math.max(box.w, need.w);
  const beside: Rect[] = [
    { x: box.x + box.w, y: box.y, w: need.w, h },
    { x: box.x - need.w, y: box.y, w: need.w, h },
    { x: box.x, y: box.y - need.h, w, h: need.h },
    { x: box.x, y: box.y + box.h, w, h: need.h },
  ];
  for (const strip of beside) {
    const area = markArea(strip, drawingArea);
    if (markFits(area, need) && !taken.some((t) => overlaps(area, t))) return area;
  }
  return null;
}

/**
 * The box a viewport's marks are placed in: the crop the user gave it
 * (`width` and `height`), else the drawing's extent at the viewport's scale
 * (centred on the viewport, `drawingBox`). Not the screen's fitted box, which
 * keeps a 10 mm margin round the drawing for its bubbles and tags
 * (`fitViewportBox`): the marks stand against the drawing, not in the margin,
 * and the PDF has no such margin to stand in.
 */
export function markBox(vp: Pick<SheetViewport, 'x' | 'y' | 'width' | 'height'>, drawingBox: Rect | null): Rect | null {
  return vp.width > 0 && vp.height > 0 ? { x: vp.x - vp.width / 2, y: vp.y - vp.height / 2, w: vp.width, h: vp.height } : drawingBox;
}
