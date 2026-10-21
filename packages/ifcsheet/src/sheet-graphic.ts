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
import type { ProjectDocument, ProjectSheet } from './document.js';
import { frameOf, frameRect, titleBlockRect } from './sheet-frame.js';
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
  /** The outlines of cut faces, closed. */
  cut: Polyline[];
  /** Every other visible line of the drawings, open. */
  lines: Polyline[];
  texts: SheetText[];
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

/** `drawing` mapped onto the paper: centred on the viewport (or on its `center` point), drawing metres to paper mm at the viewport's scale, y up to y down. */
function placer(drawing: Drawing2D, vp: NonNullable<ProjectSheet['viewports']>[number]): (p: Point2D) => Point2D {
  const k = 1000 / vp.scale;
  const cx = vp.center?.x ?? (drawing.bounds.min.x + drawing.bounds.max.x) / 2;
  const cy = vp.center?.y ?? (drawing.bounds.min.y + drawing.bounds.max.y) / 2;
  return (p) => ({ x: vp.x + (p.x - cx) * k, y: vp.y - (p.y - cy) * k });
}

/** `sheet` as shapes on its paper, its drawings taken from `drawings` (by view id); a view without one keeps its title only. */
export function sheetGraphic(sheet: ProjectSheet, doc: ProjectDocument, drawings: ReadonlyMap<string, Drawing2D>): SheetGraphic {
  const paper = paperOf(sheet);
  const out: SheetGraphic = { sheetId: sheet.id, number: sheet.number, name: sheet.name, paper, frame: [rect(frameRect(paper, frameOf(sheet)))], cut: [], lines: [], texts: [] };
  const vps = sheet.viewports ?? [];
  for (const vp of vps) {
    const view = doc.views.find((v) => v.id === vp.viewId);
    const drawing = drawings.get(vp.viewId);
    let below = vp.y + 10;
    if (drawing && Number.isFinite(drawing.bounds.min.x)) {
      const at = placer(drawing, vp);
      for (const polygon of drawing.cutPolygons) {
        out.cut.push(polygon.polygon.outer.map(at));
        for (const hole of polygon.polygon.holes) out.cut.push(hole.map(at));
      }
      for (const line of drawing.lines) if (line.visibility !== 'hidden') out.lines.push([at(line.line.start), at(line.line.end)]);
      below = at({ x: 0, y: drawing.bounds.min.y }).y + 8;
    }
    if (view) out.texts.push({ at: { x: vp.x, y: below }, text: `${view.name}  1:${vp.scale}`, size: 3.5, align: 'center' });
  }
  const block = titleBlock(sheet, doc, paper, [...new Set(vps.map((v) => v.scale))]);
  out.frame.push(...block.frame);
  out.texts.push(...block.texts);
  return out;
}
