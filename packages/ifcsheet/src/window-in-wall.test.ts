/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #651: a mesh-only window on a plan sits in its wall. Its mesh is a box about as deep as it is wide that reaches out past the wall's
 * outer face; drawn on that footprint the window stuck out of the wall and its glazing lines ran across it. The symbol is aligned to
 * the host wall and fitted to its thickness (`window-in-wall.ts`).
 */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { hostWallMeshes } from './opening-in-wall.js';
import { openingSymbols, symbolShapes } from './opening-symbols.js';
import type { DraftShape, Pt } from './draft-types.js';

const plane: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };

function box(expressId: number, ifcType: string, [x0, x1]: [number, number], [z0, z1]: [number, number], height: number, extraX: number[] = []): MeshData {
  const positions: number[] = [];
  for (const x of [x0, ...extraX, x1]) for (const z of [z0, z1]) for (const y of [0, height]) positions.push(x, y, z);
  return { expressId, ifcType, positions: new Float32Array(positions), indices: new Uint32Array(0), normals: new Float32Array(0), color: [1, 1, 1, 1] } as unknown as MeshData;
}

const points = (s: DraftShape): Pt[] => (s.type === 'polyline' ? s.pts : s.type === 'line' ? [s.a, s.b] : []);

describe('a mesh-only window in a wall it reaches out of (#651, stated invariant)', () => {
  // A 0.3 m wall (z -0.3 to 0) with a 0.5 m void from x 1.75 to 2.25; the window's mesh is a 0.5 m square box that reaches 0.25 m past
  // the outer face (z -0.55 to -0.05), so the footprint has no long side.
  const wall = box(1, 'IfcWall', [0, 4], [-0.3, 0], 3, [1.75, 2.25]);
  const window = box(2, 'IfcWindow', [1.75, 2.25], [-0.55, -0.05], 1.2);
  const host = hostWallMeshes([wall, window], (id) => (id === 2 ? 1 : undefined));
  const [symbol] = openingSymbols([window], plane, () => 0, () => null, () => null, () => false, host);
  const lines = symbol.shapes.filter((s) => s.type === 'line');

  it('stays within the wall band, its outer face where the wall has one', () => {
    const zs = symbolShapes(symbol).flatMap(points).map((p) => p.y);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-0.3 - 1e-4);
    expect(Math.max(...zs)).toBeLessThanOrEqual(1e-4);
    const xs = symbolShapes(symbol).flatMap(points).map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(1.75, 3);
    expect(Math.max(...xs)).toBeCloseTo(2.25, 3);
  });

  it('draws the glazing as lines along the wall, across the full width, inside the wall', () => {
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      if (line.type !== 'line') continue;
      expect(Math.abs(line.a.y - line.b.y), 'a glazing line runs across the wall').toBeLessThan(1e-6);
      expect(Math.abs(line.b.x - line.a.x)).toBeCloseTo(0.5, 3);
      expect(line.a.y).toBeGreaterThan(-0.3);
      expect(line.a.y).toBeLessThan(0);
    }
  });

  it('leaves a window with no host wall as its footprint', () => {
    const [free] = openingSymbols([window], plane);
    const zs = symbolShapes(free).flatMap(points).map((p) => p.y);
    expect(Math.min(...zs)).toBeCloseTo(-0.55, 3);
  });
});
