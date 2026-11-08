/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An outline line carries the depth of its element's own surface, not one
 * scalar for the whole element (FZK-Haus rafters, Refs #557). A rafter that
 * runs deep into the view under a roof slab is hidden by the slab; the slab,
 * sloped as steeply, is never hidden by itself.
 */

import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import { projectTo2D } from './math.js';
import type { DrawingLine, MeshOutline2D, SectionAxis, SectionConfig } from './types.js';

/**
 * A prism extruded along x from `x0` to `x1`, its four-point profile given as
 * `[y, z]` pairs in order around it. Seen along z (the elevation below) its
 * outline is a rectangle.
 */
function prism(expressId: number, ifcType: string, x0: number, x1: number, profile: Array<[number, number]>): MeshData {
  const p: number[] = [];
  for (const x of [x0, x1]) for (const [y, z] of profile) p.push(x, y, z);
  // 0-3 at x0, 4-7 at x1
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ]);
  const positions = new Float32Array(p);
  return { expressId, ifcType, modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [1, 1, 1, 1] };
}

/** The exact footprint of a mesh whose outline is its bounding rectangle, as the Rust `meshOutline2d` returns it. */
function boxOutline(mesh: MeshData, axis: SectionAxis, flipped: boolean): MeshOutline2D {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, axisMin = Infinity, axisMax = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const w = { x: mesh.positions[i], y: mesh.positions[i + 1], z: mesh.positions[i + 2] };
    const q = projectTo2D(w, axis, flipped);
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    axisMin = Math.min(axisMin, w[axis]); axisMax = Math.max(axisMax, w[axis]);
  }
  return { contours: [[minX, minY, maxX, minY, maxX, maxY, minX, maxY]], axisMin, axisMax };
}

const config: SectionConfig = {
  plane: { axis: 'z', position: 0, flipped: false },
  projectionDepth: 20,
  projectionBelowDepth: 20,
  projectionAboveDepth: 0.001,
  includeHiddenLines: true,
  creaseAngle: 30,
  scale: 100,
};

// The view looks along -z from z = 0. A rafter rises from the eave (z = -0.5,
// y = 0) to the ridge (z = -6, y = 3.3), 0.2 m deep; the roof slab lies on it,
// 0.3 m higher, 0.2 m thick, and 2 m wide, so from the front it covers the
// rafter everywhere but the rafter's tail under the eave.
const rafter = () => prism(1, 'IfcMember', 0, 0.08, [[0, -0.5], [3.3, -6], [3.5, -6], [0.2, -0.5]]);
const slab = () => prism(2, 'IfcSlab', -1, 1, [[0.3, -0.5], [3.6, -6], [3.8, -6], [0.5, -0.5]]);

const length = (lines: DrawingLine[]) => lines.reduce((n, l) => n + Math.hypot(l.line.end.x - l.line.start.x, l.line.end.y - l.line.start.y), 0);
const linesOf = (lines: DrawingLine[], id: number, visibility: 'visible' | 'hidden') =>
  lines.filter((l) => l.category === 'projection' && l.entityId === id && l.visibility === visibility);

async function draw(meshes: MeshData[]): Promise<DrawingLine[]> {
  const generator = new Drawing2DGenerator();
  await generator.initialize();
  const drawing = await generator.generate(meshes, config, {
    useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: true, outlineProvider: boxOutline,
  });
  return drawing.lines;
}

describe('outline lines take the depth of their own surface (FZK rafters, Refs #557)', () => {
  it('hides a rafter under the roof slab in front of it, all but its tail under the eave', async () => {
    const lines = await draw([rafter(), slab()]);
    const visible = length(linesOf(lines, 1, 'visible'));
    const hidden = length(linesOf(lines, 1, 'hidden'));
    // The rafter's outline is 2 x 3.5 m + 2 x 0.08 m. Only its tail below the slab's eave (y 0 to 0.3) is in front.
    expect(visible + hidden, 'the rafter is drawn').toBeGreaterThan(7);
    expect(hidden, 'hidden behind the slab').toBeGreaterThan(6);
    expect(visible, 'visible: the tail under the eave').toBeLessThan(1);
  });

  it('never hides a sloped element by itself: the slab and a lone rafter stay whole', async () => {
    const withSlab = await draw([rafter(), slab()]);
    expect(length(linesOf(withSlab, 2, 'hidden')), 'nothing of the slab hidden').toBe(0);
    expect(length(linesOf(withSlab, 2, 'visible'))).toBeCloseTo(2 * 3.5 + 2 * 2, 3);

    const alone = await draw([rafter()]);
    expect(length(linesOf(alone, 1, 'hidden')), 'nothing of a lone rafter hidden').toBe(0);
    expect(length(linesOf(alone, 1, 'visible'))).toBeCloseTo(2 * 3.5 + 2 * 0.08, 3);
  });
});
