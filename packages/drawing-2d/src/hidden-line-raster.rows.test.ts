/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The raster tests only the pixels of each row near the triangle, not its whole bounding box (#863: one mesh of long
 * slivers took 103 s). The invariant: it fills exactly the pixels the whole-box scan fills, slivers included.
 */

import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { buildDepthRaster } from './hidden-line-raster.js';
import { barycentricCoords } from './raster-core.js';
import type { Bounds2D, SectionPlaneConfig } from './types.js';

const plane: SectionPlaneConfig = { axis: 'z', position: 0, flipped: false };
const bounds: Bounds2D = { min: { x: -1, y: -1 }, max: { x: 41, y: 21 } };

/** The whole-box scan of one triangle in pixel coordinates, as the raster did it before. */
function boxScan(buffer: Float32Array, width: number, height: number, p: { x: number; y: number; depth: number }[]): void {
  const [a, b, c] = p;
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const span = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y), Math.hypot(c.x - b.x, c.y - b.y));
  if (Math.abs(cross) <= 1e-6 * span * span) return;
  for (let py = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); py <= Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y))); py++) {
    for (let px = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); px <= Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x))); px++) {
      const w = barycentricCoords(px + 0.5, py + 0.5, a, b, c);
      if (!(w.u >= 0 && w.v >= 0 && w.w >= 0)) continue;
      const depth = w.u * a.depth + w.v * b.depth + w.w * c.depth;
      if (depth >= -0.001 && depth < buffer[py * width + px]) buffer[py * width + px] = depth;
    }
  }
}

describe('the hidden-line raster fills each row near its triangle only (#863)', () => {
  it('fills the same pixels as a scan of every triangle\'s whole box, for slivers and ordinary triangles', () => {
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const n = 300;
    const positions = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const x0 = rnd() * 40, y0 = rnd() * 20, z = -0.5 - rnd() * 5, kind = i % 3;
      const tri = kind === 0
        ? [x0, y0, z, rnd() * 40, rnd() * 20, z - rnd(), x0 + (rnd() - 0.5) * 0.05, y0 + (rnd() - 0.5) * 0.05, z]
        : kind === 1 ? [x0, y0, z, 40 - x0, 20 - y0, z - 0.3, 40 - x0 + 1e-3, 20 - y0 - 3e-3, z + 0.1]
          : [x0, y0, z, x0 + rnd() * 5, y0 + rnd() * 5, z - rnd(), x0 + rnd() * 5, y0 - rnd() * 5, z + rnd() * 0.4];
      positions.set(tri, i * 9);
    }
    const mesh: MeshData = { expressId: 1, ifcType: 'IfcMember', modelIndex: 0, positions, normals: new Float32Array(n * 9), indices: new Uint32Array(n * 3).map((_, i) => i), color: [1, 1, 1, 1] };
    const raster = buildDepthRaster([mesh], plane, 10, 512, 0.001, bounds);
    expect(raster).not.toBeNull();
    const { width, height } = raster!;
    const expected = new Float32Array(width * height).fill(Infinity);
    const px = (x: number) => ((x - bounds.min.x) / (bounds.max.x - bounds.min.x)) * (width - 1);
    const py = (y: number) => ((y - bounds.min.y) / (bounds.max.y - bounds.min.y)) * (height - 1);
    for (let i = 0; i < n; i++) {
      const corner = (k: number) => ({ x: px(positions[i * 9 + k * 3]), y: py(positions[i * 9 + k * 3 + 1]), depth: -positions[i * 9 + k * 3 + 2] });
      boxScan(expected, width, height, [corner(0), corner(1), corner(2)]);
    }
    let filled = 0, differ = 0;
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== Infinity) filled++;
      if (expected[i] !== raster!.buffer[i]) differ++;
    }
    expect(filled).toBeGreaterThan(1000);
    expect(differ).toBe(0);
  });
});
