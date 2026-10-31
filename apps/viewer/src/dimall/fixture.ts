/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Small buildings for the DIMALL tests, in plan coordinates (metres). */

import type { Pt } from '@/drafting/types';
import type { PartKind, PlanPart } from './types';

export const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

let next = 1;
export const part = (kind: PartKind, ...rings: Pt[][]): PlanPart => ({ id: next++, kind, rings });

/**
 * A 12 x 10 house of 0.3 m walls. South wall (y 0..0.3) has a window 1..3 and a window 5..7;
 * the east wall (x 11.7..12) has a door 4..5; north and west walls are plain.
 * One cross wall (0.24 thick) meets the south wall at x 7.4..7.64; one meets the north wall at x 3..3.24.
 */
export function house(): PlanPart[] {
  return [
    part('wall', rect(0, 0, 1, 0.3)), part('wall', rect(3, 0, 5, 0.3)), part('wall', rect(7, 0, 12, 0.3)),
    part('wall', rect(0, 9.7, 12, 10)),
    part('wall', rect(0, 0.3, 0.3, 9.7)),
    part('wall', rect(11.7, 0.3, 12, 4)), part('wall', rect(11.7, 5, 12, 9.7)),
    part('wall', rect(7.4, 0.3, 7.64, 6)),
    part('wall', rect(3, 5, 3.24, 9.7)),
    part('window', rect(1, 0.1, 3, 0.2)), part('window', rect(5, 0.1, 7, 0.2)),
    part('door', rect(11.75, 4, 11.95, 5)),
  ];
}

/** An L: the 12 x 10 house without its north-east 5 x 4 corner. */
export function lShape(): PlanPart[] {
  return [
    part('wall', rect(0, 0, 12, 0.3)), part('wall', rect(0, 9.7, 7.3, 10)), part('wall', rect(0, 0.3, 0.3, 9.7)),
    part('wall', rect(11.7, 0.3, 12, 6)), part('wall', rect(7, 5.7, 7.3, 9.7)), part('wall', rect(7.3, 5.7, 11.7, 6)),
    part('window', rect(2, 0.1, 4, 0.2)), part('window', rect(0.1, 4, 0.2, 5)), part('window', rect(8, 5.8, 9, 5.9)),
  ];
}

/** `parts` turned by `angle` radians about the origin. */
export function turned(parts: readonly PlanPart[], angle: number): PlanPart[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return parts.map((p) => ({ ...p, rings: p.rings.map((r) => r.map((q) => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c }))) }));
}

/** An 8 x 6 house whose four 0.3 m walls meet at mitres (each wall a trapezoid), a window in the south wall. */
export function mitred(): PlanPart[] {
  const t = 0.3, w = 8, h = 6;
  const trap = (...c: [number, number][]) => c.map(([x, y]) => ({ x, y }));
  return [
    part('wall', trap([0, 0], [3, 0], [3, t], [t, t])), part('wall', trap([5, 0], [w, 0], [w - t, t], [5, t])),
    part('wall', trap([0, h], [w, h], [w - t, h - t], [t, h - t])),
    part('wall', trap([0, 0], [t, t], [t, h - t], [0, h])), part('wall', trap([w, 0], [w, h], [w - t, h - t], [w - t, t])),
    part('window', rect(3, 0.1, 5, 0.2)),
  ];
}

/** The three layers of a 0.3 m wall piece (outer 0.14, core 0.12, inner 0.04), as the plan cuts a wall with a material layer set: `outer` is the side the 0.14 layer is on. */
function layered(x0: number, y0: number, x1: number, y1: number, outer: 'x0' | 'x1' | 'y0' | 'y1'): Pt[][] {
  const horizontal = x1 - x0 >= y1 - y0;
  const [a, b] = horizontal ? [y0, y1] : [x0, x1];
  const first = outer === 'x0' || outer === 'y0';
  const edges = first ? [a, a + 0.14, a + 0.26, b] : [a, b - 0.26, b - 0.14, b];
  return [0, 1, 2].map((i) => (horizontal ? rect(x0, edges[i], x1, edges[i + 1]) : rect(edges[i], y0, edges[i + 1], y1)));
}

/**
 * The Bonsai two-storey house's ground floor, in the shape its plan is cut: an 8 x 6 house of 0.3 m walls, every wall
 * in three material layers (0.14 + 0.12 + 0.04), one cross wall at x 3.7..4.0 with a door in it.
 * South wall (y 0..0.3): a door 1.5..2.4 and a window 6.0..6.6. North wall (y 5.7..6): a window 5.75..6.25, drawn a little deeper than wide (the Bonsai window of unset size, 0.5 x 0.5, comes out either way on float noise).
 * East wall (x 7.7..8): a window at y 3.0..3.6. West wall: a window at y 2.0..2.8. The doors and windows are cut as thin frames, a little wider than the gap (stops).
 */
export function layeredHouse(): PlanPart[] {
  return [
    part('wall', ...layered(0, 0, 1.5, 0.3, 'y0'), ...layered(2.4, 0, 6, 0.3, 'y0'), ...layered(6.6, 0, 8, 0.3, 'y0')),
    part('wall', ...layered(0, 5.7, 5.75, 6, 'y1'), ...layered(6.25, 5.7, 8, 6, 'y1')),
    part('wall', ...layered(0, 0.3, 0.3, 2, 'x0'), ...layered(0, 2.8, 0.3, 5.7, 'x0')),
    part('wall', ...layered(7.7, 0.3, 8, 3, 'x1'), ...layered(7.7, 3.6, 8, 5.7, 'x1')),
    part('wall', ...layered(3.7, 0.3, 4, 1.0, 'x0'), ...layered(3.7, 1.9, 4, 5.7, 'x0')),
    part('door', rect(1.47, 0.03, 1.55, 0.05), rect(1.5, 0.05, 2.4, 0.06), rect(2.35, 0.03, 2.42, 0.05)),
    part('window', rect(6.0, 0.09, 6.6, 0.1), rect(6.0, 0.05, 6.05, 0.09)),
    part('window', rect(5.75, 5.74, 6.25, 6.26)),
    part('window', rect(7.9, 3.0, 7.91, 3.6)),
    part('window', rect(0.09, 2, 0.1, 2.8)),
    part('door', rect(3.95, 1.0, 3.98, 1.9)),
  ];
}

/** The same house with a 1 m wide, 4 m deep notch cut into its north side, a window in each wall of the notch: the facades of the notch face one another, closer than a string's offset. */
export function notched(): PlanPart[] {
  return [
    part('wall', rect(0, 0, 8, 0.3)), part('wall', rect(0, 0.3, 0.3, 6)), part('wall', rect(7.7, 0.3, 8, 6)),
    part('wall', rect(0.3, 5.7, 3.5, 6)), part('wall', rect(4.5, 5.7, 7.7, 6)),
    part('wall', rect(3.5, 2, 3.8, 6)), part('wall', rect(4.2, 2, 4.5, 6)), part('wall', rect(3.8, 2, 4.2, 2.3)),
    part('window', rect(2, 0.1, 3, 0.2)), part('window', rect(3.55, 3, 3.75, 4)), part('window', rect(4.25, 3, 4.45, 4)),
  ];
}
