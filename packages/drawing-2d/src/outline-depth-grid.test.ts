/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The depth an outline line takes from its own surface (#779) counts a face
 * only within one raster pixel of it, and so does not depend on how the face
 * grid lays out its cells (Refs #557). `clipToFace` grows a triangle by moving
 * its edges out by `reach`, and a sliver's grown tip then reached
 * `reach / sin(half its angle)` past its real tip: metres for a thin face. The
 * grid files a face under its box grown by `reach`, so whether a line out
 * there met the sliver depended on whether its cell held it: an element of up
 * to 64 faces has one cell and it did, one face more and it did not.
 */

import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { outlineLinesWithDepth, refineOutlineDepths } from './outline-depth.js';
import type { Bounds2D, DrawingLine, SectionPlaneConfig } from './types.js';

// The view looks along -z from z = 0, so a point at z = -d is at depth d, and (x, y) is where it is drawn.
const plane: SectionPlaneConfig = { axis: 'z', position: 0, flipped: false };
// 10.23 m across: one raster pixel of 1024 is 1 cm, the `reach` a face counts within.
const bounds: Bounds2D = { min: { x: 0, y: 0 }, max: { x: 10.23, y: 10.23 } };
const REACH = 0.01;

/**
 * One element: a square at depth 2 under everything, a sliver at depth 1 from x = 0 to its tip at (4, 5), 2 cm wide
 * at its base, and `fillers` tiny triangles at depth 3 in the far corner, which touch nothing the test looks at.
 */
function element(fillers: number): MeshData {
  const p: number[] = [0, 0, -2, 10, 0, -2, 10, 10, -2, 0, 10, -2, 0, 4.99, -1, 0, 5.01, -1, 4, 5, -1];
  const idx: number[] = [0, 1, 2, 0, 2, 3, 4, 5, 6];
  for (let i = 0; i < fillers; i++) {
    const x = 9 + (i % 10) * 0.05, y = 9 + Math.floor(i / 10) * 0.05, k = p.length / 3;
    p.push(x, y, -3, x + 0.01, y, -3, x, y + 0.01, -3);
    idx.push(k, k + 1, k + 2);
  }
  const positions = new Float32Array(p);
  return { expressId: 1, ifcType: 'IfcMember', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices: new Uint32Array(idx), color: [1, 1, 1, 1] };
}

/** The pieces of the outline line from (`x`, 4) to (`x`, 6) of `mesh`, with the depth of its own surface. */
function lineAt(mesh: MeshData, x: number): DrawingLine[] {
  const outline = { contours: [[x, 4, x, 6, x + 1, 5]], axisMin: -3, axisMax: -1 };
  const lines = outlineLinesWithDepth(outline, { entityId: 1, ifcType: 'IfcMember', modelIndex: 0 }, plane, { below: 20, above: 0.001 }, mesh);
  return refineOutlineDepths(lines, bounds).filter((l) => l.line.start.x === x && l.line.end.x === x);
}

const nearest = (pieces: DrawingLine[]) => Math.min(...pieces.flatMap((l) => [l.depth, l.depthEnd ?? l.depth]));

describe("a face counts within one raster pixel of itself, whatever the grid's cells (Refs #557)", () => {
  it("a line 2 m past a sliver's tip takes the square behind it, with one grid cell or many", () => {
    for (const fillers of [0, 100]) {
      const pieces = lineAt(element(fillers), 6);
      expect(pieces.length).toBeGreaterThan(0);
      expect(nearest(pieces), `${fillers} fillers`).toBeCloseTo(2, 9);
    }
  });

  it("a line within a pixel of the sliver's tip still takes the sliver's depth there, so it is never hidden by itself", () => {
    for (const fillers of [0, 100]) {
      const pieces = lineAt(element(fillers), 4 + REACH / 2);
      expect(nearest(pieces), `${fillers} fillers`).toBeCloseTo(1, 9);
      // Only near the tip: the line's ends are a metre away from it and lie on the square.
      const ends = pieces.filter((l) => l.line.start.y === 4 || l.line.end.y === 6);
      for (const end of ends) expect(Math.max(end.depth, end.depthEnd ?? end.depth)).toBeCloseTo(2, 9);
    }
  });
});
