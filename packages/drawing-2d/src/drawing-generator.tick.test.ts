/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `generate()` says it is at work from inside its stages (#863).
 *
 * Progress is reported only at the start and end of a stage, and one stage of
 * a large model ran for tens of seconds; the viewer's drawing worker took the
 * silence for death. `onTick` is called inside every stage's loop (per mesh
 * cut, per element whose polygons are built, per mesh outlined and
 * rasterized, per line classified, per group of lines merged), so a caller
 * hears from the generator while each stage runs, not only between stages.
 */

import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import type { SectionConfig } from './types.js';

function box(expressId: number, min: [number, number, number], max: [number, number, number]): MeshData {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return {
    expressId,
    ifcType: 'IfcWall',
    modelIndex: 0,
    positions: new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]),
    normals: new Float32Array(24),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]),
    color: [1, 1, 1, 1],
  };
}

const config: SectionConfig = {
  plane: { axis: 'z', position: 0, flipped: false },
  projectionDepth: 20, projectionBelowDepth: 20, projectionAboveDepth: 0.001,
  includeHiddenLines: true, creaseAngle: 30, scale: 100,
};

describe('generate() calls onTick inside its stages (#863)', () => {
  it('every stage that runs hears from the generator while it runs, at least once per mesh where it works mesh by mesh', async () => {
    // Walls through the cut, and boxes below it that project and occlude.
    const meshes = [
      ...Array.from({ length: 6 }, (_, i) => box(i + 1, [i * 3, 0, -2], [i * 3 + 2, 2, 2])),
      ...Array.from({ length: 6 }, (_, i) => box(i + 11, [i * 3, 5, -6], [i * 3 + 2, 7, -4])),
    ];
    const ticksIn = new Map<string, number>();
    let stage = 'before';
    const generator = new Drawing2DGenerator();
    await generator.initialize();
    const drawing = await generator.generate(meshes, config, {
      useGPU: false, includeProjection: true, includeEdges: true, includeHiddenLines: true, mergeLines: true,
      onProgress: (name, progress) => { stage = progress === 0 ? name : `after ${name}`; },
      onTick: () => { ticksIn.set(stage, (ticksIn.get(stage) ?? 0) + 1); },
    });
    expect(drawing.lines.length).toBeGreaterThan(0);
    // Cutting walks every mesh; projection and the hidden-line raster walk every mesh again.
    expect(ticksIn.get('cutting') ?? 0).toBeGreaterThanOrEqual(meshes.length);
    expect(ticksIn.get('polygons') ?? 0).toBeGreaterThan(0);
    expect(ticksIn.get('edges') ?? 0).toBeGreaterThanOrEqual(6);
    expect(ticksIn.get('hidden') ?? 0).toBeGreaterThanOrEqual(meshes.length);
    expect(ticksIn.get('merging') ?? 0).toBeGreaterThan(0);
  });
});
