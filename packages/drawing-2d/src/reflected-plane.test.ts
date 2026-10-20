/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A reflected plane looks UP from its position but keeps the plan's x/y: what
 * is above the cut is drawn solid, what is below is not drawn, and a point
 * sits where it does in the plan below. A flipped plane also looks up but
 * mirrors x; that is exactly what `reflected` must not do.
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import type { Drawing2D, DrawingLine, SectionConfig } from './types.js';

const OPTS = { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: true } as const;

function box(expressId: number, ifcType: string, min: [number, number, number], max: [number, number, number]): MeshData {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { expressId, ifcType, modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [1, 1, 1, 1] };
}

// Viewer frame: y is up. The cut is the plane y = 1.2.
const WALL = 1, CEILING = 2, SLAB = 3;
const scene = () => [
  box(WALL, 'IfcWall', [-4, 0, -0.1], [4, 3, 0.1]),
  // Over the west side only (x -4..0), z 0.5..2: asymmetric in x.
  box(CEILING, 'IfcCovering', [-4, 2.7, 0.5], [0, 2.75, 2]),
  box(SLAB, 'IfcSlab', [-4, -0.2, -2], [4, 0, 2]),
];

function config(reflected: boolean, flipped = false): SectionConfig {
  return {
    plane: { axis: 'y', position: 1.2, flipped, ...(reflected ? { reflected: true } : {}) },
    projectionDepth: 10, projectionBelowDepth: 10, projectionAboveDepth: reflected ? 1e-3 : 10,
    clipProjectionBands: false, includeHiddenLines: true, creaseAngle: 30, scale: 100,
  };
}

async function draw(reflected: boolean, flipped = false): Promise<Drawing2D> {
  const g = new Drawing2DGenerator();
  await g.initialize();
  return g.generate(scene(), config(reflected, flipped), OPTS);
}

const of = (d: Drawing2D, id: number): DrawingLine[] => d.lines.filter((l) => l.entityId === id);
const xRange = (ls: DrawingLine[]) => ({
  min: Math.min(...ls.flatMap((l) => [l.line.start.x, l.line.end.x])),
  max: Math.max(...ls.flatMap((l) => [l.line.start.x, l.line.end.x])),
});

describe('reflected plane (reflected ceiling plan)', () => {
  it('draws the ceiling solid where the plan below draws it overhead (dashed)', async () => {
    const plan = of(await draw(false), CEILING);
    const rcp = of(await draw(true), CEILING);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((l) => l.visibility === 'hidden')).toBe(true);
    expect(rcp.length).toBeGreaterThan(0);
    expect(rcp.some((l) => l.visibility === 'visible')).toBe(true);
  });

  it('keeps the plan x/y: the west-side ceiling stays at x -4..0', async () => {
    const plan = xRange(of(await draw(false), CEILING));
    const rcp = xRange(of(await draw(true), CEILING));
    expect(rcp.min).toBeCloseTo(-4, 5);
    expect(rcp.max).toBeCloseTo(0, 5);
    expect(rcp).toEqual(plan);
  });

  it('a flipped plane mirrors x, which a reflected plane must not', async () => {
    const flipped = xRange(of(await draw(false, true), CEILING));
    expect(flipped.min).toBeCloseTo(0, 5);
    expect(flipped.max).toBeCloseTo(4, 5);
  });

  it('does not draw what is below the cut, and still cuts the wall', async () => {
    const rcp = await draw(true);
    expect(of(rcp, SLAB)).toEqual([]);
    expect(rcp.cutPolygons.some((p) => p.entityId === WALL)).toBe(true);
  });
});
