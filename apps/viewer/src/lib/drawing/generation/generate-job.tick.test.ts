/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A 3D view's job ticks like a plan's (#863). The worker turns the job's
 * `onTick` into its heartbeat; an axonometric job was drawn without passing
 * it on, so a 3D view of the whole model said nothing from its start to its
 * end and its worker was taken for dead.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import type { ThreeDProjectView } from '@/project/types';
import { axonometricJob, runGenerateJob } from './generate-job';

function box(expressId: number, x: number): MeshData {
  const c = (i: number): number[] => [i & 1 ? x + 1.5 : x, i & 2 ? 3 : 0, i & 4 ? 0.3 : 0];
  const positions = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7].flatMap(c));
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);
  return { expressId, ifcType: 'IfcWall', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [0.8, 0.8, 0.8, 1] };
}

describe('an axonometric job calls onTick while it is drawn (#863)', () => {
  it('ticks at least once per mesh', async () => {
    const meshes = Array.from({ length: 8 }, (_, i) => box(i + 1, i * 2));
    const view: ThreeDProjectView = { id: 'axo', kind: '3d', name: '3D', createdAt: 0, viewpoint: null, projection: 'axonometric', preset: 'se', scale: 100 };
    let ticks = 0;
    const drawing = await runGenerateJob({ meshes, ...axonometricJob(view, []) }, undefined, undefined, () => { ticks++; });
    assert.ok(drawing.lines.length > 0);
    assert.ok(ticks >= meshes.length, `${ticks} ticks for ${meshes.length} meshes`);
  });
});
