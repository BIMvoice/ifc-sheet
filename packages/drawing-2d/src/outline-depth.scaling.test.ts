/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The depth of a long outline over a finely meshed element costs in proportion to the faces it meets, not their square
 * (#863).
 *
 * `refineOutlineDepths` gives an outline line the depth of its own element's surface: it collects the faces within a
 * raster pixel of the line, breaks the line where each starts and ends, and reads the depth at each break. It read every
 * face at every break, and then thinned the breaks by testing each longer chord against every break it skipped, both
 * quadratic in the faces along the line. A facade element meshed in thousands of strips, seen in an elevation, has
 * outlines along all of them; on skolebygg the depth of outlines was 28 s of a 47 s elevation, the largest part of it.
 * Now the faces are swept in order and the chords checked against running bounds. The time is compared within the test,
 * best of three: sixteen times the faces took 104 times as long before and 14 times now (measured), and the bound is 48.
 */

import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { outlineLinesWithDepth, refineOutlineDepths } from './outline-depth.js';
import type { Bounds2D, DrawingLine, SectionPlaneConfig } from './types.js';

const PLANE: SectionPlaneConfig = { axis: 'z', position: 0, flipped: false };
const LENGTH = 40;
const HEIGHT = 3;

/** A facade panel 40 m long and 3 m high at z = -2, facing the view, meshed in `strips` vertical strips. */
function panel(strips: number): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= strips; i++) {
    const x = (LENGTH * i) / strips;
    positions.push(x, 0, -2, x, HEIGHT, -2);
    if (i < strips) {
      const a = 2 * i;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  return { expressId: 1, ifcType: 'IfcCurtainWall', modelIndex: 0, positions: new Float32Array(positions), normals: new Float32Array(positions.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] };
}

const BOUNDS: Bounds2D = { min: { x: 0, y: 0 }, max: { x: LENGTH, y: HEIGHT } };

/** The panel's outline, its four sides, carrying the panel for their own surface depth. */
function outline(mesh: MeshData): DrawingLine[] {
  const contours = [[0, 0, LENGTH, 0, LENGTH, HEIGHT, 0, HEIGHT]];
  return outlineLinesWithDepth({ contours, axisMin: -2, axisMax: -2 }, { entityId: 1, ifcType: 'IfcCurtainWall', modelIndex: 0 }, PLANE, { below: 10, above: 0.001 }, mesh);
}

/** The best of three runs: a single run on a shared runner can be slowed by anything. */
function timed(strips: number): { ms: number; lines: DrawingLine[] } {
  let ms = Infinity;
  let lines: DrawingLine[] = [];
  for (let run = 0; run < 3; run++) {
    const input = outline(panel(strips)); // a fresh mesh: its projected faces are built once per mesh, inside the timing
    const t = performance.now();
    lines = refineOutlineDepths(input, BOUNDS);
    ms = Math.min(ms, performance.now() - t);
  }
  return { ms, lines };
}

describe('the depth of an outline over a finely meshed element (#863)', () => {
  it('sixteen times the faces along an outline does not cost sixteen squared', () => {
    const few = timed(1_000);
    const many = timed(16_000);
    // The panel is flat and faces the view: every side keeps its one depth, 2 m, in one piece.
    for (const { lines } of [few, many]) {
      expect(lines).toHaveLength(4);
      for (const l of lines) {
        expect(l.depth).toBeCloseTo(2, 3);
        expect(l.depthEnd ?? l.depth).toBeCloseTo(2, 3);
      }
    }
    expect(many.ms / Math.max(few.ms, 1)).toBeLessThan(48);
  }, 120_000);
});
