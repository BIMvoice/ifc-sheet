/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether the closed shells of one element may be summed (#74,
 * `measured-quantities.ts`). The divergence-theorem sum is the integral of the
 * winding number w over space. It is the volume of the solid only where w is 0
 * or 1 everywhere (after turning the whole surface outward): a cube drawn twice
 * has w = 2 inside and sums to twice its volume, two cubes overlapping by half
 * have w = 2 in the overlap, a same-wound cube nested in another has w = 2 in
 * the inner one. An inward-wound shell inside a body (a void) has w = 0 inside
 * it and is subtracted correctly, so it is accepted; an inward-wound shell with
 * nothing around it has w = -1 and is refused as not oriented.
 *
 * The check, run only when it can matter (see `overlapCheck`):
 * 1. A strict crossing test: an edge of one triangle passing through another
 *    triangle it shares no point with (both ends clear of its plane, the hit
 *    clear of its rims). Two closed surfaces that cross put w = 2 (or -1) on
 *    one side of the crossing. Touching (a shared face, a flight resting on a
 *    landing, a prism leaning on a cube's edge) has no edge passing THROUGH a
 *    face, so it is not caught here.
 * 2. Sampling w just in front of and just behind each suspect triangle, at its
 *    centroid and near each corner. w is evaluated exactly (solid angles of
 *    every triangle of the shells whose box holds the point) and rounded; a
 *    sample that does not round cleanly sits on a surface and is skipped. So a
 *    sample can only refuse where w really is outside {0, 1}: touching shells
 *    are never refused. What is missed is an overlap that no sample point
 *    falls in and whose crossings all land exactly on a triangle's rim (two
 *    bars crossing where their face diagonals meet, say).
 *
 * Cost: O(T) when one manifold shell (every directed edge once) is all there
 * is, which is every FZK wall and slab. Otherwise O(T_s · T) for the T_s
 * triangles of the suspect shells, boxes rejecting most pairs first.
 */

/** An element's surface after welding: points relative to its anchor, xyz; triangles as point ids, three each. */
export interface Surface {
  points: number[];
  triangles: number[];
}

type Box = [number, number, number, number, number, number];

const boxOf = (s: Surface, tris: readonly number[]): Box => {
  const b: Box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const i = s.triangles[t + k] * 3;
      for (let d = 0; d < 3; d++) {
        const v = s.points[i + d];
        if (v < b[d]) b[d] = v;
        if (v > b[d + 3]) b[d + 3] = v;
      }
    }
  }
  return b;
};

/** The two boxes share a volume thicker than `tol` on every axis (touching boxes do not). */
const overlapping = (a: Box, b: Box, tol: number): boolean =>
  [0, 1, 2].every((d) => Math.min(a[d + 3], b[d + 3]) - Math.max(a[d], b[d]) > tol);

const holds = (b: Box, x: number, y: number, z: number, tol: number): boolean =>
  x >= b[0] - tol && x <= b[3] + tol && y >= b[1] - tol && y <= b[4] + tol && z >= b[2] - tol && z <= b[5] + tol;

const vec = (s: Surface, id: number): [number, number, number] => [s.points[id * 3], s.points[id * 3 + 1], s.points[id * 3 + 2]];
const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: readonly number[]): [number, number, number] | null => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null;
};

/** Triangle t's unit normal by its winding; null when it has no area. */
const normalOf = (s: Surface, t: number): [number, number, number] | null => {
  const a = vec(s, s.triangles[t]);
  return unit(cross(sub(vec(s, s.triangles[t + 1]), a), sub(vec(s, s.triangles[t + 2]), a)));
};

/** The solid angle of triangle t seen from p, over 4π: positive from behind its winding (Van Oosterom and Strackee). */
function windingOf(s: Surface, t: number, p: readonly number[]): number {
  const a = sub(vec(s, s.triangles[t]), p), b = sub(vec(s, s.triangles[t + 1]), p), c = sub(vec(s, s.triangles[t + 2]), p);
  const la = Math.hypot(...a), lb = Math.hypot(...b), lc = Math.hypot(...c);
  const num = dot(a, cross(b, c));
  const den = la * lb * lc + dot(a, b) * lc + dot(b, c) * la + dot(c, a) * lb;
  return Math.atan2(num, den) / (2 * Math.PI);
}

/**
 * Why the element's shells may not be summed, or null when they may.
 * `part` is each triangle's connected part (shared points); `six` six times
 * each part's signed volume; `sign` the winding of the whole (+1 outward).
 * Each part is closed on its own (every directed edge matched), so its w is 0
 * outside its box.
 */
export function overlapCheck(
  s: Surface, part: Int32Array, six: ReadonlyMap<number, number>, sign: number, tol: number, noVolume: number,
): 'overlapping' | 'notOriented' | null {
  const byPart = new Map<number, number[]>();
  for (let i = 0; i < part.length; i++) (byPart.get(part[i]) ?? byPart.set(part[i], []).get(part[i])!).push(i * 3);
  const ids = [...byPart.keys()];
  const boxes = new Map(ids.map((p) => [p, boxOf(s, byPart.get(p)!)] as const));

  // Directed edge use: more than once is a non-manifold edge (a doubled face, shells sharing an edge).
  const n = s.points.length / 3;
  const use = new Map<number, number>();
  const nonManifold = new Set<number>();
  for (let t = 0; t < s.triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = s.triangles[t + k] * n + s.triangles[t + ((k + 1) % 3)];
      const c = (use.get(key) ?? 0) + 1;
      use.set(key, c);
      if (c > 1) nonManifold.add(part[t / 3]);
    }
  }
  const suspect = ids.filter((p) => nonManifold.has(p)
    || (six.get(p)! / 6 < -noVolume && sign > 0) || (six.get(p)! / 6 > noVolume && sign < 0)
    || ids.some((q) => q !== p && overlapping(boxes.get(p)!, boxes.get(q)!, tol)));
  if (suspect.length === 0) return null;

  if (crosses(s, suspect, byPart, boxes, ids, tol)) return 'overlapping';

  const delta = 10 * tol;
  for (const p of suspect) {
    for (const t of byPart.get(p)!) {
      const nrm = normalOf(s, t);
      if (!nrm) continue;
      const [a, b, c] = [0, 1, 2].map((k) => vec(s, s.triangles[t + k]));
      const at = (wa: number, wb: number, wc: number) => [0, 1, 2].map((d) => wa * a[d] + wb * b[d] + wc * c[d]);
      for (const q of [at(1 / 3, 1 / 3, 1 / 3), at(0.6, 0.2, 0.2), at(0.2, 0.6, 0.2), at(0.2, 0.2, 0.6)]) {
        for (const side of [1, -1]) {
          const x = q[0] + side * delta * nrm[0], y = q[1] + side * delta * nrm[1], z = q[2] + side * delta * nrm[2];
          let w = 0;
          for (const r of ids) {
            if (!holds(boxes.get(r)!, x, y, z, tol)) continue;
            for (const u of byPart.get(r)!) w += windingOf(s, u, [x, y, z]);
          }
          const whole = Math.round(w);
          // Not cleanly whole: the point lies on (or within rounding of) a surface; it decides nothing.
          if (Math.abs(w - whole) > 0.1) continue;
          const signed = sign * whole;
          if (signed >= 2) return 'overlapping';
          if (signed < 0) return 'notOriented';
        }
      }
    }
  }
  return null;
}

/** An edge of a suspect part's triangle passing strictly through a triangle it shares no point with. */
function crosses(
  s: Surface, suspect: readonly number[], byPart: ReadonlyMap<number, number[]>, boxes: ReadonlyMap<number, Box>,
  ids: readonly number[], tol: number,
): boolean {
  const triBox = (t: number) => boxOf(s, [t]);
  for (const p of suspect) {
    const near = ids.filter((q) => q === p || overlapping(boxes.get(p)!, boxes.get(q)!, tol));
    const targets = near.flatMap((q) => byPart.get(q)!).map((t) => ({ t, box: triBox(t), nrm: normalOf(s, t) }));
    for (const t of byPart.get(p)!) {
      for (let k = 0; k < 3; k++) {
        const i = s.triangles[t + k], j = s.triangles[t + ((k + 1) % 3)];
        const P = vec(s, i), Q = vec(s, j);
        for (const g of targets) {
          if (!g.nrm) continue;
          const T = [0, 1, 2].map((m) => s.triangles[g.t + m]);
          if (T.includes(i) || T.includes(j)) continue;
          if (Math.max(P[0], Q[0]) < g.box[0] || Math.min(P[0], Q[0]) > g.box[3]
            || Math.max(P[1], Q[1]) < g.box[1] || Math.min(P[1], Q[1]) > g.box[4]
            || Math.max(P[2], Q[2]) < g.box[2] || Math.min(P[2], Q[2]) > g.box[5]) continue;
          const A = vec(s, T[0]);
          const dp = dot(g.nrm, sub(P, A)), dq = dot(g.nrm, sub(Q, A));
          if (!((dp > tol && dq < -tol) || (dp < -tol && dq > tol))) continue;
          const f = dp / (dp - dq);
          const X = [P[0] + f * (Q[0] - P[0]), P[1] + f * (Q[1] - P[1]), P[2] + f * (Q[2] - P[2])];
          // X clear of every rim of the triangle, in its plane: a hit on a rim may be two surfaces touching along a line.
          let inside = true;
          for (let m = 0; m < 3 && inside; m++) {
            const U = vec(s, T[m]), e = sub(vec(s, T[(m + 1) % 3]), U);
            inside = dot(cross(e, sub(X, U)), g.nrm) / Math.hypot(...e) > tol;
          }
          if (inside) return true;
        }
      }
    }
  }
  return false;
}
