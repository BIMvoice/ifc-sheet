/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The worker says when it is at work on a job (#863): when it starts it (the
 * client times a job from there, not from when it was queued), while it
 * awaits (the outline binding's wasm is loaded on its first job), and from
 * inside the generator's loops. The finished job says how long the worker
 * went without a point where it could speak.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import { packMeshes } from './mesh-pack';
import { __setOutlineLoaderForTest, handle, HEARTBEAT_MS, type GenerationReply } from './drawing-generation.worker';

const mesh = (expressId: number): MeshData => ({
  expressId,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
});
const OPTIONS = { includeHiddenLines: false, includeProjection: true, includeEdges: true, mergeLines: false, outline: true };

afterEach(() => {
  mock.timers.reset();
  __setOutlineLoaderForTest(null);
});

async function loaded(packId: number): Promise<void> {
  await handle({ type: 'pack', packId, pack: await packMeshes([mesh(1), mesh(2)], false) }, () => {});
}

describe('the worker says it is at work (#863)', () => {
  it('its first word on a job is that it started it, and the job ends saying how long it was quiet', async () => {
    __setOutlineLoaderForTest(async () => (() => undefined) as MeshOutline2dFn);
    await loaded(201);
    const replies: GenerationReply[] = [];
    await handle({ type: 'generate', id: 7, packId: 201, meshIndices: new Uint32Array([0, 1]), config: createSectionConfig('y', 0.5), options: OPTIONS }, (r) => replies.push(r));
    assert.deepEqual(replies[0], { type: 'alive', id: 7 }, 'the start of the job is said before any progress');
    const done = replies.at(-1);
    assert.equal(done?.type, 'done');
    assert.equal(typeof (done?.type === 'done' ? done.quietMs : undefined), 'number');
  });

  it('while it awaits the outline binding, it says it is alive every heartbeat', async () => {
    let release: (fn: MeshOutline2dFn) => void = () => {};
    __setOutlineLoaderForTest(() => new Promise<MeshOutline2dFn>((resolve) => { release = resolve; }));
    await loaded(202);
    mock.timers.enable({ apis: ['setInterval'] });
    const replies: GenerationReply[] = [];
    const job = handle({ type: 'generate', id: 8, packId: 202, meshIndices: new Uint32Array([0]), config: createSectionConfig('y', 0.5), options: OPTIONS }, (r) => replies.push(r));
    for (let i = 0; i < 20 && replies.length === 0; i++) await new Promise((r) => setImmediate(r));
    const atStart = replies.length;
    mock.timers.tick(HEARTBEAT_MS * 3);
    assert.equal(replies.filter((r) => r.type === 'alive').length - atStart, 3, 'one word per heartbeat while the wasm loads');
    release((() => undefined) as MeshOutline2dFn);
    await job;
    assert.equal(replies.at(-1)?.type, 'done');
    const after = replies.length;
    mock.timers.tick(HEARTBEAT_MS * 3);
    assert.equal(replies.length, after, 'and nothing once the job is done');
  });
});
