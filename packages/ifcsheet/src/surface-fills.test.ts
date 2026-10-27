/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { surfaceColourOf, surfaceFills } from './surface-fills.js';

/** A square of side 1 in the plane z = `z`, as two triangles; the south elevation looks along -z from z = 10. */
function quad(expressId: number, z: number, color: [number, number, number, number], ifcType = 'IfcWall', x = 0): MeshData {
  return {
    expressId, ifcType, color,
    positions: new Float32Array([x, 0, z, x + 1, 0, z, x + 1, 1, z, x, 1, z]),
    normals: new Float32Array(12), indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  } as unknown as MeshData;
}

const south = () => createSectionConfig('z', 10, { projectionDepth: 20, includeHiddenLines: false });

describe('the surfaces of a coloured elevation (#499)', () => {
  it('fills each face with the mesh colour, far to near', () => {
    const near = quad(1, 9, [1, 0, 0, 1]);
    const far = quad(2, 2, [0, 0, 1, 1]);
    // Listed near first: the order of the answer is the depth's, not the model's.
    const fills = surfaceFills([near, far], south());
    expect(fills.map((f) => f.surfaceColour)).toEqual(['#0000ff', '#0000ff', '#ff0000', '#ff0000']);
    expect(fills.map((f) => f.entityId)).toEqual([2, 2, 1, 1]);
  });

  it('winds every triangle the same way, so one non-zero path of them cannot cancel itself', () => {
    const flipped = quad(1, 9, [1, 0, 0, 1]);
    flipped.indices = new Uint32Array([0, 2, 1, 0, 3, 2]);
    for (const mesh of [quad(1, 9, [1, 0, 0, 1]), flipped]) {
      for (const f of surfaceFills([mesh], south())) {
        const [a, b, c] = f.polygon.outer;
        expect((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)).toBeGreaterThan(0);
      }
    }
  });

  it('leaves out what the view hides, spaces and openings, and what lies outside the depth', () => {
    const wall = quad(1, 9, [1, 0, 0, 1]);
    const space = quad(2, 8, [0, 1, 0, 1], 'IfcSpace');
    const behind = quad(3, -50, [0, 0, 1, 1]);
    const hidden = quad(4, 7, [1, 1, 0, 1], 'IfcDoor');
    const fills = surfaceFills([wall, space, behind, hidden], south(), (_id, type) => type !== 'IfcDoor');
    expect([...new Set(fills.map((f) => f.entityId))]).toEqual([1]);
  });

  it('draws nothing for a view with no depth, and glass as the paper shows it', () => {
    expect(surfaceFills([quad(1, 9, [1, 0, 0, 1])], createSectionConfig('y', 1, { projectionDepth: 0, includeHiddenLines: false }))).toEqual([]);
    expect(surfaceColourOf([0, 0, 0, 0.5])).toBe('#808080');
    expect(surfaceColourOf([0, 0, 0, 0.01])).toBeNull();
    expect(surfaceColourOf([0.2, 0.4, 0.6, 1])).toBe('#336699');
  });
});
