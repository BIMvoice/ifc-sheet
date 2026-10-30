/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The shell check against a brute-force reference kept here (#611): `reference` is the check as it stood before the
 * hierarchies and the ray, every edge against every target and the full sum at every sample. Scenes the broad phase and
 * the proof could get wrong are pinned to a literal answer and to the reference; seeded scenes then compare the two at
 * scale, and sample points placed on faces, rims and corners compare `windingField` with the sum it stands in for.
 */

import { describe, expect, it } from 'vitest';
import { overlapCheck, type Surface } from './measured-shells.js';
import { treeOf, type Box } from './shell-bvh.js';
import { holds, windingField, windingOf } from './shell-winding.js';
import { WeldCells } from './weld-cells.js';

type V = [number, number, number];
type Tri = [V, V, V];
type Scene = { s: Surface; part: Int32Array; six: Map<number, number>; sign: number };

const TOL = 1e-5, NO_VOLUME = 1e-9;

/** A box's outward (or, flipped, inward) triangles, each face cut into div × div squares. */
function box(lo: V, hi: V, div = 1, flipped = false): Tri[] {
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
function sceneOf(shells: readonly Tri[][]): Scene {
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

const fast = ({ s, part, six, sign }: Scene) => overlapCheck(s, part, six, sign, TOL, NO_VOLUME);

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

function reference({ s, part, six, sign }: Scene): 'overlapping' | 'notOriented' | null {
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
function fieldOf({ s, part }: Scene) {
  const byPart = byPartOf(part), ids = [...byPart.keys()];
  const boxList = ids.map((p) => boxOf(s, byPart.get(p)!));
  const trees = ids.map((p) => treeOf(byPart.get(p)!.map((t) => boxOf(s, [t]))));
  const reach = s.points.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const field = windingField({ s, ids, byPart, boxes: boxList, parts: treeOf(boxList), tree: (j) => trees[j], tol: TOL, reach }, 0);
  const boxes = new Map(ids.map((p, j) => [p, boxList[j]] as const));
  return { field, sum: (x: number, y: number, z: number) => referenceSum(s, byPart, boxes, x, y, z) };
}

/** What `overlapCheck` makes of a w: not whole enough to decide, or the whole number. */
const reading = (w: number): number | 'skip' => (Math.abs(w - Math.round(w)) > 0.1 ? 'skip' : Math.round(w) + 0);

/** A small seeded generator: the scenes are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Boxes on a quarter-unit lattice, so faces touch, share planes and cross on purpose; one in four wound inward. */
function latticeShells(r: () => number, div: number): Tri[][] {
  const count = 2 + Math.floor(r() * 3);
  return Array.from({ length: count }, () => {
    const lo: V = [0, 1, 2].map(() => Math.floor(r() * 6) / 4) as V;
    const hi = lo.map((v) => v + (1 + Math.floor(r() * 4)) / 4) as V;
    return box(lo, hi, div, r() < 0.25);
  });
}

describe('overlapCheck against the brute-force reference (#611)', () => {
  const unit = (o: V, size = 1, div = 4, flipped = false): Tri[] => box(o, [o[0] + size, o[1] + size, o[2] + size], div, flipped);

  it.each<[string, () => Tri[][], 'overlapping' | 'notOriented' | null]>([
    ['faces touching, corners not shared: boxes meet but do not overlap', () => [unit([0, 0, 0]), box([1, 0.1, 0.1], [2, 0.8, 0.8], 3)], null],
    ['faces touching and fully welded: one part, every edge doubled', () => [unit([0, 0, 0]), unit([1, 0, 0])], null],
    ['coplanar overlap: the second box shares three planes with the first and covers half of it', () => [unit([0, 0, 0]), box([0.5, 0, 0], [1.5, 1, 1], 4)], 'overlapping'],
    ['nested, the same winding: w = 2 in the inner one', () => [unit([0, 0, 0], 3), unit([1, 1, 1])], 'overlapping'],
    ['nested, the inner one wound inward: a void', () => [unit([0, 0, 0], 3), unit([1, 1, 1], 1, 4, true)], null],
    ['an inward shell with nothing around it: w = -1', () => [unit([0, 0, 0], 3), unit([5, 5, 5], 1, 4, true)], 'notOriented'],
    ['an island in a void: the box inside a box inside a box, no solid overlapping', () => [unit([0, 0, 0], 5), unit([1, 1, 1], 3, 4, true), unit([2, 2, 2])], null],
    ['a void wall touched from inside by the island', () => [unit([0, 0, 0], 5), unit([1, 1, 1], 3, 4, true), box([1, 2, 2], [2, 3, 3], 3)], null],
    // Beside a void, so the check runs; the neighbour's box stops short of the wall by half the tolerance: it holds the wall's samples, and overlaps nothing.
    ['a shell in an empty box overlap, closer than the tolerance', () => [unit([0, 0, 0], 3), unit([1, 1, 1], 1, 4, true), box([3 + TOL / 2, 0, 0], [4, 1, 1], 3)], null],
  ])('%s', (_name, shells, want) => {
    const scene = sceneOf(shells());
    expect(reference(scene)).toBe(want);
    expect(fast(scene)).toBe(want);
  });

  // No sample reaches the 50 µm of tip inside the cube: only the broad phase handing the edge to the face can catch this one.
  it('finds an edge that pierces a flat face by barely more than the tolerance, which no sample can see', () => {
    const tip: V = [0.3, 0.6, 5e-5], base: V[] = [[0.2, 0.5, -1], [0.4, 0.5, -1], [0.3, 0.8, -1]];
    const spike: Tri[] = [[base[0], base[2], base[1]], [base[0], base[1], tip], [base[1], base[2], tip], [base[2], base[0], tip]];
    const scene = sceneOf([box([0, 0, 0], [1, 1, 1], 1), spike]);
    expect(reference(scene)).toBe('overlapping');
    expect(fast(scene)).toBe('overlapping');
  });

  // Only the cube's edges cross here, through the tent's one big face, by 58 µm at its corner; the tent's own edges stay clear and no sample lands in the tip.
  it('finds a corner poking through a far larger face, which only the other part\'s triangles can show', () => {
    const e = 1e-4;
    const a: V = [3, 1, -1 - e], b: V = [1, 3, -1 - e], c: V = [0.5, 0.5, 2 - e], apex: V = [3, 3, 3];
    const tent: Tri[] = [[a, c, b], [a, b, apex], [b, c, apex], [c, a, apex]];
    const scene = sceneOf([box([0, 0, 0], [1, 1, 1], 1), tent]);
    expect(reference(scene)).toBe('overlapping');
    expect(fast(scene)).toBe('overlapping');
  });

  it('answers as the reference does on 150 seeded lattice scenes, all three answers among them', () => {
    const r = seeded(611);
    const seen = { null: 0, overlapping: 0, notOriented: 0 };
    for (let i = 0; i < 150; i++) {
      const scene = sceneOf(latticeShells(r, 2));
      const want = reference(scene);
      seen[want ?? 'null']++;
      expect(fast(scene), `scene ${i}`).toBe(want);
    }
    expect(seen.null).toBeGreaterThan(5);
    expect(seen.overlapping).toBeGreaterThan(5);
    expect(seen.notOriented).toBeGreaterThan(5);
  });
});

describe('windingField against the sum it stands in for (#611)', () => {
  it('gives the very float of the sum at a point on a face, on a rim and on a corner', () => {
    const { field, sum } = fieldOf(sceneOf([box([0, 0, 0], [1, 1, 1], 2)]));
    const onFace: V = [0.3, 0.2, 0], onRim: V = [0.5, 0.25, 0], onCorner: V = [0, 0, 0];
    for (const p of [onFace, onRim, onCorner]) expect(Object.is(field(...p), sum(...p)), p.join()).toBe(true);
    // On a rim the two triangles meeting there add nothing and the rest of the box adds a half: it decides nothing.
    expect(reading(field(...onRim))).toBe('skip');
  });

  it('gives the sum, not the whole number, this close to a face: the count is clean but the error bound cannot be met', () => {
    const { field, sum } = fieldOf(sceneOf([box([0, 0, 0], [1, 1, 1], 1)]));
    let unround = 0;
    for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
      const p: V = [i / 41, j / 41, 5e-14];
      const want = sum(...p);
      unround += Number.isInteger(want) ? 0 : 1;
      expect(Object.is(field(...p), want), p.join()).toBe(true);
    }
    expect(unround).toBeGreaterThan(100);
  });

  it('reads as the sum at seeded points, and answers both ways: by proof off the surfaces, by the sum on them', () => {
    const r = seeded(74);
    let proven = 0, summed = 0, onSurface = 0;
    for (let i = 0; i < 40; i++) {
      const scene = sceneOf(latticeShells(r, 3));
      const { field, sum } = fieldOf(scene);
      for (let k = 0; k < 150; k++) {
        // Half on the lattice, on faces, rims and corners of the boxes or near them; half anywhere.
        const lattice = k % 2 === 0;
        const p: V = [0, 1, 2].map(() => (lattice ? Math.floor(r() * 12) / 4 : r() * 3 - 0.25)) as V;
        const got = field(...p), want = sum(...p);
        expect(reading(got), `scene ${i} at ${p.join()}`).toBe(reading(want));
        expect(Number.isInteger(got) || Object.is(got, want), `scene ${i} at ${p.join()}`).toBe(true);
        if (reading(want) === 'skip') onSurface++;
        if (Number.isInteger(got) && !Number.isInteger(want)) proven++;
        if (!Number.isInteger(got)) summed++;
      }
    }
    expect(proven).toBeGreaterThan(100);
    expect(summed).toBeGreaterThan(100);
    expect(onSurface).toBeGreaterThan(50);
  });
});

describe('WeldCells, as a Map keyed by "i,j,k" (#611)', () => {
  it('keeps every cell apart: negatives, huge numbers, near misses on one axis, through growth', () => {
    const r = seeded(1891);
    const cells = new WeldCells(), map = new Map<string, number>();
    for (let n = 0; n < 5000; n++) {
      // A small range, so the same cell comes back and cells differing on one axis alone are common; now and then past 2^53.
      const c = (): number => (r() < 0.02 ? Math.floor((r() - 0.5) * 2 ** 60) : Math.floor(r() * 40) - 20);
      const [i, j, k] = [c(), c(), c()];
      const key = `${i},${j},${k}`;
      expect(cells.get(i, j, k), key).toBe(map.get(key));
      cells.set(i, j, k, n);
      map.set(key, n);
    }
    expect(map.size).toBeGreaterThan(1000);
    for (const [key, id] of map) {
      const [i, j, k] = key.split(',').map(Number);
      expect(cells.get(i, j, k), key).toBe(id);
    }
  });

  it('takes -0 for 0, as the text of a cell does', () => {
    const cells = new WeldCells();
    cells.set(0, -0, 0, 7);
    expect(cells.get(-0, 0, -0)).toBe(7);
  });
});
