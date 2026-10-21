/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The client's handling of a failing worker (#154): a crash is one failure
 * however many views it took with it, a worker that goes silent is given up on
 * in proportion to its job, and the session stops using the workers only
 * after repeated failures. A fallback is a drawing made in this realm, so no
 * view is ever left without one.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import {
  __setGenerationWorkerFactoryForTest, generateDrawing, silenceLimitMs,
  SILENCE_BASE_MS, SILENCE_MAX_MS, SILENCE_PER_MESH_MS, type DrawingRequest, type GenerationWorker,
} from './client';
import type { GenerationRequest } from './drawing-generation.worker';

const mesh = (expressId: number): MeshData => ({
  expressId,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
});

const ALL = Array.from({ length: 5 }, (_, i) => mesh(i + 1));
const request = (meshes: MeshData[]): DrawingRequest => ({
  allMeshes: ALL, meshes, config: createSectionConfig('y', 0.5),
  options: { includeHiddenLines: false, includeProjection: false, includeEdges: false, mergeLines: false, outline: false },
});

/** What a stub worker does when a `generate` request reaches it. */
type Behaviour = (worker: GenerationWorker, message: Extract<GenerationRequest, { type: 'generate' }>, workers: GenerationWorker[]) => void;

/** Installs workers that only record their traffic; `behave` decides what each does with a job. */
function install(behave: Behaviour): { generates: () => number; workers: GenerationWorker[]; jobs: Extract<GenerationRequest, { type: 'generate' }>[] } {
  const workers: GenerationWorker[] = [];
  const jobs: Extract<GenerationRequest, { type: 'generate' }>[] = [];
  let generates = 0;
  __setGenerationWorkerFactoryForTest(() => {
    const worker: GenerationWorker = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(message) {
        if (message.type !== 'generate') return;
        generates++;
        jobs.push(message);
        behave(worker, message, workers);
      },
    };
    workers.push(worker);
    return worker;
  });
  return { generates: () => generates, workers, jobs };
}

const until = async (done: () => boolean) => { for (let i = 0; i < 500 && !done(); i++) await new Promise((r) => setImmediate(r)); assert.ok(done(), 'timed out waiting'); };

const answer = (worker: GenerationWorker, id: number) => queueMicrotask(() => worker.onmessage?.({ data: { type: 'done', id, drawing: { lines: [], cutPolygons: [], projectionPolygons: [] } as never } }));

/** The worker crashes when the `jobs`th job reaches it (all of them then in flight); later jobs are answered. */
const crashOnArrival = (jobs: number): Behaviour => {
  let arrived = 0;
  return (worker, message) => {
    if (++arrived === jobs) worker.onerror?.({ message: 'boom' });
    else if (arrived > jobs) answer(worker, message.id);
  };
};

afterEach(() => {
  mock.timers.reset();
  __setGenerationWorkerFactoryForTest(null);
});

const crashAtOnce: Behaviour = (worker) => worker.onerror?.({ message: 'boom' });

describe('a worker crash is one failure (#154)', () => {
  it('a crash with three views in flight leaves the workers in use for the next view', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const stub = install(crashOnArrival(3));
    const drawn = await Promise.all([[ALL[0]], [ALL[1]], [ALL[2]]].map((m) => generateDrawing(request(m), undefined)));
    assert.equal(drawn.length, 3, 'every view still gets its drawing, from the main thread');
    assert.equal(stub.generates(), 3, 'all three were with a worker when it crashed');
    // The crash is one failure, not three: the next view goes to a (fresh) worker, which answers it.
    await generateDrawing(request([ALL[3]]), undefined);
    assert.equal(stub.generates(), 4, 'the next view was sent to a worker');
    warn.mock.restore();
  });

  it('two crashes in a row stop the session using the workers', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const stub = install(crashAtOnce);
    await generateDrawing(request([ALL[0]]), undefined);
    await generateDrawing(request([ALL[1]]), undefined);
    assert.equal(stub.generates(), 2);
    await generateDrawing(request([ALL[2]]), undefined);
    assert.equal(stub.generates(), 2, 'after two crashes the third view is not sent to a worker');
    warn.mock.restore();
  });

  it('two jobs that fail by themselves stop the session using the workers', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const stub = install((worker, message) => queueMicrotask(() => worker.onmessage?.({ data: { type: 'error', id: message.id, error: 'bad mesh' } })));
    await generateDrawing(request([ALL[0]]), undefined);
    await generateDrawing(request([ALL[1]]), undefined);
    await generateDrawing(request([ALL[2]]), undefined);
    assert.equal(stub.generates(), 2, 'the third view is drawn on the main thread');
    warn.mock.restore();
  });

  it('a success clears the count', async () => {
    const warn = mock.method(console, 'warn', () => {});
    let mode: 'error' | 'ok' = 'error';
    const stub = install((worker, message) => queueMicrotask(() => worker.onmessage?.({ data: mode === 'error'
      ? { type: 'error', id: message.id, error: 'bad mesh' }
      : { type: 'done', id: message.id, drawing: { lines: [], cutPolygons: [], projectionPolygons: [] } as never } })));
    await generateDrawing(request([ALL[0]]), undefined);
    mode = 'ok';
    await generateDrawing(request([ALL[1]]), undefined);
    mode = 'error';
    await generateDrawing(request([ALL[2]]), undefined);
    await generateDrawing(request([ALL[3]]), undefined);
    assert.equal(stub.generates(), 4, 'one failure, a success, one failure: the workers are still in use');
    warn.mock.restore();
  });
});

describe('a silent worker is given up on in proportion to its job (#154)', () => {
  it('the limit grows with the meshes drawn and is capped', () => {
    assert.equal(silenceLimitMs(0), SILENCE_BASE_MS);
    assert.equal(silenceLimitMs(1_000), SILENCE_BASE_MS + 1_000 * SILENCE_PER_MESH_MS);
    assert.equal(silenceLimitMs(10_000_000), SILENCE_MAX_MS);
    assert.ok(SILENCE_BASE_MS < 60_000, 'a small view whose worker died does not wait minutes');
  });

  /** Start a one-mesh view on a worker that never answers, with the clock under test's control. */
  async function silentView() {
    const stub = install(() => {});
    mock.timers.enable({ apis: ['setTimeout'] });
    let settled = false;
    const result = generateDrawing(request([ALL[0]]), undefined).then((d) => { settled = true; return d; });
    await until(() => stub.generates() === 1);
    return { stub, result, settled: () => settled, limit: silenceLimitMs(1) };
  }
  const turn = () => new Promise((r) => setImmediate(r));

  it('a small view falls back to the main thread when its worker says nothing for the limit, and not before', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const { result, settled, limit } = await silentView();
    mock.timers.tick(limit - 1);
    await turn();
    assert.equal(settled(), false, 'still waiting one millisecond before the limit');
    mock.timers.tick(1);
    mock.timers.reset();
    const drawing = await result;
    assert.ok(drawing, 'the view is drawn in this realm');
    assert.match(String(warn.mock.calls.at(-1)?.arguments.join(' ')), /silent for [\d.]+ s/);
    warn.mock.restore();
  });

  it('a word from the worker restarts the wait', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const { stub, result, settled, limit } = await silentView();
    mock.timers.tick(limit - 1);
    stub.workers[0].onmessage?.({ data: { type: 'progress', id: stub.jobs[0].id, stage: 'cut', progress: 0.5 } });
    mock.timers.tick(limit - 1);
    await turn();
    assert.equal(settled(), false, 'the progress message restarted the wait');
    mock.timers.tick(1);
    mock.timers.reset();
    await result;
    warn.mock.restore();
  });

  it('a word about one job keeps the jobs queued behind it alive', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const stub = install(() => {});
    mock.timers.enable({ apis: ['setTimeout'] });
    const settled = [false, false];
    const results = [[ALL[0]], [ALL[1]]].map((m, i) => generateDrawing(request(m), undefined).then((d) => { settled[i] = true; return d; }));
    await until(() => stub.generates() === 2);
    const limit = silenceLimitMs(1);
    mock.timers.tick(limit - 1);
    // The worker is busy with the first job and reports on it; the second waits its turn.
    stub.workers[0].onmessage?.({ data: { type: 'progress', id: stub.jobs[0].id, stage: 'cut', progress: 0.5 } });
    mock.timers.tick(limit - 1);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(settled, [false, false], 'the queued job was not given up on while its worker was talking');
    assert.equal(warn.mock.calls.length, 0, 'neither job fell back to the main thread');
    mock.timers.tick(1);
    mock.timers.reset();
    await Promise.all(results);
    warn.mock.restore();
  });
});
