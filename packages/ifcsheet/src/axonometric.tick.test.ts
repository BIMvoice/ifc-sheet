/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A 3D view says it is at work while it is drawn (#863). The app's drawing
 * worker is taken for dead when the job it is on goes silent, and a 3D view of
 * the whole model was drawn with no word from its start to its end: the
 * generator was called without `onTick`, and the cut-away's clipping and cut
 * faces ran before it with none either. Now every stage of a plain and of a
 * cut-away axonometric calls `onTick` at least once per mesh it works on.
 */

import { describe, expect, it } from 'vitest';
import { drawAxonometricView } from './axonometric.js';
import type { MeshData } from '@ifc-lite/geometry';
import type { ProjectLevel } from './document.js';
import type { ThreeDProjectView } from './view-3d-types.js';

type V3 = { x: number; y: number; z: number };

function boxMesh(expressId: number, ifcType: string, min: V3, max: V3): MeshData {
  const c = (i: number): number[] => [i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z];
  const positions = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7].flatMap(c));
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);
  return { expressId, ifcType, modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [0.8, 0.8, 0.8, 1] };
}

const LEVEL: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: ['G'] };
/** Twelve walls in a row, 3 m high: the cut at 1.2 m goes through every one. */
const MESHES = Array.from({ length: 12 }, (_, i) => boxMesh(i + 1, 'IfcWall', { x: i * 2, y: 0, z: 0 }, { x: i * 2 + 1.5, y: 3, z: 0.3 }));

const view = (patch: Partial<ThreeDProjectView> = {}): ThreeDProjectView => ({
  id: 'axo', kind: '3d', name: '3D', createdAt: 0, viewpoint: null, projection: 'axonometric', preset: 'se', scale: 100, ...patch,
});

/** Ticks heard in each stage the drawing reports, and before its first stage. */
async function ticksByStage(v: ThreeDProjectView): Promise<Map<string, number>> {
  const ticks = new Map<string, number>();
  let stage = 'before';
  await drawAxonometricView(MESHES, v, [LEVEL], (name, progress) => { stage = progress === 0 ? name : `after ${name}`; }, () => {
    ticks.set(stage, (ticks.get(stage) ?? 0) + 1);
  });
  return ticks;
}

describe('a 3D view calls onTick while it is drawn (#863)', () => {
  it('an axonometric hears from every stage of the generator, once per mesh where it works mesh by mesh', async () => {
    const ticks = await ticksByStage(view());
    expect(ticks.get('cutting') ?? 0).toBeGreaterThanOrEqual(MESHES.length);
    expect(ticks.get('edges') ?? 0).toBeGreaterThanOrEqual(MESHES.length);
    expect(ticks.get('hidden') ?? 0).toBeGreaterThanOrEqual(MESHES.length);
    expect(ticks.get('merging') ?? 0).toBeGreaterThan(0);
  });

  it('a cut-away also hears from its clipping and its cut faces, before the generator starts', async () => {
    const ticks = await ticksByStage(view({ cutaway: { storey: { level: LEVEL, cutHeight: 1.2 } } }));
    // The storey cut clips every mesh, then cuts every unclipped mesh for the face it leaves.
    expect(ticks.get('before') ?? 0).toBeGreaterThanOrEqual(2 * MESHES.length);
    expect(ticks.get('hidden') ?? 0).toBeGreaterThanOrEqual(MESHES.length);
  });
});
