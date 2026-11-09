/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The face grid gives an outline line exactly the faces #779's grid gave it, so its own surface depth is the same
 * (Refs #557). That grid filed each face in fine cells and a query walked each face once per cell, a third of the
 * views' time on ISSUE_068; the grid that replaced it is coarse, and it must neither lose a face nor gain one. Gaining
 * one is the easy mistake: a sliver's grown corner reaches past the cells #779 filed it in, so a line there never met
 * it, and a coarse grid alone would let it.
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

/** The faces #779's grid returned for the line's box grown by `reach`: every face filed in one of its cells. */
function shippedGrid(faces: Float64Array, reach: number): (minU: number, minV: number, maxU: number, maxV: number) => Set<number> {
  const count = faces.length / STRIDE;
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (let o = 0; o < faces.length; o += STRIDE) {
    for (let k = 0; k < 6; k += 2) {
      minU = Math.min(minU, faces[o + k]); maxU = Math.max(maxU, faces[o + k]);
      minV = Math.min(minV, faces[o + k + 1]); maxV = Math.max(maxV, faces[o + k + 1]);
    }
  }
  const size = count > 64 ? Math.min(64, Math.ceil(Math.sqrt(count))) : 1;
  const cu = Math.max((maxU - minU + 2 * reach) / size, 1e-12), cv = Math.max((maxV - minV + 2 * reach) / size, 1e-12);
  const cell = (x: number, min: number, c: number) => Math.max(0, Math.min(size - 1, Math.floor((x - (min - reach)) / c)));
  const ranges = Array.from({ length: count }, (_, f) => {
    const o = f * STRIDE;
    const us = [faces[o], faces[o + 2], faces[o + 4]], vs = [faces[o + 1], faces[o + 3], faces[o + 5]];
    return [cell(Math.min(...us) - reach, minU, cu), cell(Math.min(...vs) - reach, minV, cv), cell(Math.max(...us) + reach, minU, cu), cell(Math.max(...vs) + reach, minV, cv)];
  });
  return (a, b, c, d) => {
    const u0 = cell(a - reach, minU, cu), v0 = cell(b - reach, minV, cv), u1 = cell(c + reach, minU, cu), v1 = cell(d + reach, minV, cv);
    return new Set(ranges.flatMap(([fu0, fv0, fu1, fv1], f) => (fu0 <= u1 && fu1 >= u0 && fv0 <= v1 && fv1 >= v0 ? [f] : [])));
  };
}

describe('the face grid gives a line the faces the grid of #779 gave it (Refs #557)', () => {
  it('neither loses nor gains a face a line can clip, slivers and edge-on faces included', () => {
    const rnd = random(557);
    const faces = projectMesh(mesh(600, rnd), plane);
    const grid = new FaceGrid(faces, REACH);
    const shipped = shippedGrid(faces, REACH);
    const clips = (f: number, ax: number, ay: number, dx: number, dy: number) =>
      faces[f * STRIDE + 9] === EDGE ? clipToEdge(faces, f * STRIDE, ax, ay, dx, dy, REACH) : clipToFace(faces, f * STRIDE, ax, ay, dx, dy, REACH);
    let compared = 0, slivered = 0;
    for (let k = 0; k < 400; k++) {
      const ax = rnd() * 10, ay = rnd() * 10;
      const dx = k % 3 === 0 ? 0 : (rnd() - 0.5) * 4, dy = k % 3 === 1 ? 0 : (rnd() - 0.5) * 4;
      const box = [Math.min(ax, ax + dx), Math.min(ay, ay + dy), Math.max(ax, ax + dx), Math.max(ay, ay + dy)] as const;
      const n = grid.query(...box);
      const found = Array.from(grid.found.subarray(0, n));
      expect(found, 'nearest first').toEqual([...found].sort((p, q) => p - q));
      const want = [...shipped(...box)].filter((f) => clips(f, ax, ay, dx, dy)).sort((p, q) => p - q);
      expect(found.filter((f) => clips(f, ax, ay, dx, dy))).toEqual(want);
      // How often a face the line clips was left out by #779's cells: the case a coarse grid alone would get wrong.
      for (let f = 0; f < faces.length / STRIDE; f++) if (clips(f, ax, ay, dx, dy) && !want.includes(f)) slivered++;
      compared += want.length;
    }
    expect(compared).toBeGreaterThan(1000);
    expect(slivered).toBeGreaterThan(0);
  });
});
