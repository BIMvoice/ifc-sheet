/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The shell check of `measureElement` on an element of many shells (#611). Every shell whose box overlaps another's is
 * suspect, and each suspect shell is tested edge against triangle and point against triangle (`crosses`, `windingOf`), the
 * hot loops of the types schedule (`typeQuantitiesOver`). They were rewritten without per-pair allocation; the answers are
 * pinned here (touching shells are summed, a piercing edge is refused) because a wrong skip or box test in them changes
 * a quantity, not just a time. Speed is measured with the CLI, not asserted: a timing bound would be flaky.
 */

import { describe, expect, it } from 'vitest';
import { measureElement, type MeasureMesh } from './measured-quantities.js';

type V = [number, number, number];

/** A closed solid from planar faces, each given counter-clockwise seen from outside, a vertex per corner. */
function solid(faces: readonly (readonly V[])[]): MeasureMesh {
  const positions: number[] = [], indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const p of f) positions.push(...p);
    for (let k = 1; k + 1 < f.length; k++) indices.push(base, base + k, base + k + 1);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), origin: null };
}

/** A unit cube from `lo`, outward. */
const cube = ([x, y, z]: V): MeasureMesh => solid([
  [[x, y, z], [x, y, z + 1], [x, y + 1, z + 1], [x, y + 1, z]],
  [[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]],
  [[x, y + 1, z], [x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]],
  [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]],
  [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]],
  [[x, y, z], [x, y + 1, z], [x + 1, y + 1, z], [x + 1, y, z]],
]);

/** The unit cube at (0, y, 0) cut on its diagonal into two closed wedges whose boxes both fill the cube: touching, never overlapping. */
function cutCube(y: number): MeasureMesh[] {
  const lowerFaces: V[][] = [
    [[0, y, 0], [0, y, 1], [1, y, 0]], [[0, y + 1, 0], [1, y + 1, 0], [0, y + 1, 1]],
    [[0, y, 0], [1, y, 0], [1, y + 1, 0], [0, y + 1, 0]], [[0, y, 0], [0, y + 1, 0], [0, y + 1, 1], [0, y, 1]],
    [[1, y, 0], [0, y, 1], [0, y + 1, 1], [1, y + 1, 0]],
  ];
  const upperFaces: V[][] = [
    [[1, y, 1], [1, y, 0], [0, y, 1]].reverse(), [[1, y + 1, 1], [1, y + 1, 0], [0, y + 1, 1]],
    [[1, y, 1], [1, y, 0], [1, y + 1, 0], [1, y + 1, 1]].reverse(), [[1, y, 1], [0, y, 1], [0, y + 1, 1], [1, y + 1, 1]].reverse(),
    [[1, y, 0], [0, y, 1], [0, y + 1, 1], [1, y + 1, 0]].reverse(),
  ];
  return [solid(orient(lowerFaces)), solid(orient(upperFaces))];
}

/** Each face turned to point away from the solid's centroid. */
function orient(faces: V[][]): V[][] {
  const all = faces.flat(), c = [0, 1, 2].map((d) => all.reduce((a, p) => a + p[d], 0) / all.length);
  return faces.map((f) => {
    const [a, b, d] = f, u = [0, 1, 2].map((k) => b[k] - a[k]), v = [0, 1, 2].map((k) => d[k] - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return n[0] * (a[0] - c[0]) + n[1] * (a[1] - c[1]) + n[2] * (a[2] - c[2]) > 0 ? f : [...f].reverse();
  });
}

describe('measureElement on an element of many touching shells (#611)', () => {
  const N = 60;
  const stack = Array.from({ length: N }, (_, i) => cutCube(i)).flat();

  it('sums 120 wedges (60 diagonally cut cubes, one on the other) to 60, each shell suspect and each touching only', () => {
    const m = measureElement('IfcColumn', stack);
    expect(m.volume.refusal).toBeNull();
    expect(m.volume.value).toBeCloseTo(N, 4);
  });

  it('refuses the same stack once one more cube pierces it: an edge through a face is overlap, however many shells touch', () => {
    const piercing = cube([0.25, N / 2 - 0.5, 0.25]);
    expect(measureElement('IfcColumn', [...stack, piercing]).volume.refusal).toBe('overlapping');
  });
});
