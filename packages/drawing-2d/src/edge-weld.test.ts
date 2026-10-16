/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A triangulated surface (terrain, a roof plane) whose triangles each carry
 * their own copy of every vertex must outline as its rim, not triangle by
 * triangle.
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { EdgeExtractor } from './edge-extractor.js';
import { Drawing2DGenerator } from './drawing-generator.js';
import type { SectionConfig } from './types.js';

const N = 4;
const height = (x: number, z: number): number => 0.04 * x * z;

/** An N x N grid of cells over x in [-6,-2], z in [-2,2], two triangles per cell, no shared vertices. */
function terrain(): MeshData {
  const pos: number[] = [];
  const pt = (i: number, j: number): void => { const x = -6 + i, z = -2 + j; pos.push(x, height(x, z), z); };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    pt(i, j); pt(i, j + 1); pt(i + 1, j + 1);
    pt(i, j); pt(i + 1, j + 1); pt(i + 1, j);
  }
  const positions = new Float32Array(pos);
  const indices = new Uint32Array(positions.length / 3).map((_, i) => i);
  return { expressId: 7, ifcType: 'IfcSite', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [0, 1, 0, 1] };
}

const RIM_EDGES = 4 * N;

describe('triangulated surfaces outline as their rim', () => {
  it('extractEdges treats repeated positions as one vertex', () => {
    const edges = new EdgeExtractor(30).extractEdges(terrain());
    expect(edges.length).toBe(RIM_EDGES);
    expect(edges.every((e) => e.type === 'boundary')).toBe(true);
  });

  it('a deep section draws the rim of terrain beyond the cut, not its triangles', async () => {
    const config: SectionConfig = {
      plane: {
        axis: 'x', position: 0, flipped: false,
        customPlane: { normal: { x: 1, y: 0, z: 0 }, distance: 0, origin: { x: 0, y: 0, z: 0 }, tangent: { x: 0, y: 0, z: -1 }, bitangent: { x: 0, y: 1, z: 0 } },
      },
      projectionDepth: 8, projectionBelowDepth: 8, projectionAboveDepth: 0,
      clipProjectionBands: true, includeHiddenLines: false, creaseAngle: 30, scale: 100,
    };
    const g = new Drawing2DGenerator();
    await g.initialize();
    const d = await g.generate([terrain()], config, { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: false });
    const n = d.lines.filter((l) => l.category === 'projection' && l.entityId === 7).length;
    // Rim edges, some split where terrain hides itself; unwelded this is 95.
    expect(n).toBeLessThan(2 * RIM_EDGES);
  });
});
