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
 * Not drawn yet, and reported through `onSkipped`: symbols (their library and the north and coordinates they are drawn with are
 * the app's), a text's frame and leader (the frame is measured by the app's text widths), and a dimension figure's leader when
 * the figure was moved off its line.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { ProjectView, SheetViewport } from './document.js';
import { clipPolyline, pointInBox } from './clip.js';
import { angularLayout, linearLayout, radialLayout } from './dimension-layout.js';
import { entityPen, formatDimension, layerPrints, layerShows, lookOf, readableDeg, type CustomLineType, type LayerGroup, type StyleBook } from './draft-look.js';
import { isGeometry, type AnnotationShape, type DraftEntity, type DraftLayer, type Pt } from './draft-types.js';
import type { HatchPattern } from './hatch-pattern.js';
import type { Rect } from './sheet-frame.js';
import type { SheetText } from './sheet-graphic.js';
import { drawAxis, drawCurve, drawHatch, drawLeader, drawLevel, type MarkContext } from './sheet-marks.js';
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
  locale: SheetLocale;
  /** A draft of a kind not printed yet, once per draft. */
  onSkipped?: (kind: AnnotationShape['type'], view: ProjectView | undefined) => void;
}

export type { SheetStroke };

/**
 * The drafts on `vp`'s view, on the paper. `at` maps a drawing point to the paper; `box` clips the lines and drops a text whose anchor is outside it, as the app's sheet clips a viewport's drafts (the viewport's room),
 * none when the layout gave the view none. A key plan prints no drafts, as on the sheet.
 */
export function viewportAnnotations(
  input: { view: ProjectView | undefined; vp: SheetViewport; at: (p: Pt) => Point2D; frame: Frame; box: Rect | null },
  a: SheetAnnotations,
): { strokes: SheetStroke[]; texts: SheetText[] } {
  const { view, vp, at, frame, box } = input;
  const out: { strokes: SheetStroke[]; texts: SheetText[] } = { strokes: [], texts: [] };
  if (vp.keyPlanOf !== undefined) return out;
  const hidden = viewportHiddenLayers(view, vp);
  const layerOf = new Map(a.layers.map((l) => [l.id, l]));
  const clip = (pts: Point2D[]) => (box ? clipPolyline(pts, box) : [pts]);
  // Annotation prints at the paper size it was drawn for, whatever scale the viewport shows the view at.
  const paperUnit = viewportPaperUnit(vp.scale);
  const factor = annotationFactor(vp.scale, view?.scale);
  const mmPerMetre = 1000 / vp.scale;
  const context = (colour: string, look: MarkContext['look']): MarkContext => ({ at, frame, clip, box, mmPerMetre, colour, look, locale: a.locale, patterns: a.patterns ?? [], out });
  for (const e of a.drafts) {
    if (e.viewId !== vp.viewId) continue;
    const layer = layerOf.get(e.layerId);
    if (layer && !layerShows(layer, a.groups, { view: hidden })) continue;
    // A layer switched off for printing is on the screen only (the app's sheet marks it `data-print-ignore`).
    if (!layerPrints(layer)) continue;
    const colour = layer?.color ?? '#000';
    const shape = e.shape;
    const mark = context(colour, lookOf(a.book, e.params));
    if (isGeometry(shape)) {
      drawCurve(shape, entityPen(layer, e.params, a.lineTypes), mark);
      continue;
    }
    const sized = annotationAtFactor(shape, factor);
    const look = mark.look;
    if (sized.type === 'text') {
      const px = sized.height * mmPerMetre;
      const deg = readableAngle(sized.rotation, frame);
      // One label per line, each a line pitch under the one before, in the text's own frame.
      sized.text.split('\n').forEach((line, i) => out.texts.push(label(at(sized.p), line, Math.max(px, 1), deg, i * 1.25 * Math.max(px, 1), 'left', textInk(look.text, look.text.color ?? colour))));
      if (sized.frame || sized.leader) a.onSkipped?.('text', view);
    } else if (sized.type === 'leader') drawLeader(sized, mark);
    else if (sized.type === 'level') drawLevel(sized, mark);
    else if (sized.type === 'axis') drawAxis(sized, mark);
    else if (sized.type === 'hatch') drawHatch(sized, mark);
    else if (sized.type === 'symbol') a.onSkipped?.('symbol', view);
    else {
      const dim = look.dim;
      const o = { extGap: dim.extGap * paperUnit, extOver: dim.extOver * paperUnit, format: (m: number) => formatDimension(a.locale, m, dim), locale: a.locale };
      const layout = sized.type === 'dimension' ? linearLayout(sized.a, sized.b, sized.at, sized.variant, sized.text, o)
        : sized.type === 'radial' ? radialLayout(sized.c, sized.r, sized.at, sized.diameter, o) : angularLayout(sized.c, sized.a, sized.b, sized.at, o);
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
      const textAt = sized.type === 'dimension' ? sized.textAt : undefined;
      out.texts.push(label(at(textAt ?? layout.textAt), layout.label, Math.max(px, 1), readableAngle(layout.textAngle, frame), shift, 'center', textInk(look.text, look.text.color ?? dim.color ?? colour)));
      if (textAt) a.onSkipped?.('dimension', view);
    }
  }
  if (box) out.texts = out.texts.filter((t) => pointInBox(t.at, box));
  return out;
}
