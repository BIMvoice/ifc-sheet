/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Quantities measured from geometry (#74), the cases a sum of closed shells
 * gets wrong and the ones it must keep, on Float32 meshes (what the viewer
 * hands over): overlapping or doubled shells are refused, touching ones and a
 * void inside a body are summed; a wall that is not one straight leg gets no
 * side area; the weld keeps a 12 µm sheet, joins copies of a point either side
 * of a grid cell, and works 5 000 km out with the offset in the mesh origin.
 */

import { describe, expect, it } from 'vitest';
import { measureElement, weldTolerance, type MeasureMesh } from './measured-quantities.js';

type V = [number, number, number];

/** An axis-aligned box, Y up, wound outward (or inward with `inward`), four Float32 vertices per face. */
function box(lo: V, hi: V, opts: { inward?: boolean; origin?: V; f32?: boolean } = {}): MeasureMesh {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
  // -x first: the weld's anchor is the first vertex, so local coordinates equal these.
  const faces: V[][] = [
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
  ];
  return fromFaces(faces, opts);
}

/** Planar convex faces (corners counter-clockwise from outside) as one Float32 mesh, a vertex per face corner. */
function fromFaces(faces: readonly (readonly V[])[], opts: { inward?: boolean; origin?: V; f32?: boolean } = {}): MeasureMesh {
  const positions: number[] = [], indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const p of f) positions.push(...p);
    for (let k = 1; k + 1 < f.length; k++) indices.push(...(opts.inward ? [0, k + 1, k] : [0, k, k + 1]).map((i) => base + i));
  }
  return { positions: opts.f32 === false ? new Float64Array(positions) : new Float32Array(positions), indices: new Uint32Array(indices), origin: opts.origin ?? null };
}

/** The faces of a convex solid, each wound counter-clockwise seen from outside (from the centroid's far side). */
function outward(faces: V[][]): V[][] {
  const all = faces.flat(), c = [0, 1, 2].map((d) => all.reduce((a, p) => a + p[d], 0) / all.length);
  return faces.map((f) => {
    const [a, b, d] = f, u = [0, 1, 2].map((k) => b[k] - a[k]), v = [0, 1, 2].map((k) => d[k] - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return n[0] * (a[0] - c[0]) + n[1] * (a[1] - c[1]) + n[2] * (a[2] - c[2]) > 0 ? f : [...f].reverse();
  });
}

/** A prism: the plan polygon (x, z, counter-clockwise seen from above) extruded from y0 to y1. */
function prism(plan: readonly [number, number][], y0: number, y1: number): MeasureMesh {
  const n = plan.length;
  const top = plan.map(([x, z]) => [x, y1, z] as V).reverse();
  const bottom = plan.map(([x, z]) => [x, y0, z] as V);
  const sides = plan.map(([x, z], i) => {
    const [x2, z2] = plan[(i + 1) % n];
    return [[x, y0, z], [x, y1, z], [x2, y1, z2], [x2, y0, z2]] as V[];
  });
  // Seen from above, counter-clockwise in (x, z) is clockwise in (x, -z): the top as listed points down; reverse fixes it.
  return fromFaces([top, bottom, ...sides]);
}

const vol = (meshes: MeasureMesh[], cls = 'IfcColumn') => measureElement(cls, meshes).volume;

describe('measureElement: shells that overlap are refused, not summed (#74)', () => {
  it('refuses a unit cube drawn twice (summing gives 2, the solid is 1)', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([0, 0, 0], [1, 1, 1])])).toEqual({ value: null, refusal: 'overlapping' });
  });

  it('refuses two cubes overlapping by half (summing gives 2, the solid is 1.5)', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([0.5, 0, 0], [1.5, 1, 1])]).refusal).toBe('overlapping');
  });

  it('refuses a same-wound cube nested in another (summing gives 1.125, the solid is 1)', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([0.25, 0.25, 0.25], [0.75, 0.75, 0.75])]).refusal).toBe('overlapping');
  });

  it('refuses cubes overlapping at a corner, and two bars crossing like a plus sign (no vertex inside the other)', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([0.5, 0.5, 0.5], [1.5, 1.5, 1.5])]).refusal).toBe('overlapping');
    expect(vol([box([0, 0, 4], [10, 1, 5]), box([4, 0, 0], [5, 1, 10])]).refusal).toBe('overlapping');
    // Narrow bars: no sample point of either falls in the 0.2 m crossing, only the crossing test sees it (summing gives 4, the solid is 3.96).
    expect(vol([box([0, 0, 4.9], [10, 1, 5.1]), box([4.9, 0, 0], [5.1, 1, 10])]).refusal).toBe('overlapping');
  });

  it('subtracts an inward-wound void inside a body: 1 - 0.125', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([0.25, 0.25, 0.25], [0.75, 0.75, 0.75], { inward: true })]).value).toBeCloseTo(0.875, 6);
  });

  it('refuses an inward-wound shell outside the body as not oriented (summing gives 0.875)', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([3, 0, 0], [3.5, 0.5, 0.5], { inward: true })]).refusal).toBe('notOriented');
  });

  it('refuses an inward-wound shell that pokes out of the body', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([0.5, 0.25, 0.25], [1.5, 0.75, 0.75], { inward: true })]).refusal).not.toBeNull();
  });

  it('sums shells that only touch: a shared face, a flight resting on part of a landing, an edge', () => {
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([1, 0, 0], [2, 1, 1])]).value).toBeCloseTo(2, 6);
    // A landing 3 × 0.2 × 1.2 and a block standing on its right half, flush with its front.
    expect(vol([box([0, 0, 0], [3, 0.2, 1.2]), box([1.5, 0.2, 0], [2.5, 1.2, 1])]).value).toBeCloseTo(0.72 + 1, 6);
    expect(vol([box([0, 0, 0], [1, 1, 1]), box([1, 1, 0], [2, 2, 1])]).value).toBeCloseTo(2, 6);
    // Many steps, each its own closed box, each resting on the one below.
    const steps = Array.from({ length: 12 }, (_, i) => box([0, i * 0.17, i * 0.28], [1.2, (i + 1) * 0.17, (i + 1) * 0.28 + 0.28]));
    expect(vol(steps).value).toBeCloseTo(12 * 1.2 * 0.17 * 0.56, 6);
  });

  it('sums shells whose boxes overlap but which only touch: a cube cut on its diagonal, a prism resting on a cube\'s edge', () => {
    const lo = outward([[[0, 0, 0], [1, 0, 0], [0, 0, 1]], [[0, 1, 0], [1, 1, 0], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
      [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]]]);
    const hi = outward([[[1, 0, 1], [1, 0, 0], [0, 0, 1]], [[1, 1, 1], [1, 1, 0], [0, 1, 1]], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
      [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]]]);
    expect(vol([fromFaces(lo), fromFaces(hi)]).value).toBeCloseTo(1, 6);
    // A prism on the line x + y = 2, touching the unit cube along its edge x = y = 1 only; its face diagonal passes that edge.
    const tri: [number, number][] = [[2, 0], [2, 2], [0, 2]];
    const side = (a: [number, number], b: [number, number]): V[] => [[a[0], a[1], -0.5], [b[0], b[1], -0.5], [b[0], b[1], 1.5], [a[0], a[1], 1.5]];
    const wedge = outward([tri.map(([x, y]) => [x, y, -0.5] as V), tri.map(([x, y]) => [x, y, 1.5] as V), side(tri[0], tri[1]), side(tri[1], tri[2]), side(tri[2], tri[0])]);
    expect(vol([box([0, 0, 0], [1, 1, 1]), fromFaces(wedge)]).value).toBeCloseTo(1 + 4, 6);
  });
});

describe('measureElement: a wall that is not one straight leg gets no side area (#74)', () => {
  it('refuses an L-shaped wall (legs 6 m and 4 m, 3 m high, 0.3 m thick) but keeps its volume', () => {
    const plan: [number, number][] = [[0, 0], [6, 0], [6, 4], [5.7, 4], [5.7, 0.3], [0, 0.3]];
    const m = measureElement('IfcWall', [prism([...plan].reverse(), 0, 3)]);
    expect(m.volume.value).toBeCloseTo((6 * 0.3 + 3.7 * 0.3) * 3, 5);
    expect(m.area).toEqual({ value: null, refusal: 'notStraight' });
  });

  it('refuses an L whose second leg sticks out only 10 cm (side × band 31% over the volume)', () => {
    const plan: [number, number][] = [[0, 0], [6, 0], [6, 0.4], [5.7, 0.4], [5.7, 0.3], [0, 0.3]];
    expect(measureElement('IfcWall', [prism([...plan].reverse(), 0, 3)]).area?.refusal).toBe('notStraight');
  });

  it('refuses a wall splayed 15° in plan and one battered 15° in section', () => {
    const t = Math.tan((15 * Math.PI) / 180);
    const splayed: [number, number][] = [[0, 0], [5, 0], [5, 0.3 + 5 * t], [0, 0.3]];
    expect(measureElement('IfcWall', [prism([...splayed].reverse(), 0, 3)]).area?.refusal).toBe('notStraight');
    // Section in (z, y): the front face leans back 15°, 1 m thick at the foot, 0.2 m at the head.
    const foot = [[0, 0, 0], [5, 0, 0], [5, 0, 1], [0, 0, 1]] as V[];
    const head = [[0, 3, 3 * t], [5, 3, 3 * t], [5, 3, 1], [0, 3, 1]] as V[];
    const battered = fromFaces(outward([
      foot, head,
      [foot[2], foot[3], head[3], head[2]], [foot[0], foot[1], head[1], head[0]],
      [foot[0], foot[3], head[3], head[0]], [foot[1], foot[2], head[2], head[1]],
    ]));
    const b = measureElement('IfcWall', [battered]);
    expect(b.volume.value).toBeGreaterThan(0);
    expect(b.area?.refusal).toBe('notStraight');
  });

  it('still measures a straight wall with mitred ends: the sides averaged', () => {
    // 5 m along the front, 4.4 m along the back, 0.3 m thick: one side is (5 + 4.4) / 2 × 3.
    const mitred: [number, number][] = [[0, 0], [5, 0], [4.7, 0.3], [0.3, 0.3]];
    expect(measureElement('IfcWall', [prism([...mitred].reverse(), 0, 3)]).area?.value).toBeCloseTo(4.7 * 3, 5);
  });
});

describe('measureElement: the weld (#74)', () => {
  it('keeps a 12 µm sheet and collapses a 5 µm one (the 10 µm floor)', () => {
    expect(vol([box([0, 0, 0], [1, 12e-6, 1])]).value).toBeCloseTo(12e-6, 8);
    expect(vol([box([0, 0, 0], [1, 5e-6, 1])]).value).toBeNull();
  });

  it('joins two copies of a corner one Float32 step apart even where a grid cell boundary falls between them', () => {
    const tol = weldTolerance([box([0, 0, 0], [1, 1, 1])]);
    let straddled = 0;
    for (let k = 0; k < 200; k++) {
      const x1 = Math.fround(1 + k * 1e-7);
      // The next Float32 above x1: one unit in the last place.
      const up = Math.fround(x1 + 2 ** -23);
      if (Math.floor(x1 / tol) !== Math.floor(up / tol)) straddled++;
      const cube = box([0, 0, 0], [x1, 1, 1]);
      // Every copy of the x1 corners except those of the +x face moved up one step.
      const p = cube.positions as Float32Array;
      for (let i = 0; i < p.length; i += 3) if (p[i] === x1 && (i < 12 || i >= 24)) p[i] = up;
      expect(vol([cube]).value, `x1 = ${x1}`).toBeCloseTo(x1, 5);
    }
    // The premise: the sweep did cross cell boundaries, so a grid without the neighbour search would split corners.
    expect(straddled).toBeGreaterThan(0);
  });

  it('scales the tolerance to Float32 rounding of the stored coordinates, and measures 5 000 km out with the offset in the origin', () => {
    expect(weldTolerance([box([0, 0, 0], [1, 1, 1])])).toBe(1e-5);
    expect(weldTolerance([box([1000, 0, 0], [1001, 1, 1])])).toBeCloseTo(1001 * 2 ** -22, 12);
    expect(weldTolerance([box([1000, 0, 0], [1001, 1, 1], { f32: false })])).toBe(1e-5);
    const far = measureElement('IfcWall', [box([1, 0, 2], [6, 3, 2.3], { origin: [5e6, 120, -3e6] })]);
    expect(far.volume.value).toBeCloseTo(4.5, 5);
    expect(far.area?.value).toBeCloseTo(15, 4);
  });
});
