/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A sheet laid out as plain shapes on its paper, millimetres from the top-left
 * corner: the frame line and the title block (`sheet-frame.ts`), each
 * viewport's drawing at its scale, each drawing's title under it. The PDF and
 * DXF writers draw from this one layout, so they cannot disagree.
 *
 * Headless. Each viewport's faces and lines carry the pens the web app's sheet
 * gives them (`pens`): styled by the view's one styler (`view-style.ts`) and
 * grouped by `penGroups`, as the app's `viewport-pens.ts` does, so the same
 * view has the same colours, weights, dashes and fills in the app and here.
 * The web app draws its sheets as SVG through React (`components/viewer/sheets/`),
 * with hatches, symbols and annotation on top; this
 * layout carries the geometry and pens of the same sheet and the title block
 * the app prints (its layout, the fields the model fills, the revision, the logo). Moving the
 * app's hatches and symbols here is a follow-up.
 */

import type { Drawing2D, Point2D } from '@ifc-lite/drawing-2d';
import { sheetScaleLine } from './sheet-scale.js';
import { clipPolygon, clipPolyline } from './clip.js';
import type { SchemeResult } from './colour-fills.js';
import { schemeLegend, viewportFills, type SheetFill } from './sheet-colours.js';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { viewCentre, viewExtent, type ModelExtent } from './drawing-set.js';
import { drawingAreaIn, frameOf, frameRect, titleBlockRect, type Rect } from './sheet-frame.js';
import { LOGO_FIELD } from './title-block-fields.js';
import { printTitleBlock, sheetLookup } from './title-block-print.js';
import { standardTitleBlock } from './title-block-standard.js';
import { resolveViewGraphics } from './view-templates.js';
import { penGroups, penOrder, type PenLayer } from './drawing-pens.js';
import { PEN_TABLE, viewStyler, type PenTable, type ViewStyleInputs } from './view-style.js';
import { paperOf } from './viewport-fit.js';
import { sheetNoteLines } from './sheet-notes.js';
import { viewportAnnotations, type SheetAnnotations, type SheetStroke } from './sheet-annotations.js';
import { placedListSchedule, scheduleGraphics, type SheetSchedules } from './sheet-schedules.js';

export type Polyline = readonly Point2D[];

export interface SheetText {
  at: Point2D;
  text: string;
  /** Text height, paper mm. */
  size: number;
  align?: 'left' | 'center' | 'right';
  /** Degrees counter-clockwise about `at` (a title block strip reads upward); absent is level. */
  angle?: number;
}

/** One pen of a viewport's drawing on the paper: a fill (its regions, each an outer loop and holes filled even-odd) or a stroke (its runs). */
export interface SheetPen {
  layer: PenLayer;
  stroke: string | null;
  /** Paper mm; 0 for a fill. */
  width: number;
  fill: string | null;
  /** Paper mm; absent: solid. */
  dash?: readonly number[];
  /** A stroke's runs, clipped to the viewport. */
  runs: Polyline[];
  /** A fill's regions, clipped to the viewport; each loop ends where it starts. */
  regions: Polyline[][];
}

/** An image on the paper, fitted whole and centred in `box` (paper mm): the title block's logo. */
export interface SheetImage {
  /** A PNG or JPEG data URL. */
  src: string;
  box: Rect;
  /** Degrees counter-clockwise: 90 for a logo in a strip down the frame's side, which reads upward; absent is level. */
  angle?: 90;
}

export interface SheetGraphic {
  sheetId: string;
  number: string;
  name: string;
  /** Paper width and height, mm. */
  paper: { w: number; h: number };
  /** The frame line, the title block's box and its rule; each rectangle ends where it starts. */
  frame: Polyline[];
  /** The regions a view's colour scheme fills (#92), under every line: its rooms and elements, and the swatches of its legend. */
  fills: SheetFill[];
  /** The outlines of cut faces, clipped to their viewport; a ring wholly inside ends where it starts. */
  cut: Polyline[];
  /** Every other visible line of the drawings, clipped to their viewport. */
  lines: Polyline[];
  /** What the PDF and DXF draw of the viewports' drawings: their faces and lines by pen, as the app's sheet pens them, in paint order. */
  pens: SheetPen[];
  /** The sheet's own marks drawn with a plain pen: a colour legend's frame and swatch outlines. */
  marks: Polyline[];
  /** What a project drew on the sheet with its own pens (#479): the views' drafts and dimensions, the placed schedules' rules; absent: none. */
  strokes?: SheetStroke[];
  texts: SheetText[];
  /** The images the sheet carries: the title block's logo. */
  images: SheetImage[];
  /** The box each viewport's drawing is clipped to, paper mm: the room the layout made for it. */
  viewports: { viewId: string; box: Rect }[];
}

/** A rectangle as a closed run of points (the first repeated last), so it reads whole in an open-polyline layer. */
const rect = (r: { x: number; y: number; w: number; h: number }): Polyline => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }];

/** The logo as the PDF can draw it: a PNG or JPEG data URL. An SVG logo, which the app shows, is not drawn here yet. */
export function printableLogo(src: string | undefined): string | undefined {
  return src && /^data:image\/(png|jpeg);base64,/i.test(src) ? src : undefined;
}

/**
 * The title block: the layout the project keeps (`doc.titleBlockTemplate`: the Romanian one, or any the app edited),
 * else the standard one, as the app does (`title-block-standard.ts`). `projectFields` are the project's fields
 * resolved from the model (`title-block-sources.ts`); without them the document's typed values are all there is.
 */
function titleBlock(sheet: ProjectSheet, doc: ProjectDocument, paper: { w: number; h: number }, scale: string, projectFields?: Record<string, string>, language?: string): { frame: Polyline[]; texts: SheetText[]; images: SheetImage[] } {
  const tb = titleBlockRect(paper, frameOf(sheet));
  const template = doc.titleBlockTemplate ?? standardTitleBlock();
  return printTitleBlock(template, sheetLookup(sheet, doc, scale, projectFields, language), tb, frameOf(sheet).titleBlock === 'right', printableLogo((projectFields ?? doc.titleBlock)?.[LOGO_FIELD]));
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
export function sheetGraphic(
  sheet: ProjectSheet, doc: ProjectDocument, drawings: ReadonlyMap<string, Drawing2D>, extent?: ModelExtent | null, schemes: ReadonlyMap<string, SchemeResult> = new Map(),
  globalIdOf?: (entityId: number) => string | undefined,
  /** An element's properties, for a preset's property rules (`view-style.ts`). */
  propertiesOf?: ViewStyleInputs['propertiesOf'],
  pens: PenTable = PEN_TABLE,
  /** The IfcMaterial a cut band is, for a template's material rules (#31). */
  materialOf?: ViewStyleInputs['materialOf'],
  /** The project's title block fields as the model fills them (`projectTitleFields`); absent: the document's typed values. */
  projectFields?: Record<string, string>,
  /** The language the title block's dates are written in (`formatTitleBlockDate`); absent: as stored. */
  language?: string,
  /** A saved project's drafts and placed schedules (#479); absent: the sheet carries its views only. */
  project?: { annotations?: SheetAnnotations; schedules?: SheetSchedules },
): SheetGraphic {
  const paper = paperOf(sheet);
  const out: SheetGraphic = { sheetId: sheet.id, number: sheet.number, name: sheet.name, paper, frame: [rect(frameRect(paper, frameOf(sheet)))], fills: [], cut: [], lines: [], pens: [], marks: [], texts: [], images: [], viewports: [] };
  const vps = sheet.viewports ?? [];
  const strokes: SheetStroke[] = [];
  for (const vp of vps) {
    // A schedule placed here instead of a view: laid out and placed as the app's sheet does (`sheet-schedules.ts`).
    const schedule = project?.schedules ? placedListSchedule(sheet, doc.sheets, vp, project.schedules) : null;
    if (schedule) {
      const g = scheduleGraphics(schedule, vp);
      strokes.push(...g.strokes);
      out.texts.push(...g.texts);
      out.viewports.push({ viewId: vp.viewId, box: g.box });
      continue;
    }
    const view = doc.views.find((v) => v.id === vp.viewId);
    const drawing = drawings.get(vp.viewId);
    const k = 1000 / vp.scale;
    const size = view && extent ? viewExtent(view, extent)
      : drawing ? { w: drawing.bounds.max.x - drawing.bounds.min.x, h: drawing.bounds.max.y - drawing.bounds.min.y } : null;
    const box: Rect | null = size && Number.isFinite(size.w + size.h) ? { x: vp.x - (size.w * k) / 2, y: vp.y - (size.h * k) / 2, w: size.w * k, h: size.h * k } : null;
    if (box) out.viewports.push({ viewId: vp.viewId, box });
    if (drawing && box && Number.isFinite(drawing.bounds.min.x)) {
      const at = placer(drawing, vp, view && extent ? viewCentre(view, extent) : null);
      const scheme = schemes.get(vp.viewId);
      if (scheme) out.fills.push(...viewportFills(drawing, scheme, at, box));
      // How the view draws (its template's graphics, then its own, `resolveViewGraphics`; its single elements and lines, `element-graphics.ts`; its preset's
      // rules), through the one styler the app's sheets use: what it hides is not on the sheet, and the rest carries the app's pens. Elements are known by
      // GlobalId (`globalIdOf`), never by the express id the drawing carries.
      const styler = viewStyler({ graphics: resolveViewGraphics(view, doc.viewTemplates), pens, globalIdOf, propertiesOf, materialOf });
      for (const polygon of drawing.cutPolygons.filter((p) => styler.face(p).visible)) {
        for (const ring of [polygon.polygon.outer, ...polygon.polygon.holes]) out.cut.push(...clipPolyline(closeRing(ring.map(at)), box));
      }
      for (const line of drawing.lines) {
        if (line.visibility === 'hidden' || !styler.line(line).visible) continue;
        out.lines.push(...clipPolyline([at(line.line.start), at(line.line.end)], box));
      }
      // A face a colour scheme paints is in `fills` already (`viewportFills`), under the linework.
      const painted = scheme?.elementColours;
      for (const g of penGroups(drawing.cutPolygons.filter((p) => !painted?.has(p.entityId)), drawing.lines, styler)) {
        const regions = g.faces.map((p) => [p.polygon.outer, ...p.polygon.holes].map((l) => clipPolygon(l.map(at), box)).filter((l) => l.length >= 3).map(closeRing)).filter((r) => r.length > 0);
        const runs = g.lines.flatMap((l) => clipPolyline([at(l.line.start), at(l.line.end)], box));
        if (regions.length || runs.length) out.pens.push({ layer: g.layer, stroke: g.stroke, width: g.width, fill: g.fill, ...(g.dash ? { dash: g.dash.split(' ').map(Number) } : {}), runs, regions });
      }
    }
    // The view's drafts and dimensions, by the sheet's own transform (`placer`) and layout (`sheet-annotations.ts`).
    if (drawing && project?.annotations && Number.isFinite(drawing.bounds.min.x)) {
      const at = placer(drawing, vp, view && extent ? viewCentre(view, extent) : null);
      const drafted = viewportAnnotations({ view, vp, at, frame: paperSigns(drawing.config.plane.axis), box, plane: drawing.config.plane }, project.annotations);
      strokes.push(...drafted.strokes);
      out.texts.push(...drafted.texts);
    }
    if (view) out.texts.push({ at: { x: vp.x, y: (box ? box.y + box.h : vp.y) + 8 }, text: `${view.name}  1:${vp.scale}`, size: 3.5, align: 'center' });
  }
  // The legend of each coloured view, in the free place of the drawing area nearest its bottom-right corner (the viewports and their titles are not free).
  const taken = out.viewports.map(({ box }) => ({ x: box.x, y: box.y, w: box.w, h: box.h + 12 }));
  taken.push(titleBlockRect(paper, frameOf(sheet)));
  for (const vp of vps) {
    const view = doc.views.find((v) => v.id === vp.viewId);
    const entries = schemes.get(vp.viewId)?.entries;
    const scheme = view?.graphics?.colourScheme;
    const legend = entries && scheme ? schemeLegend(entries, scheme.property, drawingAreaIn(paper, frameOf(sheet)), taken, scheme.title) : null;
    if (!legend) continue;
    taken.push(legend.box);
    out.fills.push(...legend.fills);
    out.marks.push(...legend.lines);
    out.texts.push(...legend.texts);
  }
  out.pens.sort((a, b) => penOrder(a, pens.pens.cut) - penOrder(b, pens.pens.cut));
  const block = titleBlock(sheet, doc, paper, sheetScaleLine(sheet, doc.views), projectFields, language);
  out.frame.push(...block.frame);
  out.texts.push(...block.texts);
  out.texts.push(...sheetNoteLines(sheet).map(({ at, text, size }): SheetText => ({ at, text, size })));
  out.images.push(...block.images);
  if (strokes.length) out.strokes = strokes;
  return out;
}
