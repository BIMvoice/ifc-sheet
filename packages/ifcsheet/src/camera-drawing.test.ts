/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557 drew the outline of curved surfaces (a handrail, a round column) along their smooth edges, with their element's
 * own surface depth, in sections, plans and elevations only. A view from a camera keeps the line work it had: the
 * 3D-view PDF calls `generateCameraDrawing` with no edge tolerance, as a section does, and still must not get it.
 */

import { describe, expect, it } from 'vitest';
import type { DrawingLine } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { generateCameraDrawing } from './camera-drawing.js';

/** A closed 32-sided tube along x, radius 0.04 and 2 long, outward-wound: a handrail. */
function handrail(sides = 32, r = 0.04, length = 2): MeshData {
  const pos: number[] = [];
  for (const x of [-length / 2, length / 2]) for (let k = 0; k < sides; k++) {
    const a = (2 * Math.PI * k) / sides;
    pos.push(x, r * Math.cos(a), r * Math.sin(a));
  }
  pos.push(-length / 2, 0, 0, length / 2, 0, 0);
  const c0 = 2 * sides, c1 = c0 + 1;
  const idx: number[] = [];
  for (let k = 0; k < sides; k++) {
    const n = (k + 1) % sides;
    idx.push(k, n, sides + n, k, sides + n, sides + k);
    idx.push(c0, n, k, c1, sides + k, sides + n);
  }
  return {
    expressId: 7, ifcType: 'IfcRailing', modelIndex: 0,
    positions: new Float32Array(pos), normals: new Float32Array(pos.length), indices: new Uint32Array(idx), color: [1, 1, 1, 1],
  };
}

const length = (l: DrawingLine) => Math.hypot(l.line.end.x - l.line.start.x, l.line.end.y - l.line.start.y);

describe('a camera view keeps its line work for curved surfaces (#557)', () => {
  it('draws a handrail seen from its side, as the 3D-view PDF calls it, without lines along its smooth edges', async () => {
    const { drawing } = await generateCameraDrawing({
      meshes: [handrail()],
      camera: { position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
      scaleFactor: 100,
    });
    const lines = drawing.lines.filter((l) => l.entityId === 7 && l.category === 'projection');
    const span = Math.max(drawing.bounds.max.x - drawing.bounds.min.x, drawing.bounds.max.y - drawing.bounds.min.y);
    expect(lines.length).toBeGreaterThan(0); // its end caps
    expect(lines.filter((l) => length(l) > 0.5 * span)).toHaveLength(0);
  });
});
