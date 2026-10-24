/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A sheet laid out as plain shapes on its paper, millimetres from the top-left
 * corner: the frame line and the title block (`sheet-frame.ts`), each
 * viewport's drawing at its scale, each drawing's title under it. The PDF and
 * DXF writers draw from this one layout, so they cannot disagree.
 *
 * Headless and unstyled. The web app draws its sheets as SVG through React
 * (`components/viewer/sheets/`), with pens, hatches, symbols, annotation and
 * the full title block; this layout carries the geometry of the same sheet
 * and the fields the engine knows (project, sheet number and name, scale,
 * date). Moving the app's sheet composition here is a follow-up.
 */

import type { Drawing2D, Point2D } from '@ifc-lite/drawing-2d';
import { clipPolyline } from './clip.js';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { viewCentre, viewExtent, type ModelExtent } from './drawing-set.js';
import { frameOf, frameRect, titleBlockRect, type Rect } from './sheet-frame.js';
import { paperOf } from './viewport-fit.js';

export type Polyline = readonly Point2D[];

export interface SheetText {
  at: Point2D;
  text: string;
  /** Text height, paper mm. */
  size: number;
  align?: 'left' | 'center';
}

export interface SheetGraphic {
  sheetId: string;
  number: string;
  name: string;
  /** Paper width and height, mm. */
  paper: { w: number; h: number };
  /** The frame line, the title block's box and its rule; each rectangle ends where it starts. */
  frame: Polyline[];
  /** The outlines of cut faces, clipped to their viewport; a ring wholly inside ends where it starts. */
  cut: Polyline[];
  /** Every other visible line of the drawings, clipped to their viewport. */
  lines: Polyline[];
  texts: SheetText[];
  /** The box each viewport's drawing is clipped to, paper mm: the room the layout made for it. */
  viewports: { viewId: string; box: Rect }[];
}

/** A rectangle as a closed run of points (the first repeated last), so it reads whole in an open-polyline layer. */
const rect = (r: { x: number; y: number; w: number; h: number }): Polyline => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }];

/** The title block: its box, a rule under the project, and the fields the engine knows. */
function titleBlock(sheet: ProjectSheet, doc: ProjectDocument, paper: { w: number; h: number }, scales: readonly number[]): { frame: Polyline[]; texts: SheetText[] } {
  const tb = titleBlockRect(paper, frameOf(sheet));
  const fields = { ...doc.titleBlock, ...sheet.titleBlock };
  const pad = 4;
  const strip = tb.h > tb.w;
  const ruleY = tb.y + (strip ? 40 : 16);
  const line = (i: number) => ruleY + 8 + i * 7;
  const scale = scales.length ? scales.map((s) => `1:${s}`).join(', ') : '';
  return {
    frame: [rect(tb), [{ x: tb.x, y: ruleY }, { x: tb.x + tb.w, y: ruleY }]],
    texts: [
      { at: { x: tb.x + pad, y: tb.y + 10 }, text: fields.project || doc.name, size: 5 },
      { at: { x: tb.x + pad, y: line(0) }, text: sheet.number, size: 6 },
      { at: { x: tb.x + pad, y: line(1) }, text: sheet.name, size: 3.5 },
      { at: { x: tb.x + pad, y: line(2) }, text: [scale, fields.date ?? ''].filter(Boolean).join('   '), size: 2.5 },
    ].filter((t) => t.text),
  };
}

/**
 * Which way each drawing axis runs on the paper, by the axis the drawing is cut
 * along: a plan (`y`) keeps its second axis pointing down the paper (a point
 * further south is lower), an elevation or section (`z`, `x`) points it up; a
 * drawing looking along `x` (east and west elevations) also mirrors its first
 * axis. The sheet in the app reads the same signs (`screenSigns` in
 * `drafting/frame.ts`), so a drawing is on the sheet the way it is in the PDF.
 */
export function paperSigns(axis: 'x' | 'y' | 'z'): { kx: 1 | -1; ky: 1 | -1 } {
  return { kx: axis === 'x' ? -1 : 1, ky: axis === 'y' ? 1 : -1 };
}

/**
 * `drawing` mapped onto the paper: its centre (the viewport's `center`, a plan's
 * extent centre from `viewCentre`, else the middle of its bounds) at the
 * viewport's position, drawing metres to paper mm at the viewport's scale, the
 * axes signed by the cut (`paperSigns`).
 */
export function placer(drawing: Pick<Drawing2D, 'bounds'> & { config: Pick<Drawing2D['config'], 'plane'> }, vp: NonNullable<ProjectSheet['viewports']>[number], centre: Point2D | null = null): (p: Point2D) => Point2D {
  const k = 1000 / vp.scale;
  const { kx, ky } = paperSigns(drawing.config.plane.axis);
  const cx = vp.center?.x ?? centre?.x ?? (drawing.bounds.min.x + drawing.bounds.max.x) / 2;
  const cy = vp.center?.y ?? centre?.y ?? (drawing.bounds.min.y + drawing.bounds.max.y) / 2;
  return (p) => ({ x: vp.x + (p.x - cx) * kx * k, y: vp.y + (p.y - cy) * ky * k });
}

const closeRing = (pts: Point2D[]): Point2D[] => (pts.length > 2 ? [...pts, pts[0]] : pts);

/**
 * `sheet` as shapes on its paper, its drawings taken from `drawings` (by view
 * id); a view without one keeps its title only. With `extent` (the one the set
 * was laid out on), each drawing is clipped to the box the layout made for its
 * view, so a drawing larger than the building (the site around it) cannot run
 * into its neighbour; without it, to the drawing's own extent.
 */
export function sheetGraphic(sheet: ProjectSheet, doc: ProjectDocument, drawings: ReadonlyMap<string, Drawing2D>, extent?: ModelExtent | null): SheetGraphic {
  const paper = paperOf(sheet);
  const out: SheetGraphic = { sheetId: sheet.id, number: sheet.number, name: sheet.name, paper, frame: [rect(frameRect(paper, frameOf(sheet)))], cut: [], lines: [], texts: [], viewports: [] };
  const vps = sheet.viewports ?? [];
  for (const vp of vps) {
    const view = doc.views.find((v) => v.id === vp.viewId);
    const drawing = drawings.get(vp.viewId);
    const k = 1000 / vp.scale;
    const size = view && extent ? viewExtent(view, extent)
      : drawing ? { w: drawing.bounds.max.x - drawing.bounds.min.x, h: drawing.bounds.max.y - drawing.bounds.min.y } : null;
    const box: Rect | null = size && Number.isFinite(size.w + size.h) ? { x: vp.x - (size.w * k) / 2, y: vp.y - (size.h * k) / 2, w: size.w * k, h: size.h * k } : null;
    if (box) out.viewports.push({ viewId: vp.viewId, box });
    if (drawing && box && Number.isFinite(drawing.bounds.min.x)) {
      const at = placer(drawing, vp, view && extent ? viewCentre(view, extent) : null);
      for (const polygon of drawing.cutPolygons) {
        for (const ring of [polygon.polygon.outer, ...polygon.polygon.holes]) out.cut.push(...clipPolyline(closeRing(ring.map(at)), box));
      }
      for (const line of drawing.lines) if (line.visibility !== 'hidden') out.lines.push(...clipPolyline([at(line.line.start), at(line.line.end)], box));
    }
    if (view) out.texts.push({ at: { x: vp.x, y: (box ? box.y + box.h : vp.y) + 8 }, text: `${view.name}  1:${vp.scale}`, size: 3.5, align: 'center' });
  }
  const block = titleBlock(sheet, doc, paper, [...new Set(vps.map((v) => v.scale))]);
  out.frame.push(...block.frame);
  out.texts.push(...block.texts);
  return out;
}
