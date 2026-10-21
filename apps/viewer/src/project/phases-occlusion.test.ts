/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A phase a view does not show must not hide what is behind it (#93): the filter is on the
 * generator's INPUT, because hidden-line removal runs inside the generator. A near wall to
 * demolish stands in front of a far one; the proposed view must see the far one in full.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from '@ifc-lite/drawing-2d';
import { phaseHiddenIds } from './phase-view.js';
import type { PhaseView } from './view-graphics.js';

const FAR = 1, NEAR = 2;

function box(expressId: number, min: [number, number, number], max: [number, number, number]): MeshData {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { expressId, ifcType: 'IfcWall', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [1, 1, 1, 1] };
}

/** A plan down the z axis cut at 0; the far box lies fully inside the footprint of the nearer, larger one. */
async function seen(hidden: ReadonlySet<number> | null): Promise<number> {
  const meshes = [box(FAR, [0, 0, -11], [10, 10, -9]), box(NEAR, [-5, -5, -3], [15, 15, -1])].filter((m) => !hidden?.has(m.expressId));
  const generator = new Drawing2DGenerator();
  await generator.initialize();
  const drawing = await generator.generate(meshes, {
    plane: { axis: 'z', position: 0, flipped: false }, projectionDepth: 20, projectionBelowDepth: 20, projectionAboveDepth: 0.001,
    includeHiddenLines: true, creaseAngle: 30, scale: 100,
  }, { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: true });
  return drawing.lines.filter((l) => l.entityId === FAR && l.category === 'projection' && l.visibility === 'visible').length;
}

const proposed: PhaseView = { show: new Set(['existing', 'new']), phaseOf: (id) => (id === NEAR ? 'demolish' : 'existing') };

describe('a phase the view does not show', () => {
  it('hides what is behind it unless it is left out of the generator input', async () => {
    const meshes = [box(FAR, [0, 0, 0], [1, 1, 1]), box(NEAR, [0, 0, 0], [1, 1, 1])];
    assert.equal(await seen(null), 0, 'the demolished wall occludes the far one when generation sees it');
    assert.deepEqual([...phaseHiddenIds(meshes, proposed)!], [NEAR]);
    assert.ok((await seen(phaseHiddenIds(meshes, proposed))) > 0, 'the proposed view sees the far wall in full');
  });
});
