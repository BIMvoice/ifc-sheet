/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bound behind `windingField`'s proof (#611). Its constants are far looser than the rounding they cover (measured
 * against exact arithmetic, num and den strayed by under 14 units where 4096 are charged), so no reading here can show a
 * weakened far charge: even tenfold weaker it still covers the true error.
 * Hence these pin the derivation itself: the charge, how far the walk reaches, what is charged inside it, and that a
 * point past the budget falls back to the sum. The scenes that do show a real gap between the sum and the count are here
 * too: over a sliver the float sum itself leaves the whole number, and the reference's reading of that sum is the answer.
 */

import { describe, expect, it } from 'vitest';
import { fast, box, fieldOf, reading, reference, sceneOf, type Scene, type Tri, type V } from './__fixtures__/shell-reference.js';
import { errorBound, farRatio } from './shell-winding.js';

const U = 2 ** -53;
/** The file header's far charge per R³: (4096/(4√2))·u, from |e| ≤ 4096·u·L³ and r ≥ √2·d³. */
const FAR_TERM = (4096 * U) / (4 * Math.SQRT2);

describe('the far charge', () => {
  it.each([1, 32, 1000, 1e6, 1e9])('for %d terms comes to 0.02 at R = farRatio(n), with the atan2 cut out of reach', (n) => {
    const R = farRatio(n);
    expect(n * FAR_TERM * R ** 3).toBeCloseTo(0.02, 10);
    expect(R).toBeLessThan(2.4e4);
  });
});

/** One soup: `first` near the point, then eight triangles far behind it, four small ones `d` ahead of it, and four far beyond. */
function reachScene(d: number, first: readonly Tri[] = []): Scene {
  const far = (x: number, k: number): Tri => [[x, -1000 + k, -1000], [x + 1, 1000 - k, -1000], [x, k, 1000]];
  const near = (k: number): Tri => {
    const s = 1e-3 * d;
    return [[0, -s, -s], [s, s * (1 + k), -s], [0, s, s]];
  };
  const tris: Tri[] = [...first];
  for (let k = 0; k < 8; k++) tris.push(far(-1000 - k, k));
  for (let k = 0; k < 4; k++) tris.push(near(k));
  for (let k = 0; k < 4; k++) tris.push(far(1000 + k, k));
  const points = tris.flat().flat();
  const part = new Int32Array(tris.length);
  for (let t = 0; t < first.length; t++) part[t] = 1;
  const six = new Map<number, number>();
  return { s: { points, triangles: points.slice(0, points.length / 3).map((_, i) => i) }, part, six, sign: 1 };
}

describe('the walk within L/R', () => {
  const N = 16;
  /** Hand-worked: the box runs ±1000 on y and z, and to -1007 and 1004 on x. */
  const reachOf = (d: number): number => Math.hypot(Math.max(1007 - d, 1004 + d), 1000, 1000) / farRatio(N);
  const base = 0.02 + N * 4 * U;
  const boundAt = (d: number, scene = reachScene(d), holding = [0]): number => {
    const { input } = fieldOf(scene);
    return errorBound(input, holding, -d, 0, 0, N, 0);
  };

  it('charges only the bulk when every triangle is farther than L/R', () => {
    expect(boundAt(1.5 * reachOf(1))).toBeCloseTo(base, 12);
  });

  it('charges a triangle found inside L/R on top of the bulk', () => {
    const d = reachOf(1) / 1.5;
    expect(boundAt(d)).toBeGreaterThan(base + 1e-14);
    expect(boundAt(d)).toBeLessThan(0.05);
  });

  it('takes L from every holding part, not the first', () => {
    const d = reachOf(1) / 1.5;
    const small: Tri[] = [[[-d - 1e-3, 0.1, -1e-3], [-d + 1e-3, 0.1, 1e-3], [-d, 0.1 + 1e-3, 0]]];
    const scene = reachScene(d, small);
    const { input } = fieldOf(scene);
    const alone = errorBound(input, [0], -d, 0, 0, N, 0);
    const both = errorBound(input, [0, 1], -d, 0, 0, N, 0);
    expect(both).toBeGreaterThan(alone + 1e-14);
  });
});

describe('falling back to the sum', () => {
  const cube = (): Scene => sceneOf([box([0, 0, 0], [1, 1, 1], 1)]);

  it('proves a point near a rim while the near charges fit the budget, and sums once they do not', () => {
    const { field, sum, input } = fieldOf(cube());
    const near: V = [0.5, 1e-11, 1e-11], nearer: V = [0.5, 3e-13, 3e-13];
    expect(field(...near)).toBe(1);
    expect(errorBound(input, [0], ...nearer, 12, 0)).toBe(Infinity);
    expect(Object.is(field(...nearer), sum(...nearer))).toBe(true);
    expect(Number.isInteger(sum(...nearer))).toBe(false);
  });

  /** A prism 1 long and `w` across, closed, wound inward. */
  const sliver = (w: number): Scene => {
    const P = (t: number, k: number): V => [t, k === 1 ? w : 0, k === 2 ? w : 0];
    const tris: Tri[] = [[P(0, 0), P(0, 1), P(0, 2)], [P(1, 0), P(1, 2), P(1, 1)]];
    for (let k = 0; k < 3; k++) {
      const m = (k + 1) % 3;
      tris.push([P(0, k), P(1, k), P(1, m)], [P(0, k), P(1, m), P(0, m)]);
    }
    return sceneOf([tris]);
  };

  it('answers with the sum over a sliver, where rounding has pushed the sum itself off the whole number the count gives', () => {
    for (const w of [1e-8, 3e-9, 1e-9]) {
      const { field, sum } = fieldOf(sliver(w));
      for (const p of [[0.5, w / 3, w / 3], [0.5, w / 3, -w / 3]] as V[]) {
        expect(Object.is(field(...p), sum(...p)), `${w} at ${p.join()}`).toBe(true);
        // Not a whole number, and at the smaller widths not even within 0.1 of one, though the exact w is -1 inside and 0 outside.
        expect(Number.isInteger(sum(...p))).toBe(false);
      }
    }
    expect(reading(fieldOf(sliver(1e-8)).sum(0.5, 1e-8 / 3, 1e-8 / 3))).toBe('skip');
  });

  /** A cube with a whole face's worth of its triangles gone, and a void wound inward inside: the point's count is whole, its sum is not. */
  const open = (): Tri[][] => [box([0, 0, 0], [3, 3, 3], 3).slice(18), box([1, 1, 1], [2, 2, 2], 3, true)];

  it('never lets the count stand in for w on a surface that is not closed', () => {
    const scene = sceneOf(open());
    const want = reference(scene);
    expect(want).toBeNull();
    expect(fast(scene)).toBe(want);
    const { field, sum } = fieldOf(scene, false);
    const p: V = [1.5, 1.5, 0.5];
    expect(Object.is(field(...p), sum(...p))).toBe(true);
    expect(Number.isInteger(sum(...p))).toBe(false);
  });

  // The far triangles' rounding is bounded relative to a product of three lengths; once that product overflows, den is Infinity or NaN and no bound holds.
  it.each([false, true])('answers as the reference does past where a product of three lengths overflows (inner shell inward: %s)', (flipped) => {
    const k = 1e103;
    const scaled = (t: Tri[]): Tri[] => t.map((q) => q.map((p) => p.map((v) => v * k)) as Tri);
    const scene = sceneOf([scaled(box([-100, -100, -100], [100, 100, 100], 2)), scaled(box([0.1, 0.2, 0.3], [1.1, 1.2, 1.3], 2, flipped))]);
    expect(reference(scene)).toBeNull();
    expect(fast(scene)).toBeNull();
  });

  it.each([NaN, Infinity])('sums when a vertex is %d, and the ray and the walk never come near it', (bad) => {
    const scene = sceneOf([box([0, 0, 0], [1, 1, 1], 3)]);
    scene.s.points[0] = bad;
    const { field, sum } = fieldOf(scene);
    const p: V = [0.9, 0.9, 0.9];
    expect(Object.is(field(...p), sum(...p))).toBe(true);
    expect(Number.isInteger(field(...p))).toBe(false);
  });
});
