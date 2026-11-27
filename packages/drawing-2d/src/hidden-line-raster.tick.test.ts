/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hidden-line raster says it is at work inside one mesh, not only between meshes (#863).
 *
 * A triangle is rasterized by scanning its bounding box, so a long sliver across a whole elevation costs most of the
 * raster, and one mesh of a few thousand of them (a 20,000-vertex mesh, the largest of the model in #863) was one call
 * with no tick for as long as it took. The invariant: within one mesh, at most 64 triangles pass between two ticks.
 */

import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { buildDepthRaster } from './hidden-line-raster.js';
import type { SectionPlaneConfig } from './types.js';

/** `n` long thin triangles from one corner of a 40 m by 20 m facade to the other, each a little behind the last. */
function slivers(n: number): MeshData {
  const positions = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const z = -1 - i * 1e-3;
    positions.set([0, 0, z, 40, 20, z, 40, 20.05, z], i * 9);
  }
  const indices = new Uint32Array(n * 3).map((_, i) => i);
  return { expressId: 1, ifcType: 'IfcRailing', modelIndex: 0, positions, normals: new Float32Array(n * 9), indices, color: [1, 1, 1, 1] };
}

const plane: SectionPlaneConfig = { axis: 'z', position: 0, flipped: false };

describe('buildDepthRaster ticks within one mesh (#863)', () => {
  it('calls tick at least once per 64 triangles of a single mesh', () => {
    const triangles = 640;
    let ticks = 0;
    const raster = buildDepthRaster([slivers(triangles)], plane, 10, 256, 0.001, { min: { x: -1, y: -1 }, max: { x: 41, y: 21 } }, () => { ticks++; });
    expect(raster).not.toBeNull();
    // One tick before the mesh, and one per 64 triangles inside it.
    expect(ticks).toBeGreaterThanOrEqual(1 + triangles / 64);
  });
});
