/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The outline of a curved surface in a section takes its element's own surface depth (#557), so a round column is not
 * hidden by itself. That depth must come from the faces that form the line, never from a distant part of the same mesh:
 * a ring wall (a round tank) seen from its side has an inner outline behind its own front wall, and that wall hides it.
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import type { DrawingLine, SectionConfig } from './types.js';

const SIDES = 32;
const HEIGHT = 3;

/** A closed ring wall round the vertical (y) axis at x = -5, z = 0: outer radius 2, inner 1.8, outward-wound. */
function ringWall(outer = 2, inner = 1.8): MeshData {
  const pos: number[] = [];
  // Rows: 0 outer bottom, 1 outer top, 2 inner bottom, 3 inner top.
  for (const [r, y] of [[outer, 0], [outer, HEIGHT], [inner, 0], [inner, HEIGHT]]) {
    for (let k = 0; k < SIDES; k++) {
      const a = (2 * Math.PI * k) / SIDES;
      pos.push(-5 + r * Math.cos(a), y, r * Math.sin(a));
    }
  }
  const at = (row: number, k: number) => row * SIDES + (k % SIDES);
  const idx: number[] = [];
  for (let k = 0; k < SIDES; k++) {
    const n = k + 1;
    idx.push(at(0, k), at(1, k), at(1, n), at(0, k), at(1, n), at(0, n)); // outer side, facing out
    idx.push(at(2, k), at(2, n), at(3, n), at(2, k), at(3, n), at(3, k)); // inner side, facing the axis
    idx.push(at(1, k), at(3, k), at(3, n), at(1, k), at(3, n), at(1, n)); // top, facing up
    idx.push(at(0, k), at(2, n), at(2, k), at(0, k), at(0, n), at(2, n)); // bottom, facing down
  }
  return {
    expressId: 9, ifcType: 'IfcWall', modelIndex: 0,
    positions: new Float32Array(pos), normals: new Float32Array(pos.length), indices: new Uint32Array(idx), color: [1, 1, 1, 1],
  };
}

/** A section at x = 0 looking toward -x: the ring lies wholly beyond the cut, u = -z, v = y. */
async function section(mesh: MeshData): Promise<DrawingLine[]> {
  const config: SectionConfig = {
    plane: {
      axis: 'x', position: 0, flipped: false,
      customPlane: { normal: { x: 1, y: 0, z: 0 }, distance: 0, origin: { x: 0, y: 0, z: 0 }, tangent: { x: 0, y: 0, z: -1 }, bitangent: { x: 0, y: 1, z: 0 } },
    },
    projectionDepth: 10, projectionBelowDepth: 10, projectionAboveDepth: 0,
    clipProjectionBands: true, includeHiddenLines: true, creaseAngle: 30, scale: 100,
  };
  const g = new Drawing2DGenerator();
  await g.initialize();
  const d = await g.generate([mesh], config, { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: true });
  return d.lines.filter((l) => l.category === 'projection' && l.entityId === 9);
}

/** Total visible and hidden length of the vertical lines at u = `u`. */
function verticalAt(lines: DrawingLine[], u: number): { visible: number; hidden: number } {
  const out = { visible: 0, hidden: 0 };
  for (const l of lines) {
    const { start, end } = l.line;
    if (Math.abs(start.x - end.x) > 1e-3 || Math.abs(start.x - u) > 0.01) continue;
    out[l.visibility === 'visible' ? 'visible' : 'hidden'] += Math.abs(end.y - start.y);
  }
  return out;
}

describe('own surface depth of a curved outline (#557)', () => {
  it('draws a ring wall seen from its side with its outer outline visible and its inner outline hidden by its own front', async () => {
    const lines = await section(ringWall());
    for (const u of [-2, 2]) expect(verticalAt(lines, u).visible, `outer outline at u ${u}`).toBeGreaterThan(0.9 * HEIGHT);
    for (const u of [-1.8, 1.8]) {
      const at = verticalAt(lines, u);
      expect(at.hidden, `inner outline at u ${u} is drawn hidden`).toBeGreaterThan(0.9 * HEIGHT);
      expect(at.visible, `inner outline at u ${u} is not visible through 0.87 m of wall`).toBeLessThan(0.05 * HEIGHT);
    }
  });
});
