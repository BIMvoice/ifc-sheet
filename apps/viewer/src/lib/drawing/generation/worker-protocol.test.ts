/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The generation job and the worker's protocol around it (#154): the one
 * `runGenerateJob` both the worker and the main thread run, and the worker's
 * handling of its packs and of the outline binding.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import { runGenerateJob, type GenerateJob, type GenerateJobOptions } from './generate-job';
import { packMeshes } from './mesh-pack';
import { __setOutlineLoaderForTest, handle, type GenerationReply } from './drawing-generation.worker';

const mesh = (expressId: number): MeshData => ({
  expressId,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
});

const OPTIONS: GenerateJobOptions = { includeHiddenLines: false, includeProjection: true, includeEdges: true, mergeLines: false, outline: true };
const job = (options: Partial<GenerateJobOptions> = {}): GenerateJob => ({ meshes: [mesh(1)], config: createSectionConfig('y', 0.5), options: { ...OPTIONS, ...options } });

afterEach(() => __setOutlineLoaderForTest(null));

describe('runGenerateJob\'s outline binding', () => {
  /** A binding that answers nothing (so the generator falls back to the silhouette) and counts its calls. */
  function counting(): { fn: MeshOutline2dFn; calls: () => number } {
    let calls = 0;
    return { fn: () => { calls++; return undefined; }, calls: () => calls };
  }

  it('is asked for the outline of the meshes it projects', async () => {
    const { fn, calls } = counting();
    await runGenerateJob(job(), fn);
    assert.ok(calls() > 0, 'the job used the binding for non-extruded geometry');
  });

  it('is left alone when the job does not ask for outlines', async () => {
    const { fn, calls } = counting();
    await runGenerateJob(job({ outline: false }), fn);
    assert.equal(calls(), 0);
  });

  it('is left alone when projection is off, and a job without a binding still draws', async () => {
    const { fn, calls } = counting();
    await runGenerateJob(job({ includeProjection: false, includeEdges: false }), fn);
    assert.equal(calls(), 0);
    assert.ok(await runGenerateJob(job(), undefined));
  });
});

describe('the generation worker', () => {
  const ALL = [mesh(1), mesh(2)];

  async function loaded(packId: number): Promise<GenerationReply[]> {
    const replies: GenerationReply[] = [];
    await handle({ type: 'pack', packId, pack: await packMeshes(ALL, false) }, (r) => replies.push(r));
    return replies;
  }

  async function generate(packId: number, options: Partial<GenerateJobOptions>): Promise<GenerationReply[]> {
    const replies: GenerationReply[] = [];
    await handle({ type: 'generate', id: 1, packId, meshIndices: new Uint32Array([0]), config: createSectionConfig('y', 0.5), options: { ...OPTIONS, ...options } }, (r) => replies.push(r));
    return replies;
  }

  const last = (replies: GenerationReply[]) => replies.at(-1);

  it('fails a job that needs the outline binding when its wasm has none, so the client draws it where it can', async () => {
    __setOutlineLoaderForTest(async () => undefined);
    await loaded(101);
    const reply = last(await generate(101, { outline: true }));
    assert.equal(reply?.type, 'error');
    assert.match(reply?.type === 'error' ? reply.error : '', /meshOutline2d binding is not available/);
  });

  it('draws a job that does not need the binding even when its wasm has none', async () => {
    __setOutlineLoaderForTest(async () => undefined);
    await loaded(102);
    assert.equal(last(await generate(102, { outline: false }))?.type, 'done');
  });

  it('draws from a pack it holds, and no longer from one it was told to drop', async () => {
    __setOutlineLoaderForTest(async () => (() => undefined) as MeshOutline2dFn);
    await loaded(103);
    assert.equal(last(await generate(103, {}))?.type, 'done');
    await handle({ type: 'drop', packId: 103 }, () => {});
    const reply = last(await generate(103, {}));
    assert.equal(reply?.type, 'error');
    assert.match(reply?.type === 'error' ? reply.error : '', /pack 103 is not loaded/);
  });
});
