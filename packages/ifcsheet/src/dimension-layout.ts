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
import type { Pt } from './draft-types.js';
import { decimalsOf, lengthUnitOf, type SheetLocale } from './units-and-numbers.js';
import { sheetNumber } from './sheet-number.js';

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });

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
