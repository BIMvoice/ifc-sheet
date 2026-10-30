/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafts of a view as its viewport prints them on the paper (#479): drafted lines with their layer's pen, dimensions (their
 * extension and dimension lines, ticks and figure) and texts. Each is laid out by the code the app's sheet draws it with: the
 * dimension by `linearLayout` and `arrowMark`, its figure by `formatDimension` in the entity's resolved style (`lookOf`), its size
 * by the viewport's scale (`annotationAtFactor`), its place by the viewport's `placer`, which is the sheet's own transform
 * (`placement-parity.test.ts`). A layer the view or viewport hides is left off, as on the sheet.
 *
 * Drawn with them (`sheet-marks.ts`): level marks, leaders, radial and angular dimensions, grid axes, hatches, and circles and arcs.
 *
 * Symbols are drawn too (`sheet-symbols.ts`), from the built-in library and the project's own, with the scale of the viewport and the
 * north and coordinates of the model (`site-frame.ts`): a coordinate point on a model with a map conversion prints Easting and
 * Northing, on one without it the local X and Y.
 *
 * A text's frame and leader are drawn (`sheet-text-frame.ts`), and a dimension figure moved off its line carries its leader
 * (`dimension-figure.ts`). The frame is measured with the width table, the app with the browser's font where it has one.
 */

import type { Point2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { ProjectView, SheetViewport } from './document.js';
import { clipPolyline, pointInBox } from './clip.js';
import { dimensionLayout } from './dimension-figure.js';
import { entityPen, formatDimension, layerPrints, layerShows, lookOf, type CustomLineType, type LayerGroup, type StyleBook } from './draft-look.js';
import { AXIS_NAME } from './drawing-frame.js';
import { isGeometry, type DraftEntity, type DraftLayer, type Pt } from './draft-types.js';
import type { HatchPattern } from './hatch-pattern.js';
import type { Rect } from './sheet-frame.js';
import type { SheetText } from './sheet-graphic.js';
import { drawAxis, drawCurve, drawHatch, drawLeader, drawLevel, type MarkContext } from './sheet-marks.js';
import { drawSymbol } from './sheet-symbols.js';
import { drawTextFrame, upOf } from './sheet-text-frame.js';
import { liveSymbolContext, COORDINATE_LABELS, type SiteFrame } from './site-frame.js';
import { findSymbol, type DraftSymbol } from './symbols.js';
import { label, readableAngle, textInk, tickStrokes, type Frame, type SheetStroke } from './sheet-stroke.js';
import type { SheetLocale } from './units-and-numbers.js';
import { annotationAtFactor, annotationFactor, viewportPaperUnit } from './viewport-annotation.js';
import { viewportHiddenLayers } from './view-templates.js';

/** What the viewports' drafts are drawn with: the project's drafts, layers, layer groups and styles, and the language of the figures. */
export interface SheetAnnotations {
  drafts: readonly DraftEntity[];
  layers: readonly DraftLayer[];
  groups: readonly LayerGroup[];
  /** The project's own line types, which a layer or a drafted line may name (absent: only the built-in ones). */
  lineTypes?: readonly CustomLineType[];
  book: StyleBook;
  /** The project's own hatch patterns (a pattern the library lacks); a hatch names its pattern. */
  patterns?: readonly HatchPattern[];
  /** The project's own symbols; a symbol names one, or a built-in. */
  symbols?: readonly DraftSymbol[];
  /** The model's frame, for the north arrow and the coordinate point; without it they are drawn as placed. */
  site?: SiteFrame;
  locale: SheetLocale;
}

export type { SheetStroke };

/**
 * The drafts on `vp`'s view, on the paper. `at` maps a drawing point to the paper; `box` clips the lines and drops a text whose anchor is outside it, as the app's sheet clips a viewport's drafts (the viewport's room),
 * none when the layout gave the view none. A key plan prints no drafts, as on the sheet.
 */
export function viewportAnnotations(
  input: { view: ProjectView | undefined; vp: SheetViewport; at: (p: Pt) => Point2D; frame: Frame; box: Rect | null; plane?: SectionPlaneConfig },
  a: SheetAnnotations,
): { strokes: SheetStroke[]; texts: SheetText[] } {
  const { view, vp, at, frame, box, plane } = input;
  const out: { strokes: SheetStroke[]; texts: SheetText[] } = { strokes: [], texts: [] };
  if (vp.keyPlanOf !== undefined) return out;
  const hidden = viewportHiddenLayers(view, vp);
  const layerOf = new Map(a.layers.map((l) => [l.id, l]));
  const clip = (pts: Point2D[]) => (box ? clipPolyline(pts, box) : [pts]);
  // Annotation prints at the paper size it was drawn for, whatever scale the viewport shows the view at.
  const paperUnit = viewportPaperUnit(vp.scale);
  const factor = annotationFactor(vp.scale, view?.scale);
  const mmPerMetre = 1000 / vp.scale;
  const own = a.symbols ?? [];
  // Scale bar, north arrow and coordinate points follow this viewport's scale and the model, as the sheet's do (`siteplan/live-symbols.ts`).
  const axis = plane ? AXIS_NAME[plane.axis] : 'down';
  const live = a.site ? liveSymbolContext(a.site, plane, axis, vp.scale, a.locale, COORDINATE_LABELS) : null;
  const context = (colour: string, look: MarkContext['look']): MarkContext => ({ at, frame, clip, box, mmPerMetre, colour, look, locale: a.locale, patterns: a.patterns ?? [], out });
  for (const e of a.drafts) {
    if (e.viewId !== vp.viewId) continue;
    const layer = layerOf.get(e.layerId);
    if (layer && !layerShows(layer, a.groups, { view: hidden })) continue;
    // A layer switched off for printing is on the screen only (the app's sheet marks it `data-print-ignore`).
    if (!layerPrints(layer)) continue;
    const colour = layer?.color ?? '#000';
    const shape = e.shape;
    if (isGeometry(shape)) {
      drawCurve(shape, entityPen(layer, e.params, a.lineTypes), { at, clip, out });
      continue;
    }
    const mark = context(colour, lookOf(a.book, e.params));
    const sized = annotationAtFactor(shape, factor, (id) => findSymbol(id, own)?.unit === 'paper');
    const look = mark.look;
    if (sized.type === 'text') {
      const px = sized.height * mmPerMetre;
      const deg = readableAngle(sized.rotation, frame);
      // One label per line, each a line pitch under the one before, in the text's own frame.
      sized.text.split('\n').forEach((line, i) => out.texts.push(label(at(sized.p), line, Math.max(px, 1), deg, i * 1.25 * Math.max(px, 1), 'left', textInk(look.text, look.text.color ?? colour))));
      drawTextFrame(sized, mark, look.text, look.text.color ?? colour);
    } else if (sized.type === 'leader') drawLeader(sized, mark);
    else if (sized.type === 'level') drawLevel(sized, mark);
    else if (sized.type === 'axis') drawAxis(sized, mark);
    else if (sized.type === 'hatch') drawHatch(sized, mark);
    else if (sized.type === 'symbol') {
      drawSymbol(sized, mark, { own, live, axis });
    } else {
      const dim = look.dim;
      const o = { extGap: dim.extGap * paperUnit, extOver: dim.extOver * paperUnit, format: (m: number) => formatDimension(a.locale, m, dim), locale: a.locale };
      // A figure moved off its line carries its leader, among the layout's lines (`dimension-figure.ts`).
      const layout = dimensionLayout(sized, o, { up: upOf(frame), right: frame.kx });
      const ink = dim.color ?? colour;
      // The sheet's widths for a dimension on paper (`strokeScale` 0.25): lines 0.75 of it, ticks 1.5.
      out.strokes.push({ colour: ink, width: 0.1875, runs: layout.lines.flatMap((l) => clip([at(l.a), at(l.b)])) });
      const tips = layout.ticks.map((tick) => {
        const p = at(tick.at);
        const q = at({ x: tick.at.x + tick.dir.x, y: tick.at.y + tick.dir.y });
        return { p, dir: { x: q.x - p.x, y: q.y - p.y } };
      });
      out.strokes.push(...tickStrokes(dim.arrow, tips, Math.max(dim.arrowSize, 0.75), ink, 0.375));
      const px = sized.height * mmPerMetre;
      // Above the line in the text's own frame (screen-up for a level line, screen-left for an upright one); centred breaks the line under it.
      const shift = dim.placement === 'centered' ? px * 0.35 : dim.placement === 'below' ? dim.textGap + px * 0.8 : -dim.textGap;
      out.texts.push(label(at(layout.textAt), layout.label, Math.max(px, 1), readableAngle(layout.textAngle, frame), shift, 'center', textInk(look.text, look.text.color ?? dim.color ?? colour)));
    }
  }
  if (box) out.texts = out.texts.filter((t) => pointInBox(t.at, box));
  return out;
}
