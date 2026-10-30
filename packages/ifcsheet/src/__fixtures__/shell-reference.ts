/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The shell check as it stood before the hierarchies and the ray (#611), every edge against every target and the full sum
 * at every sample, with the scenes the tests hand to it and to `overlapCheck`.
 */

import { overlapCheck, type Surface } from '../measured-shells.js';
import { treeOf, type Box } from '../shell-bvh.js';
import { holds, windingField, windingOf, type WindingInput } from '../shell-winding.js';

export type V = [number, number, number];
export type Tri = [V, V, V];
export type Scene = { s: Surface; part: Int32Array; six: Map<number, number>; sign: number };

export const TOL = 1e-5, NO_VOLUME = 1e-9;

/** A box's outward (or, flipped, inward) triangles, each face cut into div × div squares. */
export function box(lo: V, hi: V, div = 1, flipped = false): Tri[] {
  const out: Tri[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const high of [false, true]) {
      const at = (i: number, j: number): V => {
        const p: V = [0, 0, 0];
        p[axis] = high ? hi[axis] : lo[axis];
        p[u] = lo[u] + ((hi[u] - lo[u]) * i) / div;
        p[v] = lo[v] + ((hi[v] - lo[v]) * j) / div;
        return p;
      };
      for (let i = 0; i < div; i++) for (let j = 0; j < div; j++) {
        const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        // u × v is +axis: the high face turns as it is, the low face the other way.
        const tris: Tri[] = high !== flipped ? [[a, b, c], [a, c, d]] : [[a, c, b], [a, d, c]];
        out.push(...tris);
      }
    }
  }
  return out;
}

/** The surface as `measureElement` hands it over: points welded where they are the same, parts, signed volumes, overall sign. */
export function sceneOf(shells: readonly Tri[][]): Scene {
  const ids = new Map<string, number>();
  const points: number[] = [], triangles: number[] = [];
  for (const shell of shells) for (const tri of shell) for (const p of tri) {
    const key = p.join();
    let id = ids.get(key);
    if (id === undefined) {
      id = points.length / 3;
      ids.set(key, id);
      points.push(...p);
    }
    triangles.push(id);
  }
  const parent = Array.from({ length: points.length / 3 }, (_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    return r;
  };
  for (let t = 0; t < triangles.length; t += 3) {
    parent[root(triangles[t + 1])] = root(triangles[t]);
    parent[root(triangles[t + 2])] = root(triangles[t]);
  }
  const part = new Int32Array(triangles.length / 3);
  const six = new Map<number, number>();
  let sum = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => points.slice(triangles[t + k] * 3, triangles[t + k] * 3 + 3));
    const v = a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    const r = root(triangles[t]);
    part[t / 3] = r;
    six.set(r, (six.get(r) ?? 0) + v);
    sum += v;
  }
  return { s: { points, triangles }, part, six, sign: sum >= 0 ? 1 : -1 };
}

export const fast = ({ s, part, six, sign }: Scene) => overlapCheck(s, part, six, sign, TOL, NO_VOLUME);

// The reference: `overlapCheck`, `crosses` and the sample sum as they were, without hierarchy, ray or bound.

const vec = (s: Surface, id: number): V => [s.points[id * 3], s.points[id * 3 + 1], s.points[id * 3 + 2]];
const sub = (a: readonly number[], b: readonly number[]): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossOf = (a: readonly number[], b: readonly number[]): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalOf = (s: Surface, t: number): V | null => {
  const a = vec(s, s.triangles[t]);
  const n = crossOf(sub(vec(s, s.triangles[t + 1]), a), sub(vec(s, s.triangles[t + 2]), a));
  const l = Math.hypot(n[0], n[1], n[2]);
  return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : null;
};
const boxOf = (s: Surface, tris: readonly number[]): Box => {
  const b: Box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const t of tris) for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) {
    const v = s.points[s.triangles[t + k] * 3 + d];
    if (v < b[d]) b[d] = v;
    if (v > b[d + 3]) b[d + 3] = v;
  }
  return b;
};
const overlapping = (a: Box, b: Box): boolean => [0, 1, 2].every((d) => Math.min(a[d + 3], b[d + 3]) - Math.max(a[d], b[d]) > TOL);
const byPartOf = (part: Int32Array): Map<number, number[]> => {
  const by = new Map<number, number[]>();
  for (let i = 0; i < part.length; i++) (by.get(part[i]) ?? by.set(part[i], []).get(part[i])!).push(i * 3);
  return by;
};

function referenceCrosses(s: Surface, suspect: readonly number[], byPart: Map<number, number[]>, boxes: Map<number, Box>): boolean {
  const ids = [...byPart.keys()], tri = s.triangles;
  for (const p of suspect) {
    const targets = ids.filter((q) => q === p || overlapping(boxes.get(p)!, boxes.get(q)!)).flatMap((q) => byPart.get(q)!);
    for (const t of byPart.get(p)!) for (let k = 0; k < 3; k++) {
      const i = tri[t + k], j = tri[t + ((k + 1) % 3)];
      const P = vec(s, i), Q = vec(s, j);
      for (const g of targets) {
        const nrm = normalOf(s, g);
        if (!nrm) continue;
        const T = [tri[g], tri[g + 1], tri[g + 2]];
        if (T.includes(i) || T.includes(j)) continue;
        const A = vec(s, T[0]);
        const dp = dot(nrm, sub(P, A)), dq = dot(nrm, sub(Q, A));
        if (!((dp > TOL && dq < -TOL) || (dp < -TOL && dq > TOL))) continue;
        const f = dp / (dp - dq);
        const X = [P[0] + f * (Q[0] - P[0]), P[1] + f * (Q[1] - P[1]), P[2] + f * (Q[2] - P[2])];
        let inside = true;
        for (let m = 0; m < 3 && inside; m++) {
          const U = vec(s, T[m]), e = sub(vec(s, T[(m + 1) % 3]), U);
          inside = dot(crossOf(e, sub(X, U)), nrm) / Math.hypot(e[0], e[1], e[2]) > TOL;
        }
        if (inside) return true;
      }
    }
  }
  return false;
}

/** The full sum at a point, in part order, over the parts whose box holds it. */
function referenceSum(s: Surface, byPart: Map<number, number[]>, boxes: Map<number, Box>, x: number, y: number, z: number): number {
  let w = 0;
  for (const [r, tris] of byPart) {
    if (!holds(boxes.get(r)!, x, y, z, TOL)) continue;
    for (const u of tris) w += windingOf(s, u, [x, y, z]);
  }
  return w;
}

export function reference({ s, part, six, sign }: Scene): 'overlapping' | 'notOriented' | null {
  const byPart = byPartOf(part), ids = [...byPart.keys()];
  const boxes = new Map(ids.map((p) => [p, boxOf(s, byPart.get(p)!)] as const));
  const n = s.points.length / 3;
  const use = new Map<number, number>(), nonManifold = new Set<number>();
  for (let t = 0; t < s.triangles.length; t += 3) for (let k = 0; k < 3; k++) {
    const key = s.triangles[t + k] * n + s.triangles[t + ((k + 1) % 3)];
    const c = (use.get(key) ?? 0) + 1;
    use.set(key, c);
    if (c > 1) nonManifold.add(part[t / 3]);
  }
  const suspect = ids.filter((p) => nonManifold.has(p)
    || (six.get(p)! / 6 < -NO_VOLUME && sign > 0) || (six.get(p)! / 6 > NO_VOLUME && sign < 0)
    || ids.some((q) => q !== p && overlapping(boxes.get(p)!, boxes.get(q)!)));
  if (suspect.length === 0) return null;
  if (referenceCrosses(s, suspect, byPart, boxes)) return 'overlapping';
  const delta = 10 * TOL;
  for (const p of suspect) for (const t of byPart.get(p)!) {
    const nrm = normalOf(s, t);
    if (!nrm) continue;
    const [a, b, c] = [0, 1, 2].map((k) => vec(s, s.triangles[t + k]));
    const at = (wa: number, wb: number, wc: number) => [0, 1, 2].map((d) => wa * a[d] + wb * b[d] + wc * c[d]);
    for (const q of [at(1 / 3, 1 / 3, 1 / 3), at(0.6, 0.2, 0.2), at(0.2, 0.6, 0.2), at(0.2, 0.2, 0.6)]) for (const side of [1, -1]) {
      const w = referenceSum(s, byPart, boxes, q[0] + side * delta * nrm[0], q[1] + side * delta * nrm[1], q[2] + side * delta * nrm[2]);
      const whole = Math.round(w);
      if (Math.abs(w - whole) > 0.1) continue;
      const signed = sign * whole;
      if (signed >= 2) return 'overlapping';
      if (signed < 0) return 'notOriented';
    }
  }
  return null;
}

/** `windingField` over a scene with the proof always tried, however few the terms. */
export function fieldOf({ s, part }: Scene, closed = true) {
  const byPart = byPartOf(part), ids = [...byPart.keys()];
  const boxList = ids.map((p) => boxOf(s, byPart.get(p)!));
  const trees = ids.map((p) => treeOf(byPart.get(p)!.map((t) => boxOf(s, [t]))));
  const reach = s.points.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const input: WindingInput = { s, ids, byPart, boxes: boxList, parts: treeOf(boxList), tree: (j) => trees[j], tol: TOL, reach, closed };
  const field = windingField(input, 0);
  const boxes = new Map(ids.map((p, j) => [p, boxList[j]] as const));
  return { field, input, sum: (x: number, y: number, z: number) => referenceSum(s, byPart, boxes, x, y, z) };
}

/** What `overlapCheck` makes of a w: not whole enough to decide, or the whole number. */
export const reading = (w: number): number | 'skip' => (Math.abs(w - Math.round(w)) > 0.1 ? 'skip' : Math.round(w) + 0);

/** A small seeded generator: the scenes are the same on every run. */
export function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Boxes on a quarter-unit lattice, so faces touch, share planes and cross on purpose; one in four wound inward. */
export function latticeShells(r: () => number, div: number): Tri[][] {
  const count = 2 + Math.floor(r() * 3);
  return Array.from({ length: count }, () => {
    const lo: V = [0, 1, 2].map(() => Math.floor(r() * 6) / 4) as V;
    const hi = lo.map((v) => v + (1 + Math.floor(r() * 4)) / 4) as V;
    return box(lo, hi, div, r() < 0.25);
  });
}
