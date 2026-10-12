/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Parametric level marks. A mark with a reference (`ref`) derives its number
 * from it, so moving the symbol never changes the number and a reference that
 * moves gives the new one. `value` stays as the last number derived: it is what
 * a mark shows when the reference cannot be resolved, and what older readers see.
 * Marks without a reference (older project files) behave as they always did.
 */

import type { AnnotationShape, LevelRef, Pt } from './types';
import { COINCIDENT, dist } from './vec';

export type LevelShape = Extract<AnnotationShape, { type: 'level' }>;
export type { LevelRef };

/** The number a reference reads in the view in front, or null when it cannot be resolved. */
export type LevelResolver = (ref: LevelRef) => number | null;

/** A mark on a plan (its reference names a storey): the symbol is free in 2D. */
const onPlan = (ref: LevelRef): boolean => ref.storey !== undefined;

/** The number the mark shows: derived from its reference, else its own value. */
export function levelValueOf(shape: LevelShape, resolve: LevelResolver): number {
  return (shape.ref ? resolve(shape.ref) : null) ?? shape.value;
}

/** `shape` with its cached `value` brought in line with its reference (the same object when it already is). */
export function settleLevel(shape: LevelShape, resolve: LevelResolver): LevelShape {
  const value = levelValueOf(shape, resolve);
  return value === shape.value ? shape : { ...shape, value };
}

/**
 * A number typed by hand: it replaces the derived one and the mark leaves its
 * reference, so nothing changes it afterwards. The symbol stays where it is.
 */
export function setLevelValue(shape: LevelShape, value: number): LevelShape {
  const { ref: _detached, ...own } = shape;
  return { ...own, value };
}

/** A mark that keeps its own number: typed by hand, or saved before references existed. */
export const isManualLevel = (shape: LevelShape): boolean => shape.ref === undefined;

/**
 * The way back from a typed number: the point under the symbol is measured
 * again (`refAt` gives the reference a point has in the view in front) and the
 * number is read from it.
 */
export function followReference(shape: LevelShape, refAt: (p: Pt) => LevelRef, resolve: LevelResolver): LevelShape {
  return settleLevel({ ...shape, ref: refAt(shape.p) }, resolve);
}

/**
 * The symbol put at `p` where it is allowed to be: anywhere on a plan or for a
 * mark without a reference; on a section or elevation only along the horizontal
 * through the reference, so it always sits at the height it states.
 */
export function placeSymbol(shape: LevelShape, p: Pt): LevelShape {
  if (!shape.ref || onPlan(shape.ref)) return { ...shape, p };
  return { ...shape, p: { x: p.x, y: shape.ref.at.y } };
}

/**
 * The reference moved to `at`. On a section the number follows and the symbol
 * rides to the new height (keeping its place along the horizontal); on a plan
 * the measured point moves and the symbol stays. A mark with no reference is
 * returned as it is.
 */
export function moveReference(shape: LevelShape, at: Pt, resolve: LevelResolver): LevelShape {
  if (!shape.ref) return shape;
  const moved: LevelShape = { ...shape, ref: { ...shape.ref, at } };
  return settleLevel(placeSymbol(moved, shape.p), resolve);
}

/** The marks lined up on the vertical line `x`: each symbol stays at its own height, references untouched. */
export function alignLevelMarks(marks: readonly LevelShape[], x: number): LevelShape[] {
  return marks.map((m) => placeSymbol(m, { x, y: m.p.y }));
}

/** The thin line from the reference to the symbol, while they are apart. */
export function witnessLine(shape: LevelShape): { a: Pt; b: Pt } | null {
  if (!shape.ref || dist(shape.ref.at, shape.p) < COINCIDENT) return null;
  return { a: shape.ref.at, b: shape.p };
}
