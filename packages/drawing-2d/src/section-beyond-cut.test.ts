/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A section made from a line on a plan (a custom, vertical plane with bounded
 * projection bands, exactly as the viewer configures it) must draw what lies
 * BEYOND the cut, to the chosen depth, and nothing in front of it.
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import type { DrawingLine, SectionConfig } from './types.js';

const OPTS = { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: false } as const;

function box(expressId: number, min: [number, number, number], max: [number, number, number]): MeshData {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { expressId, ifcType: 'IfcWall', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [1, 1, 1, 1] };
}

// Section plane x = 0, looking toward -x (unflipped). Cut wall straddles x = 0;
// BEHIND wall at x in [-2.2,-2]; FRONT wall at x in [2,2.2].
const CUT = 1, BEHIND = 2, FRONT = 3;
const scene = () => [box(CUT, [-0.1, 0, -2], [0.1, 3, 2]), box(BEHIND, [-2.2, 0, -2], [-2, 3, 2]), box(FRONT, [2, 0, -2], [2.2, 3, 2])];

function config(depth: number, flipped: boolean): SectionConfig {
  return {
    plane: {
      axis: 'x', position: 0, flipped,
      customPlane: {
        normal: { x: 1, y: 0, z: 0 }, distance: 0, origin: { x: 0, y: 1.5, z: 0 },
        tangent: { x: 0, y: 0, z: -1 }, bitangent: { x: 0, y: 1, z: 0 },
      },
    },
    projectionDepth: depth, projectionBelowDepth: depth, projectionAboveDepth: 0,
    clipProjectionBands: true, includeHiddenLines: false, creaseAngle: 30, scale: 100,
  };
}

async function ids(depth: number, flipped = false): Promise<Set<number>> {
  const g = new Drawing2DGenerator();
  await g.initialize();
  const d = await g.generate(scene(), config(depth, flipped), OPTS);
  return new Set(d.lines.filter((l: DrawingLine) => l.category === 'projection').map((l) => l.entityId));
}

describe('section from a plan line shows what lies beyond the cut', () => {
  it('draws the wall behind the cut at a depth that reaches it', async () => {
    expect((await ids(3)).has(BEHIND)).toBe(true);
  });
  it('leaves out the wall behind at a depth that stops short of it', async () => {
    expect((await ids(0.5)).has(BEHIND)).toBe(false);
  });
  it('never draws what is in front of the cut', async () => {
    expect((await ids(8)).has(FRONT)).toBe(false);
  });
  it('a flipped section looks the other way', async () => {
    const f = await ids(3, true);
    expect(f.has(FRONT)).toBe(true);
    expect(f.has(BEHIND)).toBe(false);
  });
});
