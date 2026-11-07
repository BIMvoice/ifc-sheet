/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the marks that name a section ("1 / A-301" under its letter) need to know of a section symbol on a plan: the parameters
 * that tie its shapes to the section, the way the section looks, how far its head reaches past the letter, and where the symbol
 * sits. The app draws the symbol (`sectionSymbolShapes`) with the same sizes, so a reference stands clear of it in both.
 */

import type { MarkStyle } from '../graphic-standard.js';
import type { DraftEntity, DraftParamValue, Pt } from '../draft-types.js';

/** The parameter that ties a drafted shape to the section view whose symbol it belongs to. */
export const SECTION_LINK = 'sectionOf';
/** The parameter that ties a drafted shape to the detail view whose mark it belongs to. */
export const DETAIL_LINK = 'detailOf';
/** The parameter that says which part of a detail's mark a shape is (its order in `detailMarkShapes`). */
export const DETAIL_PART = 'detailPart';

/** Circle head: the radius, the pole to it, and how far the direction triangle stands past it (text heights). */
export const CIRCLE_R = 1.3;
export const CIRCLE_POLE = 2;
export const TRIANGLE_LEN = 1.1;
/** Share of the circle's radius the triangle's base spans on each side of the axis. */
export const TRIANGLE_HALF_BASE = 0.55;
/** Flag head: the pole to it, the padding round the letter, and the point on its far edge (text heights). */
export const FLAG_POLE = 1.5;
export const FLAG_PAD = 0.5;
export const FLAG_POINT = 0.8;

const EPS = 1e-6;

/** The unit normal of the cut line a-b on the side `side` is on (the way the section looks); `null` for a line of no length. */
export function sectionNormal(a: Pt, b: Pt, side: Pt): Pt | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const n = { x: -dy / len, y: dx / len };
  return (side.x - a.x) * n.x + (side.y - a.y) * n.y < 0 ? { x: -n.x, y: -n.y } : n;
}

/**
 * How far past the letter's centre a mark's head reaches along the view direction, for a letter whose box extends
 * `halfN` along that direction. The reference under the letter ("1 / A-301") starts beyond it.
 * Zero for the arrow, whose head is not round the letter (convention, #447).
 */
export function markHeadReach(style: MarkStyle, height: number, halfN: number): number {
  if (style === 'circle') return CIRCLE_R * height + TRIANGLE_LEN * height;
  if (style === 'flag') return halfN + FLAG_PAD * height + FLAG_POINT * height;
  return 0;
}

/** The section view a drafted shape is a part of the symbol of, else null. */
export const sectionLink = (e: Pick<DraftEntity, 'params'>): string | null => {
  const id = e.params[SECTION_LINK];
  return typeof id === 'string' ? id : null;
};

/** The parameters of a copy: the same, minus the claim to be a section's symbol or a detail's mark. */
export function withoutSectionLink(params: Readonly<Record<string, DraftParamValue>>): Record<string, DraftParamValue> {
  const rest = { ...params };
  delete rest[SECTION_LINK];
  delete rest[DETAIL_LINK];
  delete rest[DETAIL_PART];
  return rest;
}

/** Where a symbol sits on its plan: the cut line from `a` to `b`, looking toward `side`. */
export interface SymbolPlacement {
  a: Pt;
  b: Pt;
  side: Pt;
}

/** The parts of `viewId`'s symbol on one plan, in the order `sectionSymbolShapes` made them. */
export function symbolParts(drafts: readonly DraftEntity[], viewId: string): DraftEntity[] {
  return drafts.filter((d) => sectionLink(d) === viewId);
}

/**
 * Where the symbol made of `parts` sits. The cut line is the first line, the first stem the second; the stem's direction is the side
 * the section looks toward. Measured from the parts, so it holds after a move, a rotation or a grip drag of one end of the cut line.
 */
export function placementOf(parts: readonly DraftEntity[]): SymbolPlacement | null {
  const lines = parts.flatMap((p) => (p.shape.type === 'line' ? [p.shape] : []));
  if (lines.length < 2) return null;
  const [cut, stem] = lines;
  const dx = cut.b.x - cut.a.x;
  const dy = cut.b.y - cut.a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  const sx = stem.b.x - stem.a.x;
  const sy = stem.b.y - stem.a.y;
  // The side is the normal of the cut line that the stem points along.
  let nx = -dy / len;
  let ny = dx / len;
  if (sx * nx + sy * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const mid = { x: (cut.a.x + cut.b.x) / 2, y: (cut.a.y + cut.b.y) / 2 };
  return { a: cut.a, b: cut.b, side: { x: mid.x + nx, y: mid.y + ny } };
}
