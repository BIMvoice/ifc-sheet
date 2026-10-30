/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The head of a type in elevation (#448): square, round (a semicircle), segmental (a circular arc flatter than a semicircle, with a rise)
 * or pointed (two arcs meeting at the crown). Heritage windows. The overall width and height are the opening's: the arch rises inside the
 * height, its crown at the top, its springing line `rise` below it. Pure; the plan does not show the head, so only the elevation reads this.
 *
 * Every shape is one or two circles. An inset (the frame, the sash) is the same circles with a smaller radius, so the frame keeps its width
 * along the arch.
 */

import type { JoinerySpec } from '@ifc-lite/create';

/** An arch is never taller than this share of the opening, so the jambs keep some height. */
const MAX_RISE_SHARE = 0.95;
const MIN_RISE = 0.01;
/** A segmental arch without a rise of its own rises this share of the width. */
export const DEFAULT_SEGMENTAL_RISE = 0.2;

export interface HeadArch {
  /** Height of the springing line, metres up from the opening's bottom. */
  springing: number;
  /** Height of the head above the springing line. */
  rise: number;
  /** Height of the head's line at `x` (metres from the opening's centre), inset `inset` metres inwards; `x` is clamped to the arch's span. */
  z(x: number, inset?: number): number;
}

/** The arch of the spec's head, or null for a square head (or a spec without one). */
export function headArch(spec: Pick<JoinerySpec, 'width' | 'height' | 'head'>): HeadArch | null {
  const head = spec.head;
  if (!head || head.shape === 'square') return null;
  const a = spec.width / 2, H = spec.height;
  const limit = Math.max(MIN_RISE, Math.min(H * MAX_RISE_SHARE, head.shape === 'pointed' ? Infinity : a));
  const wanted = head.shape === 'round' ? a : head.shape === 'segmental' ? head.rise ?? spec.width * DEFAULT_SEGMENTAL_RISE : head.rise ?? a * Math.sqrt(3);
  const rise = Math.min(limit, Math.max(MIN_RISE, wanted));
  const springing = H - rise;
  const sag = (r: number, x: number, cx: number, cz: number, inset: number): number => {
    const radius = r - inset;
    return cz + Math.sqrt(Math.max(0, radius * radius - (x - cx) ** 2));
  };
  if (head.shape !== 'pointed' || rise <= a) {
    // One circle through the springing points and the crown.
    const R = (a * a + rise * rise) / (2 * rise);
    return { springing, rise, z: (x, inset = 0) => sag(R, Math.max(-a, Math.min(a, x)), 0, H - R, inset) };
  }
  // Two arcs: the right one is struck from a centre on the left of the axis, on the springing line, and the left one from its mirror.
  const d = (rise * rise - a * a) / (2 * a);
  const R = a + d;
  return { springing, rise, z: (x, inset = 0) => sag(R, Math.abs(Math.max(-a, Math.min(a, x))), -d, springing, inset) };
}

/** Points along the head's line from `x1` to `x0`, inset `inset`, `steps` segments. */
export function archPoints(arch: HeadArch, x0: number, x1: number, inset: number, steps = 24): { x: number; y: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = x1 + ((x0 - x1) * i) / steps;
    return { x, y: arch.z(x, inset) };
  });
}
