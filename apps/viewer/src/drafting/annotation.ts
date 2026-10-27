/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation geometry: where a dimension's lines, arrows and value go,
 * the geometric "skeleton" an annotation is picked, bounded and snapped by,
 * and the move / rotate / mirror of any entity shape (geometry delegates to
 * `transform.ts`; annotations map their points and keep text readable).
 */

import { nearestOnShape, shapeBounds } from './curves';
import { placeSymbol as placeLevelMark } from './level-mark';
import { mirrorShape, rotateShape, translateShape } from './transform';
import { findSymbol, missingSymbolMark, placeSymbol } from './symbols';
import { add, mirrorPt, rotatePt, scale, sub } from './vec';
import { figureUp, leaderOf } from './figure-layout';
import { leaderTextRight } from './leader-segments';
import { leaderStart } from '@/labels/label-leader';
import { angularLayout, axisLayout as engineAxisLayout, formatLength, formatLevel, linearLayout, radialLayout, type DimensionLayout, type LayoutOptions } from '@bimvoice/ifcsheet';
import { textBlock, type TextFrame } from './text-block';
// A linear dimension's layout and the length format are the engine's (`dimension-layout.ts`), so the PDF of `ifcsheet build` prints the same figure (#479).
export { formatLength, type DimensionLayout, type LayoutOptions };
import { isGeometry, type AnnotationShape, type AxisShape, type DraftShape, type EntityShape, type Pt } from './types';

// The level figure, the radial and angular layouts and the axis bubbles are the engine's too (`dimension-layout.ts`).
export { formatLevel };

/**
 * The short leader a figure carries when it was moved off its dimension line (above, below, or past the end of
 * the string): from the middle of the line to the figure's near edge. Nothing for a figure left on the line.
 */
function figureLeader(layout: DimensionLayout, textAt: Pt, height: number): { a: Pt; b: Pt }[] {
  const line = layout.lines[2];
  const along = { x: Math.cos(layout.textAngle), y: Math.sin(layout.textAngle) };
  const l = leaderOf(add(line.a, scale(sub(line.b, line.a), 0.5)), textAt, height, figureUp(along, screenUp, screenRight), along, textBlock(layout.label, height).outer.x1);
  return l ? [l] : [];
}

export function dimensionLayout(shape: Extract<AnnotationShape, { type: 'dimension' | 'radial' | 'angular' }>, o: LayoutOptions = {}): DimensionLayout {
  if (shape.type === 'dimension') {
    const layout = linearLayout(shape.a, shape.b, shape.at, shape.variant, shape.text, o);
    return shape.textAt ? { ...layout, lines: [...layout.lines, ...figureLeader(layout, shape.textAt, shape.height)], textAt: shape.textAt } : layout;
  }
  if (shape.type === 'radial') return radialLayout(shape.c, shape.r, shape.at, shape.diameter, o);
  return angularLayout(shape.c, shape.a, shape.b, shape.at, o);
}

/**
 * Which way is "up on screen" in drawing y for the view being annotated
 * (+1 for sections / elevations, −1 for plans, whose drawing y points down
 * on screen). Text boxes grow upward on screen.
 */
let screenUp: 1 | -1 = 1;
export function setAnnotationScreenUp(sign: 1 | -1): void {
  screenUp = sign;
}

/**
 * Run `fn` with the screen-up direction of the view an entity lives in, then
 * put the session's back. Anything derived from an entity's text box (a
 * leader's tip, a section symbol's letter) is measured with this, so it comes
 * out the same whichever view the session happens to be looking at: on a page
 * that has just opened a project, none.
 */
export function withAnnotationScreenUp<T>(sign: 1 | -1, fn: () => T): T {
  const was = screenUp;
  screenUp = sign;
  try {
    return fn();
  } finally {
    screenUp = was;
  }
}

/** Which way drawing x runs on screen for the view being annotated (-1: mirrored, as in a side view). */
let screenRight: 1 | -1 = 1;
export function setAnnotationScreenRight(sign: 1 | -1): void {
  screenRight = sign;
}
export const annotationScreenRight = (): 1 | -1 => screenRight;

/** Run `fn` as drafting on a view whose screen-up and screen-right are these, then put the session's back (the batch annotating views that are not open, #333). */
export function withAnnotationFrame<T>(up: 1 | -1, right: 1 | -1, fn: () => T): T {
  const [wasUp, wasRight] = [screenUp, screenRight];
  [screenUp, screenRight] = [up, right];
  try {
    return fn();
  } finally {
    [screenUp, screenRight] = [wasUp, wasRight];
  }
}

export { HATCH_UNIT_M } from '@bimvoice/ifcsheet';

/** The leader a text carries, drawing coordinates: from the edge of its frame to the tip on the element. */
export function textLeader(shape: Extract<AnnotationShape, { type: 'text' }>): { from: Pt; tip: Pt } | null {
  if (!shape.leader) return null;
  const pts = textBox(shape.p, shape.text, shape.height, shape.rotation, shape.frame);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const from = leaderStart({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, shape.frame === 'bubble', shape.leader);
  return from ? { from, tip: shape.leader } : null;
}

/** A text box's corners (frame included), as the text block lays it out. */
export function textBox(p: Pt, text: string, height: number, rotation: number, frame?: TextFrame): Pt[] {
  const { outer } = textBlock(text, height, frame);
  const at = (x: number, y: number): Pt => ({ x: p.x + x, y: p.y - y * screenUp });
  return [at(outer.x0, outer.y1), at(outer.x1, outer.y1), at(outer.x1, outer.y0), at(outer.x0, outer.y0)].map((c) => rotatePt(c, p, rotation));
}

export const axisLayout: (shape: AxisShape) => { bubbles: Pt[]; r: number } = engineAxisLayout;

/** The next label in a series: 1 → 2, A → B, Z → AA, A1 → A2, B' → C'. */
export function nextAxisLabel(label: string): string {
  const num = /^(.*?)(\d+)(\D*)$/.exec(label);
  if (num) return `${num[1]}${String(Number(num[2]) + 1).padStart(num[2].length, '0')}${num[3]}`;
  const letters = /^(.*?)([A-Za-z]+)([^A-Za-z]*)$/.exec(label);
  if (!letters) return label;
  const chars = letters[2].split('');
  let i = chars.length - 1;
  for (; i >= 0; i--) {
    const c = chars[i];
    if (c === 'z' || c === 'Z') { chars[i] = c === 'z' ? 'a' : 'A'; continue; }
    chars[i] = String.fromCharCode(c.charCodeAt(0) + 1);
    break;
  }
  if (i < 0) chars.unshift(letters[2][0] === letters[2][0].toLowerCase() ? 'a' : 'A');
  return `${letters[1]}${chars.join('')}${letters[3]}`;
}

/** The lines an entity is picked, bounded and snapped by. */
export function entitySkeleton(shape: EntityShape): DraftShape[] {
  if (isGeometry(shape)) return [shape];
  switch (shape.type) {
    case 'text': {
      const box: DraftShape = { type: 'polyline', pts: textBox(shape.p, shape.text, shape.height, shape.rotation, shape.frame), closed: true };
      const line = textLeader(shape);
      return line ? [box, { type: 'polyline', pts: [line.from, line.tip], closed: false }] : [box];
    }
    case 'leader': {
      const end = shape.pts[shape.pts.length - 1];
      // The text sits beyond the end of the last segment, on whichever side of the screen that is.
      const toPlusX = (leaderTextRight(shape.pts, screenRight) ? screenRight : -screenRight) > 0;
      const width = textBlock(shape.text, shape.height).box.x1;
      const anchor = toPlusX ? end : { x: end.x - width, y: end.y };
      return [{ type: 'polyline', pts: shape.pts, closed: false }, { type: 'polyline', pts: textBox(anchor, shape.text, shape.height, 0), closed: true }];
    }
    case 'level': {
      const h = shape.height * screenUp;
      return [
        { type: 'polyline', pts: [shape.p, { x: shape.p.x - shape.height, y: shape.p.y + h }, { x: shape.p.x + shape.height, y: shape.p.y + h }], closed: true },
        { type: 'line', a: shape.p, b: { x: shape.p.x + shape.height * 5, y: shape.p.y } },
      ];
    }
    case 'symbol': {
      const def = findSymbol(shape.symbolId);
      if (!def) return missingSymbolMark(shape);
      const { geometry, texts } = placeSymbol(def, shape, screenUp);
      return [...geometry, ...texts.map((t): DraftShape => ({ type: 'polyline', pts: textBox(t.p, t.text, t.height, t.rotation), closed: true }))];
    }
    case 'hatch':
      return shape.loops.filter((l) => l.length >= 3).map((pts) => ({ type: 'polyline', pts, closed: true }));
    case 'axis': {
      const { bubbles, r } = axisLayout(shape);
      const rims: DraftShape[] = bubbles.map((c) => (shape.bubble === 'circle'
        ? { type: 'circle', c, r }
        : { type: 'polyline', pts: [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }], closed: true }));
      return [{ type: 'line', a: shape.a, b: shape.b }, ...rims];
    }
    default:
      return dimensionLayout(shape).lines.map((l) => ({ type: 'line', a: l.a, b: l.b }));
  }
}

export function entityBounds(shape: EntityShape): { min: Pt; max: Pt } {
  const parts = entitySkeleton(shape).map(shapeBounds);
  if (parts.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return {
    min: { x: Math.min(...parts.map((b) => b.min.x)), y: Math.min(...parts.map((b) => b.min.y)) },
    max: { x: Math.max(...parts.map((b) => b.max.x)), y: Math.max(...parts.map((b) => b.max.y)) },
  };
}

/** Distance from `p` to the entity; inside a hatch or a text box counts as on it. */
export function nearestOnEntity(shape: EntityShape, p: Pt): { point: Pt; dist: number } {
  let best = { point: p, dist: Infinity };
  for (const part of entitySkeleton(shape)) {
    const hit = nearestOnShape(part, p);
    if (hit.dist < best.dist) best = hit;
  }
  if ((shape.type === 'hatch' || shape.type === 'text') && insideAny(entitySkeleton(shape), p)) return { point: p, dist: 0 };
  return best;
}

function insideAny(parts: DraftShape[], p: Pt): boolean {
  let inside = false;
  for (const part of parts) {
    if (part.type !== 'polyline') continue;
    const pts = part.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside;
    }
  }
  return inside;
}

function mapAnnotation(shape: AnnotationShape, f: (p: Pt) => Pt): AnnotationShape {
  switch (shape.type) {
    case 'text':
      return { ...shape, p: f(shape.p) };
    case 'leader':
      return { ...shape, pts: shape.pts.map(f) };
    case 'dimension':
      return { ...shape, a: f(shape.a), b: f(shape.b), at: f(shape.at), ...(shape.textAt ? { textAt: f(shape.textAt) } : {}) };
    case 'radial':
      return { ...shape, c: f(shape.c), at: f(shape.at) };
    case 'angular':
      return { ...shape, c: f(shape.c), a: f(shape.a), b: f(shape.b), at: f(shape.at) };
    // Symbol only: the reference keeps what it measured (a copy reads the same point, a mirror or
    // rotation never changes the number), and the symbol stays where it may be.
    case 'level':
      return placeLevelMark(shape, f(shape.p));
    case 'symbol':
      return { ...shape, p: f(shape.p) };
    case 'axis':
      return { ...shape, a: f(shape.a), b: f(shape.b) };
    case 'hatch':
      return { ...shape, loops: shape.loops.map((l) => l.map(f)) };
  }
}

export function translateEntity(shape: EntityShape, d: Pt): EntityShape {
  return isGeometry(shape) ? translateShape(shape, d) : mapAnnotation(shape, (p) => add(p, d));
}

export function rotateEntity(shape: EntityShape, center: Pt, angle: number): EntityShape {
  if (isGeometry(shape)) return rotateShape(shape, center, angle);
  const mapped = mapAnnotation(shape, (p) => rotatePt(p, center, angle));
  if (mapped.type === 'text') return { ...mapped, rotation: mapped.rotation + angle };
  if (mapped.type === 'symbol') return { ...mapped, rotation: mapped.rotation + angle * screenUp };
  if (mapped.type === 'hatch') return { ...mapped, angle: mapped.angle + (angle * 180) / Math.PI };
  return mapped;
}

/** Mirror: points reflect, text stays readable (not mirrored). */
export function mirrorEntity(shape: EntityShape, a: Pt, b: Pt): EntityShape {
  return isGeometry(shape) ? mirrorShape(shape, a, b) : mapAnnotation(shape, (p) => mirrorPt(p, a, b));
}

/** The current screen-up direction in drawing y (see {@link setAnnotationScreenUp}). */
export const annotationScreenUp = (): 1 | -1 => screenUp;
