/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A terrain with millimetres of noise, seen level in a section, outlines as its rim, as it did before curved outlines
 * (#557, review round 2): its faces turn by under a degree, and every such fold drew a line through it (40 lines
 * became 109 to 138).
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import type { SectionConfig } from './types.js';

/** A 10 x 10 TIN of 0.5 m cells, level but for heights jittered by up to `jitter` (a fixed random sequence per seed), facing up. */
function tin(jitter: number, seed: number): MeshData {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const N = 10, cell = 0.5, pos: number[] = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) pos.push(-7.5 + i * cell, (2 * rnd() - 1) * jitter, -2.5 + j * cell);
  const at = (i: number, j: number) => i * (N + 1) + j;
  const idx: number[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
  return { expressId: 5, ifcType: 'IfcGeographicElement', modelIndex: 0, positions: new Float32Array(pos), normals: new Float32Array(pos.length), indices: new Uint32Array(idx), color: [1, 1, 1, 1] };
}

describe('a noisy level terrain outlines as its rim (#557)', () => {
  it('draws no more lines than before curved outlines (40) with heights jittered by 0.5 or 2 mm', async () => {
    const config: SectionConfig = {
      plane: { axis: 'x', position: 0, flipped: false, customPlane: { normal: { x: 1, y: 0, z: 0 }, distance: 0, origin: { x: 0, y: 0, z: 0 }, tangent: { x: 0, y: 0, z: -1 }, bitangent: { x: 0, y: 1, z: 0 } } },
      projectionDepth: 10, projectionBelowDepth: 10, projectionAboveDepth: 0,
      clipProjectionBands: true, includeHiddenLines: true, creaseAngle: 30, scale: 100,
    };
    for (const jitter of [0.0005, 0.002]) for (const seed of [1, 2, 3]) {
      const g = new Drawing2DGenerator();
      await g.initialize();
      const d = await g.generate([tin(jitter, seed)], config, { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: true });
      const n = d.lines.filter((l) => l.category === 'projection' && l.entityId === 5).length;
      expect(n, `jitter ${jitter * 1000} mm, seed ${seed}`).toBeLessThanOrEqual(40);
    }
  });
});
