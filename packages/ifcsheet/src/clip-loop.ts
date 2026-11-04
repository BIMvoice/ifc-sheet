/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Cutting a closed loop down to a rectangle: what a detail shows of a room or an outline. Pure. */

type P = { x: number; y: number };
type Bounds = { min: P; max: P };

/** A closed loop clipped to `r` (Sutherland-Hodgman); fewer than three points left means nothing is inside (an empty loop is returned). */
export function clipLoop(loop: readonly P[], r: Bounds): P[] {
  const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p.x >= r.min.x, (a, b) => ({ x: r.min.x, y: a.y + ((b.y - a.y) * (r.min.x - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= r.max.x, (a, b) => ({ x: r.max.x, y: a.y + ((b.y - a.y) * (r.max.x - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= r.min.y, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.min.y - a.y)) / (b.y - a.y), y: r.min.y })],
    [(p) => p.y <= r.max.y, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.max.y - a.y)) / (b.y - a.y), y: r.max.y })],
  ];
  let out = [...loop];
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    });
    if (out.length === 0) break;
  }
  return out.length >= 3 ? out : [];
}
