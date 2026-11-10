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
import { box, fast, fieldOf, latticeShells, reading, reference, sceneOf, seeded, TOL, type Tri, type V } from './__fixtures__/shell-reference.js';
import { WeldCells } from './weld-cells.js';

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
