/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafted annotation other than a dimension, on the paper (#479): leaders, level marks, grid axes, hatches, and circles and
 * arcs. Each is drawn as the app's sheet draws it (`AnnotationGraphics.tsx`, `DraftOverlay.tsx`), from the layout code they share
 * (`dimension-layout.ts`, `hatch-fill.ts`), at the sheet's pen widths (the app draws a sheet with `strokeScale` 0.25,
 * so each width here is the app's pixel width times 0.25).
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import { clipPolygon } from './clip.js';
import { arcPoints, axisLayout, formatLevel, leaderTextRight, levelWitness } from './dimension-layout.js';
import { dashOf, type entityPen, type lookOf } from './draft-look.js';
import type { AnnotationShape, DraftShape, Pt } from './draft-types.js';
import { hatchSegments } from './hatch-fill.js';
import { HATCH_UNIT_M, findPattern } from './hatch-library.js';
import type { HatchPattern } from './hatch-pattern.js';
import type { Rect } from './sheet-frame.js';
import type { SheetText } from './sheet-graphic.js';
import { label, textInk, tickStrokes, type Frame, type SheetStroke, type TextInk } from './sheet-stroke.js';
import type { SheetLocale } from './units-and-numbers.js';

/** What a mark is drawn with: the viewport's mapping to the paper, its room, and the draft's layer colour and look. */
export interface MarkContext {
  /** A drawing point on the paper. */
  at: (p: Pt) => Point2D;
  frame: Frame;
  /** The runs of `pts` that lie in the viewport's room. */
  clip: (pts: Point2D[]) => Point2D[][];
  /** The viewport's room; none when the layout gave the view none. */
  box: Rect | null;
  /** Paper mm per drawing metre. */
  mmPerMetre: number;
  colour: string;
  look: ReturnType<typeof lookOf>;
  locale: SheetLocale;
  patterns: readonly HatchPattern[];
  out: { strokes: SheetStroke[]; texts: SheetText[] };
}

/** The app's sheet scales its pixel widths by this. */
const K = 0.25;

/** One label per line, each a line pitch under the one before, in the text's own frame. */
function lines(text: string, at: Point2D, px: number, deg: number, align: SheetText['align'], shift: number, ink: TextInk): SheetText[] {
  const size = Math.max(px, 1);
  return text.split('\n').map((line, i) => label(at, line, size, deg, shift + i * 1.25 * size, align, ink));
}

/** A mark's text in its text style, coloured as the app colours it: the style's colour, else the layer's. */
const markInk = (c: MarkContext): TextInk => textInk(c.look.text, c.look.text.color ?? c.colour);

/** A drafted line, polyline, circle or arc, in the pen the app draws it with (`entityPen`: its layer's, under the element's own overrides). */
export function drawCurve(shape: DraftShape, pen: Pick<ReturnType<typeof entityPen>, 'color' | 'width' | 'dash'>, c: MarkContext): void {
  const pts = shape.type === 'line' ? [shape.a, shape.b]
    : shape.type === 'polyline' ? (shape.closed ? [...shape.pts, shape.pts[0]] : shape.pts)
    : shape.type === 'circle' ? arcPoints(shape.c, shape.r, 0, Math.PI * 2) : arcPoints(shape.c, shape.r, shape.start, shape.end);
  c.out.strokes.push({ colour: pen.color, width: pen.width, ...(pen.dash.length ? { dash: pen.dash } : {}), runs: c.clip(pts.map(c.at)) });
}

/** A leader: its line, an arrow at the tip, the text beyond the end of the last segment. */
export function drawLeader(shape: Extract<AnnotationShape, { type: 'leader' }>, c: MarkContext): void {
  const [a, b] = [c.at(shape.pts[0]), c.at(shape.pts[1] ?? shape.pts[0])];
  const end = c.at(shape.pts[shape.pts.length - 1]);
  const right = leaderTextRight(shape.pts, c.frame.kx);
  const px = shape.height * c.mmPerMetre;
  c.out.strokes.push({ colour: c.colour, width: K, runs: c.clip(shape.pts.map(c.at)) });
  c.out.strokes.push(...tickStrokes('arrow', [{ p: a, dir: { x: a.x - b.x, y: a.y - b.y } }], Math.max(c.look.dim.arrowSize * 1.2, 4 * K), c.colour, K));
  c.out.texts.push(...lines(shape.text, { x: end.x + (right ? 3 : -3) * K, y: end.y }, px, 0, right ? 'left' : 'right', px * 0.35, markInk(c)));
}

/** A level mark: the dashed line to the point it measures, the triangle, the line over the text, and the level. */
export function drawLevel(shape: Extract<AnnotationShape, { type: 'level' }>, c: MarkContext): void {
  const p = c.at(shape.p);
  const px = shape.height * c.mmPerMetre;
  const h = Math.max(px, 4 * K);
  const witness = levelWitness(shape);
  if (witness) c.out.strokes.push({ colour: c.colour, width: 0.5 * K, dash: [3 * K, 2 * K], runs: c.clip([c.at(witness.a), p]) });
  const triangle = [p, { x: p.x - h, y: p.y - h }, { x: p.x + h, y: p.y - h }];
  c.out.strokes.push({ colour: c.colour, width: 0, runs: [[...triangle, p]], fill: true, opacity: 0.25 });
  c.out.strokes.push({ colour: c.colour, width: K, runs: [[...triangle, p]] });
  c.out.strokes.push({ colour: c.colour, width: K, runs: [[{ x: p.x - h, y: p.y }, { x: p.x + h * 5, y: p.y }]] });
  c.out.texts.push(...lines(formatLevel(c.locale, shape.value), { x: p.x + h * 1.3, y: p.y - h * 1.15 }, px, 0, 'left', 0, markInk(c)));
}

/** A grid axis: its line in its line type, a bubble (circle or square) past the chosen ends, the label in each. */
export function drawAxis(shape: Extract<AnnotationShape, { type: 'axis' }>, c: MarkContext): void {
  const px = shape.height * c.mmPerMetre;
  const dash = dashOf(shape.lineType);
  c.out.strokes.push({ colour: c.colour, width: 0.75 * K, ...(dash.length ? { dash } : {}), runs: c.clip([c.at(shape.a), c.at(shape.b)]) });
  const { bubbles, r } = axisLayout(shape);
  const rp = r * c.mmPerMetre;
  for (const centre of bubbles) {
    const p = c.at(centre);
    const ring = shape.bubble === 'circle' ? arcPoints(p, rp, 0, Math.PI * 2)
      : [{ x: p.x - rp, y: p.y - rp }, { x: p.x + rp, y: p.y - rp }, { x: p.x + rp, y: p.y + rp }, { x: p.x - rp, y: p.y + rp }, { x: p.x - rp, y: p.y - rp }];
    c.out.strokes.push({ colour: c.colour, width: K, runs: c.clip(ring) });
    c.out.texts.push(...lines(shape.label, p, px, 0, 'center', px * 0.35, markInk(c)));
  }
}

/**
 * A hatch: a solid pattern (or one the project does not hold) as a translucent fill of the region, every other as its lines,
 * with a faint outline. The region is even-odd over all loops, so an island stays open.
 */
export function drawHatch(shape: Extract<AnnotationShape, { type: 'hatch' }>, c: MarkContext): void {
  const pattern = findPattern(shape.pattern, c.patterns);
  const loops = shape.loops.filter((l) => l.length >= 3).map((l) => l.map(c.at));
  // A fill cannot be cut open as a line is: the loop is cut to the room as a shape.
  const shown = loops.flatMap((l) => {
    const cut = c.box ? clipPolygon(l, c.box) : l;
    return cut.length >= 3 ? [[...cut, cut[0]]] : [];
  });
  if (!pattern || pattern.solid) {
    c.out.strokes.push({ colour: c.colour, width: 0, runs: shown, fill: true, region: true, opacity: pattern ? 0.85 : 0.15 });
    c.out.strokes.push({ colour: c.colour, width: 0.75 * K, runs: loops.flatMap((l) => c.clip([...l, l[0]])) });
    return;
  }
  const { segments } = hatchSegments(shape.loops, pattern, { scale: shape.scale * HATCH_UNIT_M, angleDeg: shape.angle });
  // A dot is a run of no length; the writer draws it round, so it is given a hair of length to point along.
  const runs = segments.flatMap((s) => {
    const [a, b] = [c.at(s.a), c.at(s.b)];
    return c.clip(a.x === b.x && a.y === b.y ? [a, { x: a.x + 0.01, y: a.y }] : [a, b]);
  });
  c.out.strokes.push({ colour: c.colour, width: 0.6 * K, runs, round: true });
  c.out.strokes.push({ colour: c.colour, width: 0.4 * K, runs: loops.flatMap((l) => c.clip([...l, l[0]])), opacity: 0.6 });
}
