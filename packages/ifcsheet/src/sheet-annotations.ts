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
 * Not drawn yet, and reported through `onSkipped`: level marks, leaders, radial and angular dimensions, grid axes, symbols,
 * hatches, circles and arcs, a text's frame and leader, and a dimension figure's leader when the figure was moved off its line.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { ProjectView, SheetViewport } from './document.js';
import { clipPolyline, pointInBox } from './clip.js';
import { arrowMark, linearLayout } from './dimension-layout.js';
import { entityPen, formatDimension, layerPrints, layerShows, lookOf, readableDeg, type CustomLineType, type LayerGroup, type StyleBook } from './draft-look.js';
import type { AnnotationShape, DraftEntity, DraftLayer, Pt } from './draft-types.js';
import type { Rect } from './sheet-frame.js';
import type { SheetText } from './sheet-graphic.js';
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
  locale: SheetLocale;
  /** A draft of a kind not printed yet, once per draft. */
  onSkipped?: (kind: AnnotationShape['type'] | 'circle' | 'arc', view: ProjectView | undefined) => void;
}

/** Runs drawn with one pen on the paper: a drafted line's layer pen, a dimension's lines or its filled ticks. */
export interface SheetStroke {
  colour: string;
  /** Paper mm. */
  width: number;
  /** Paper mm; absent: solid. */
  dash?: readonly number[];
  runs: readonly (readonly Point2D[])[];
  /** Filled instead of stroked (an arrow head); each run is closed. */
  fill?: boolean;
}

/** The way a drawing's axes run on the paper (`paperSigns`): what a drawing angle reads as there. */
interface Frame {
  kx: 1 | -1;
  ky: 1 | -1;
}

/** A drawing-space angle (radians) as the sheet's text angle: screen degrees, y down, folded to read (`readableDeg`). */
const readableAngle = (angle: number, { kx, ky }: Frame): number => readableDeg((Math.atan2(Math.sin(angle) * ky, Math.cos(angle) * kx) * 180) / Math.PI);

/** A text on the paper as the sheet's label draws it: at `p`, turned `deg` (screen, clockwise), its baseline moved `shift` in its own frame. */
function label(p: Point2D, text: string, size: number, deg: number, shift: number, align: SheetText['align']): SheetText {
  const r = (deg * Math.PI) / 180;
  return { at: { x: p.x - shift * Math.sin(r), y: p.y + shift * Math.cos(r) }, text, size, align, ...(deg ? { angle: -deg } : {}) };
}

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
  for (const e of a.drafts) {
    if (e.viewId !== vp.viewId) continue;
    const layer = layerOf.get(e.layerId);
    if (layer && !layerShows(layer, a.groups, { view: hidden })) continue;
    // A layer switched off for printing is on the screen only (the app's sheet marks it `data-print-ignore`).
    if (!layerPrints(layer)) continue;
    const colour = layer?.color ?? '#000';
    const shape = e.shape;
    if (shape.type === 'line' || shape.type === 'polyline') {
      const pts = shape.type === 'line' ? [shape.a, shape.b] : shape.closed ? [...shape.pts, shape.pts[0]] : shape.pts;
      const pen = entityPen(layer, e.params, a.lineTypes);
      out.strokes.push({ colour: pen.color, width: pen.width, ...(pen.dash.length ? { dash: pen.dash } : {}), runs: clip(pts.map(at)) });
      continue;
    }
    if (shape.type === 'circle' || shape.type === 'arc') {
      a.onSkipped?.(shape.type, view);
      continue;
    }
    const sized = annotationAtFactor(shape, factor);
    const look = lookOf(a.book, e.params);
    if (sized.type === 'text') {
      const px = sized.height * mmPerMetre;
      const deg = readableAngle(sized.rotation, frame);
      // One label per line, each a line pitch under the one before, in the text's own frame.
      sized.text.split('\n').forEach((line, i) => out.texts.push(label(at(sized.p), line, Math.max(px, 1), deg, i * 1.25 * Math.max(px, 1), 'left')));
      if (sized.frame || sized.leader) a.onSkipped?.('text', view);
      continue;
    }
    if (sized.type !== 'dimension') {
      a.onSkipped?.(sized.type, view);
      continue;
    }
    const dim = look.dim;
    const layout = linearLayout(sized.a, sized.b, sized.at, sized.variant, sized.text, {
      extGap: dim.extGap * paperUnit, extOver: dim.extOver * paperUnit, format: (m) => formatDimension(a.locale, m, dim), locale: a.locale,
    });
    const ink = dim.color ?? colour;
    // The sheet's widths for a dimension on paper (`strokeScale` 0.25): lines 0.75 of it, ticks 1.5.
    out.strokes.push({ colour: ink, width: 0.1875, runs: layout.lines.flatMap((l) => clip([at(l.a), at(l.b)])) });
    const size = Math.max(dim.arrowSize, 0.75);
    const marks = layout.ticks.map((tick) => {
      const p = at(tick.at);
      const q = at({ x: tick.at.x + tick.dir.x, y: tick.at.y + tick.dir.y });
      return arrowMark(dim.arrow, p, { x: q.x - p.x, y: q.y - p.y }, size);
    });
    const open = marks.flatMap((m) => (m?.kind === 'run' && !m.fill ? [m.pts] : []));
    const filled = marks.flatMap((m) => (m?.kind === 'run' && m.fill ? [[...m.pts, m.pts[0]]] : m?.kind === 'dot' ? [dotRing(m.c, m.r)] : []));
    if (open.length) out.strokes.push({ colour: ink, width: 0.375, runs: open });
    if (filled.length) out.strokes.push({ colour: ink, width: 0, runs: filled, fill: true });
    const px = sized.height * mmPerMetre;
    // Above the line in the text's own frame (screen-up for a level line, screen-left for an upright one); centred breaks the line under it.
    const shift = dim.placement === 'centered' ? px * 0.35 : dim.placement === 'below' ? dim.textGap + px * 0.8 : -dim.textGap;
    out.texts.push(label(at(sized.textAt ?? layout.textAt), layout.label, Math.max(px, 1), readableAngle(layout.textAngle, frame), shift, 'center'));
    if (sized.textAt) a.onSkipped?.('dimension', view);
  }
  if (box) out.texts = out.texts.filter((t) => pointInBox(t.at, box));
  return out;
}

/** A dot as a closed ring of points, for writers that fill paths. */
function dotRing(c: Point2D, r: number): Point2D[] {
  const n = 12;
  return Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
}
