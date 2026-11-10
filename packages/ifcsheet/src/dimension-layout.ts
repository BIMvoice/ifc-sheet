/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a linear or aligned dimension's lines, ticks and figure go, in drawing units, and the mark each tick is drawn with.
 * The app's drafting (`apps/viewer/src/drafting/annotation.ts`, `AnnotationGraphics.tsx`) and the engine's sheet
 * (`sheet-annotations.ts`, the PDF of `ifcsheet build`) lay a dimension out with this one code (#479).
 */

import type { ArrowKind } from './draft-styles.js';
import { naturalDecimals, unitFactor } from './draft-look.js';
import type { AnnotationShape, AxisShape, Pt } from './draft-types.js';
import { decimalsOf, lengthUnitOf, type SheetLocale } from './units-and-numbers.js';
import { sheetLevel, sheetNumber } from './sheet-number.js';

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export interface DimensionLayout {
  /** Extension and dimension lines. */
  lines: { a: Pt; b: Pt }[];
  /** Arrow / tick tips with the direction they point. */
  ticks: { at: Pt; dir: Pt }[];
  textAt: Pt;
  /** Text direction in drawing space (radians). */
  textAngle: number;
  label: string;
}

const EXT_GAP = 0.1;
const EXT_OVER = 0.15;

export function formatLength(locale: SheetLocale, m: number): string {
  // Metres with two decimals unless the project names its length unit (#88): then that unit, with the places such a unit is drawn to.
  const unit = lengthUnitOf(locale, 'm');
  return sheetNumber(locale, m * unitFactor(unit), decimalsOf(locale, 'length', naturalDecimals(unit)), { group: false });
}

/** `v` scaled to length 1; along x when it has none. */
export function unitVector(v: Pt): Pt {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-12 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
}

/** Drawing-unit sizes and the number format a dimension style gives its layout. */
export interface LayoutOptions {
  extGap?: number;
  extOver?: number;
  format?: (metres: number) => string;
  /**
   * The language of the default `format`. Left out by the callers that read
   * only the lines and the text position of a layout; whatever draws the
   * label passes `format` itself.
   */
  locale?: SheetLocale;
}

/** A linear / aligned dimension: extension lines from the points to the dimension line through `at`. */
export function linearLayout(a: Pt, b: Pt, at: Pt, variant: 'aligned' | 'linear', text: string | undefined, o: LayoutOptions): DimensionLayout {
  const gap = o.extGap ?? EXT_GAP, over = o.extOver ?? EXT_OVER, format = o.format ?? ((m: number) => formatLength(o.locale ?? 'en', m));
  let dir: Pt;
  if (variant === 'aligned') {
    dir = unitVector(sub(b, a));
  } else {
    // Linear: horizontal or vertical, whichever way the line was pulled.
    const mid = scale(add(a, b), 0.5);
    dir = Math.abs(at.y - mid.y) >= Math.abs(at.x - mid.x) ? { x: 1, y: 0 } : { x: 0, y: 1 };
  }
  const n = { x: -dir.y, y: dir.x };
  const offA = (at.x - a.x) * n.x + (at.y - a.y) * n.y;
  const offB = (at.x - b.x) * n.x + (at.y - b.y) * n.y;
  const pa = add(a, scale(n, offA));
  const pb = add(b, scale(n, offB));
  const extA = { a: add(a, scale(n, Math.sign(offA) * Math.min(gap, Math.abs(offA)))), b: add(pa, scale(n, Math.sign(offA) * over)) };
  const extB = { a: add(b, scale(n, Math.sign(offB) * Math.min(gap, Math.abs(offB)))), b: add(pb, scale(n, Math.sign(offB) * over)) };
  const value = Math.abs((b.x - a.x) * dir.x + (b.y - a.y) * dir.y);
  const along = unitVector(sub(pb, pa));
  return {
    lines: [extA, extB, { a: pa, b: pb }],
    ticks: [{ at: pa, dir: scale(along, -1) }, { at: pb, dir: along }],
    textAt: scale(add(pa, pb), 0.5),
    textAngle: Math.atan2(along.y, along.x),
    label: text ?? format(value),
  };
}

/** A tick's mark on paper: an open or filled run of points, or a filled dot; none for `none`. */
export type ArrowMark = { kind: 'run'; pts: Pt[]; fill: boolean } | { kind: 'dot'; c: Pt; r: number } | null;

/** The mark a dimension's tick is drawn with, at `p` pointing along `dir` (paper space, y down), `size` across. */
export function arrowMark(kind: ArrowKind, p: Pt, dir: Pt, size: number): ArrowMark {
  const ang = Math.atan2(dir.y, dir.x);
  switch (kind) {
    case 'arrow': {
      const back = (da: number): Pt => ({ x: p.x - size * Math.cos(ang + da), y: p.y - size * Math.sin(ang + da) });
      return { kind: 'run', pts: [p, back(0.3), back(-0.3)], fill: true };
    }
    case 'dot':
      return { kind: 'dot', c: p, r: size * 0.3 };
    case 'none':
      return null;
    default: {
      // Architectural tick: 45° across the line.
      const h = size * 0.5;
      const c = Math.cos(ang + Math.PI / 4) * h, s = Math.sin(ang + Math.PI / 4) * h;
      return { kind: 'run', pts: [{ x: p.x - c, y: p.y - s }, { x: p.x + c, y: p.y + s }], fill: false };
    }
  }
}

/** A radius or diameter dimension: the line from the centre (or across the circle) through `at`, the figure at `at`. */
export function radialLayout(c: Pt, r: number, at: Pt, diameter: boolean, o: LayoutOptions): DimensionLayout {
  const format = o.format ?? ((m: number) => formatLength(o.locale ?? 'en', m));
  const dir = unitVector(sub(at, c));
  const rim = add(c, scale(dir, r));
  const from = diameter ? add(c, scale(dir, -r)) : c;
  return {
    lines: [{ a: from, b: dist(at, c) > r ? at : rim }],
    ticks: diameter ? [{ at: rim, dir }, { at: from, dir: scale(dir, -1) }] : [{ at: rim, dir }],
    textAt: at,
    textAngle: Math.atan2(dir.y, dir.x),
    label: `${diameter ? 'Ø' : 'R'} ${format(diameter ? r * 2 : r)}`,
  };
}

/** An angular dimension: the arc about `c` through `at` from the ray to `a` to the ray to `b`, the figure on its middle. */
export function angularLayout(c: Pt, a: Pt, b: Pt, at: Pt, o: LayoutOptions): DimensionLayout {
  const r = Math.max(dist(at, c), 1e-6);
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  const a1 = Math.atan2(b.y - c.y, b.x - c.x);
  let sweep = a1 - a0;
  while (sweep <= -Math.PI) sweep += Math.PI * 2;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  const steps = 24;
  const lines: { a: Pt; b: Pt }[] = [];
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + (sweep * i) / steps;
    const t1 = a0 + (sweep * (i + 1)) / steps;
    lines.push({ a: { x: c.x + r * Math.cos(t0), y: c.y + r * Math.sin(t0) }, b: { x: c.x + r * Math.cos(t1), y: c.y + r * Math.sin(t1) } });
  }
  const mid = a0 + sweep / 2;
  return {
    lines,
    ticks: [],
    textAt: { x: c.x + r * Math.cos(mid), y: c.y + r * Math.sin(mid) },
    textAngle: mid + Math.PI / 2,
    label: `${sheetNumber(o.locale ?? 'en', (Math.abs(sweep) * 180) / Math.PI, 1, { group: false })}°`,
  };
}

/** Where an axis's bubbles sit: centres just past its ends (along the line), and their radius / half side. */
export function axisLayout(shape: AxisShape): { bubbles: Pt[]; r: number } {
  // The bubble holds the label: at least `size`, wider for a long label.
  const textHalf = (Math.max(1, shape.label.length) * shape.height * 0.62) / 2;
  const r = Math.max(shape.size / 2, textHalf + shape.height * 0.45, shape.height * 0.9);
  const dir = unitVector(sub(shape.b, shape.a));
  const bubbles: Pt[] = [];
  if (shape.ends === 'both' || shape.ends === 'start') bubbles.push(add(shape.a, scale(dir, -r)));
  if (shape.ends === 'both' || shape.ends === 'end') bubbles.push(add(shape.b, scale(dir, r)));
  return { bubbles, r };
}

/** The thin line from a level mark's measured point to its symbol, while they are apart; none for a mark without a reference. */
export function levelWitness(shape: Extract<AnnotationShape, { type: 'level' }>): { a: Pt; b: Pt } | null {
  if (!shape.ref || dist(shape.ref.at, shape.p) < 1e-6) return null;
  return { a: shape.ref.at, b: shape.p };
}

/**
 * Whether a leader's text reads to the right of its end on screen: it sits beyond the end of the last segment, so a segment
 * running leftward puts it on the left and the line never runs through the words. `screenRight` is +1 when drawing x grows
 * rightward on screen, -1 when the view is mirrored.
 */
export function leaderTextRight(pts: readonly Pt[], screenRight: 1 | -1 = 1): boolean {
  if (pts.length < 2) return true;
  const dx = (pts[pts.length - 1].x - pts[pts.length - 2].x) * screenRight;
  return dx >= -1e-6;
}

/** A level mark: +2,70, −1,50 (the true minus), ±0,00. */
export function formatLevel(locale: SheetLocale, m: number): string {
  return sheetLevel(locale, m, { minus: '−' });
}

const ARC_STEP = Math.PI / 48;

/** An arc (or, over a full turn, a circle) as the points a drawing strokes it by, counter-clockwise from `start` to `end`. */
export function arcPoints(c: Pt, r: number, start: number, end: number): Pt[] {
  let sweep = end - start;
  while (sweep <= 0) sweep += Math.PI * 2;
  const steps = Math.max(2, Math.ceil(sweep / ARC_STEP));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + (sweep * i) / steps;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}
