/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The face grid gives an outline line every face it can clip, whichever cell the line lies in (Refs #557), so its own
 * surface depth does not depend on the grid's layout. A coarse grid filed by each face's box grown by `reach` must
 * lose none: `clipToFace` and `clipToEdge` keep every clip inside that box (`outline-depth-grid.test.ts` has the
 * sliver case itself, measured on a drawing).
 */

import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { EDGE, FaceGrid, STRIDE, clipToEdge, clipToFace, projectMesh } from './face-grid.js';
import type { SectionPlaneConfig } from './types.js';

const plane: SectionPlaneConfig = { axis: 'z', position: 0, flipped: false };
const REACH = 0.05;

/** A seeded generator, so a failure repeats. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** `n` triangles over a 10 m square, a third of them slivers, some seen edge-on, at depths from 1 to 3 m. */
function mesh(n: number, rnd: () => number): MeshData {
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = rnd() * 10, y = rnd() * 10, z = -1 - 2 * rnd();
    const kind = i % 6;
    if (kind < 2) {
      // A sliver 1 to 3 m long and a few millimetres wide at its base.
      const a = rnd() * Math.PI * 2, len = 1 + 2 * rnd(), w = 0.002 + 0.01 * rnd();
      const ux = Math.cos(a), uy = Math.sin(a);
      p.push(x - uy * w, y + ux * w, z, x + uy * w, y - ux * w, z - rnd() * 0.2, x + ux * len, y + uy * len, z);
    } else if (kind === 2) {
      // Seen edge-on: a vertical triangle, so it comes out as edges.
      p.push(x, y, z, x + rnd(), y + rnd(), z, x, y, z - 0.5);
    } else {
      p.push(x, y, z, x + rnd(), y + rnd() * 0.3, z - rnd() * 0.5, x + rnd() * 0.3, y + rnd(), z);
    }
  }
  const positions = new Float32Array(p);
  return { expressId: 1, ifcType: 'IfcMember', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices: Uint32Array.from({ length: n * 3 }, (_, i) => i), color: [1, 1, 1, 1] };
}

describe('the face grid finds every face a line can clip (Refs #557)', () => {
  it('loses none, nearest first, slivers and edge-on faces included', () => {
    const rnd = random(557);
    const faces = projectMesh(mesh(600, rnd), plane);
    const grid = new FaceGrid(faces, REACH);
    const clips = (f: number, ax: number, ay: number, dx: number, dy: number) =>
      faces[f * STRIDE + 9] === EDGE ? clipToEdge(faces, f * STRIDE, ax, ay, dx, dy, REACH) : clipToFace(faces, f * STRIDE, ax, ay, dx, dy, REACH);
    let compared = 0;
    for (let k = 0; k < 400; k++) {
      const ax = rnd() * 10, ay = rnd() * 10;
      const dx = k % 3 === 0 ? 0 : (rnd() - 0.5) * 4, dy = k % 3 === 1 ? 0 : (rnd() - 0.5) * 4;
      const n = grid.query(Math.min(ax, ax + dx), Math.min(ay, ay + dy), Math.max(ax, ax + dx), Math.max(ay, ay + dy));
      const found = Array.from(grid.found.subarray(0, n));
      expect(found, 'nearest first').toEqual([...found].sort((p, q) => p - q));
      const want: number[] = [];
      for (let f = 0; f < faces.length / STRIDE; f++) if (clips(f, ax, ay, dx, dy)) want.push(f);
      expect(found.filter((f) => clips(f, ax, ay, dx, dy))).toEqual(want);
      compared += want.length;
    }
    expect(compared).toBeGreaterThan(1000);
  });
});
