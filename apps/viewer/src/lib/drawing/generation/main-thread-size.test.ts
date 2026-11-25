/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A large view is never cut on the main thread (#863).
 *
 * After the worker was taken for dead, one view of the reporter's 95 MB model
 * was cut on the page and froze it for more than five minutes. A cut is one
 * synchronous call the page cannot interrupt, so only a view small enough to
 * cut in about a second goes there; a larger one says it could not be drawn.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { __setGenerationWorkerFactoryForTest, generateDrawing, type DrawingRequest } from './client';
import { __setMainThreadRunnerForTest, MAIN_THREAD_MAX_VERTICES } from './main-thread-fallback';

const meshOf = (expressId: number, vertices: number): MeshData => ({
  expressId,
  positions: new Float32Array(vertices * 3),
  normals: new Float32Array(0),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
});
const SMALL = meshOf(1, 3);
const LARGE = meshOf(2, MAIN_THREAD_MAX_VERTICES + 1);
const ALL = [SMALL, LARGE];
const request = (meshes: MeshData[]): DrawingRequest => ({
  allMeshes: ALL, meshes, config: createSectionConfig('y', 0.5),
  options: { includeHiddenLines: false, includeProjection: false, includeEdges: false, mergeLines: false, outline: false },
});

afterEach(() => {
  __setGenerationWorkerFactoryForTest(null);
  __setMainThreadRunnerForTest(null);
});

describe('when the worker cannot draw a view (#863)', () => {
  it('a small view is drawn on the main thread; a large one is refused and says why, and the page never cuts it', async () => {
    const warn = mock.method(console, 'warn', () => {});
    // A worker whose script fails to load: every job it is given fails.
    __setGenerationWorkerFactoryForTest(() => {
      const worker = {
        onmessage: null, onerror: null as ((event: { type?: string; message?: string }) => void) | null, terminate() {},
        postMessage(message: { type: string }) { if (message.type === 'generate') queueMicrotask(() => worker.onerror?.({ type: 'error', message: 'boom' })); },
      };
      return worker;
    });
    const drawnHere: number[] = [];
    __setMainThreadRunnerForTest(async (job) => { drawnHere.push(job.meshes.length); return { lines: [] } as unknown as Drawing2D; });
    assert.ok(await generateDrawing(request([SMALL]), undefined), 'the small view is drawn');
    await assert.rejects(generateDrawing(request([LARGE]), undefined), /could not be drawn: the drawing worker failed.*too large to draw on the page without freezing it/);
    assert.deepEqual(drawnHere, [1], 'only the small view was cut on the main thread');
    // The same once the session has given up on the worker.
    await generateDrawing(request([SMALL]), undefined);
    await assert.rejects(generateDrawing(request([LARGE]), undefined), /could not be drawn: the drawing worker failed \d+ times in a row/);
    assert.deepEqual(drawnHere, [1, 1]);
    warn.mock.restore();
  });
});
