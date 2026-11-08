/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Regression for #759 (Refs #749): a plan cut a hair below the sill of an opening drew a hole through the cut wall.
 *
 * On rvt01's first floor (cut at 5.3999999 m) wall 14797's opening for window 24516 starts at 5.400, so the wall is solid
 * at the cut. The corners of the opening's bottom face lie 2.4e-8 m below the plane, but the points the geometry kernel
 * added inside that face lie 6.1e-6 m below it. With the plane tolerance at 3e-7 m the corners counted beyond the cut and
 * the inner points on the side the plan looks at, so the triangles of that one flat face were cut along their diagonals,
 * and the plan showed a triangular hole of 0.088 m2 through the wall. Here the same face, on a small wall.
 */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { SectionCutter } from './section-cutter.js';

type P = [number, number, number];

/** A wall 2 m long (x), 0.25 m thick (z), 3 m high (y), with an opening x 0.5..1.5, y SILL..2 through it. */
function wallWithOpening(sill: number, sillNoise: number): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  const add = (p: P): number => {
    positions.push(...p);
    return positions.length / 3 - 1;
  };
  const quad = (a: P, b: P, c: P, d: P): void => {
    const [i, j, k, l] = [a, b, c, d].map(add);
    indices.push(i, j, k, i, k, l);
  };
  const T = 0.25;
  for (const z of [0, T]) {
    quad([0, 0, z], [2, 0, z], [2, sill, z], [0, sill, z]); // below the opening
    quad([0, sill, z], [0.5, sill, z], [0.5, 2, z], [0, 2, z]); // left of it
    quad([1.5, sill, z], [2, sill, z], [2, 2, z], [1.5, 2, z]); // right of it
    quad([0, 2, z], [2, 2, z], [2, 3, z], [0, 3, z]); // above it
  }
  quad([0, 0, 0], [0, 0, T], [0, 3, T], [0, 3, 0]); // the ends
  quad([2, 0, 0], [2, 0, T], [2, 3, T], [2, 3, 0]);
  quad([0, 0, 0], [2, 0, 0], [2, 0, T], [0, 0, T]); // bottom and top
  quad([0, 3, 0], [2, 3, 0], [2, 3, T], [0, 3, T]);
  quad([0.5, sill, 0], [0.5, sill, T], [0.5, 2, T], [0.5, 2, 0]); // the jambs and the head
  quad([1.5, sill, 0], [1.5, sill, T], [1.5, 2, T], [1.5, 2, 0]);
  quad([0.5, 2, 0], [1.5, 2, 0], [1.5, 2, T], [0.5, 2, T]);
  // The bottom face of the opening, fanned round a point the kernel placed in it, `sillNoise` below the corners.
  const corners: P[] = [[0.5, sill, 0], [1.5, sill, 0], [1.5, sill, T], [0.5, sill, T]];
  const centre = add([1, sill - sillNoise, T / 2]);
  const ring = corners.map(add);
  for (let i = 0; i < 4; i++) indices.push(ring[i], ring[(i + 1) % 4], centre);
  return {
    expressId: 14797,
    ifcType: 'IfcWall',
    modelIndex: 0,
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    indices: new Uint32Array(indices),
    color: [1, 1, 1, 1],
    origin: [0, 0, 0],
  } as unknown as MeshData;
}

const area = (ring: readonly { x: number; y: number }[]): number =>
  Math.abs(ring.reduce((s, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0)) / 2;

/** Whether a plan point lies on the outline of the wall's footprint, x 0..2 by z 0..0.25. */
const onOutline = (p: { x: number; y: number }): boolean =>
  Math.min(Math.abs(p.x), Math.abs(p.x - 2), Math.abs(p.y), Math.abs(p.y - 0.25)) < 1e-6;

describe('a plan cut a hair below the sill of an opening draws the wall whole (#759, Refs #749)', () => {
  // The plan looks down, from 1e-7 below the sill, as rvt01's first floor at 5.3999999 under a 5.400 sill.
  const cutter = new SectionCutter({ axis: 'y', position: 1 - 1e-7, flipped: false });

  it('cuts only the outline of the wall when the bottom face of the opening carries the kernel\'s 6 µm noise', () => {
    const { segments, polygons } = cutter.cutMeshes([wallWithOpening(1, 6.1e-6)]);
    for (const s of segments) expect([onOutline(s.p0_2d), onOutline(s.p1_2d)], JSON.stringify(s.p0_2d) + JSON.stringify(s.p1_2d)).toEqual([true, true]);
    expect(polygons).toHaveLength(1);
    expect(polygons[0].polygon.holes).toEqual([]);
    expect(area(polygons[0].polygon.outer)).toBeCloseTo(0.5, 6);
  });

  it('draws the same wall when that face is flat', () => {
    const { polygons } = cutter.cutMeshes([wallWithOpening(1, 0)]);
    expect(polygons).toHaveLength(1);
    expect(polygons[0].polygon.holes).toEqual([]);
    expect(area(polygons[0].polygon.outer)).toBeCloseTo(0.5, 6);
  });

  it('still cuts the opening when the plane is 1 mm above the sill', () => {
    const above = new SectionCutter({ axis: 'y', position: 1.001, flipped: false });
    const { polygons } = above.cutMeshes([wallWithOpening(1, 6.1e-6)]);
    const total = polygons.reduce((s, p) => s + area(p.polygon.outer) - p.polygon.holes.reduce((h, r) => h + area(r), 0), 0);
    expect(total).toBeCloseTo(0.25, 6);
  });
});
