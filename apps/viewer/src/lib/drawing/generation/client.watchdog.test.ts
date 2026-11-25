/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The silence watchdog takes a busy worker for a busy worker (#863).
 *
 * The report: `drawing generation worker silent for 53.125 s (job 26); taking
 * it for dead`, on a 95 MB model with many views queued. The worker was at
 * work; the watchdog timed every job from the moment it was queued, each
 * against its own limit, so a small view waiting behind a long one ran out of
 * time while the worker spoke only about the long one at intervals the small
 * one's limit did not cover. And the verdict took down every job of every
 * worker: one slow view sent the whole set to the main thread.
 *
 * Here: only the job a worker is on is timed, from when the worker starts it;
 * a silent worker is replaced by a fresh one that takes its jobs; the view it
 * went silent on gets one more try there before the main thread.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { __setGenerationWorkerFactoryForTest, generateDrawing, silenceLimitMs, IDLE_TERMINATE_MS, type DrawingRequest, type GenerationWorker } from './client';
import { __setMainThreadRunnerForTest } from './main-thread-fallback';
import type { GenerationRequest } from './drawing-generation.worker';

const mesh = (expressId: number): MeshData => ({
  expressId,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
});
/** A heavy view (many meshes) and two small ones, of one model. */
const ALL = Array.from({ length: 3_002 }, (_, i) => mesh(i + 1));
const HEAVY = ALL.slice(0, 3_000);
const SMALL_A = [ALL[3_000]];
const SMALL_B = [ALL[3_001]];
const request = (meshes: MeshData[]): DrawingRequest => ({
  allMeshes: ALL, meshes, config: createSectionConfig('y', 0.5),
  options: { includeHiddenLines: false, includeProjection: false, includeEdges: false, mergeLines: false, outline: false },
});
const drawingOf = (id: number) => ({ lines: [], cutPolygons: [], projectionPolygons: [], id } as unknown as Drawing2D);

type Generate = Extract<GenerationRequest, { type: 'generate' }>;

/** Workers that never answer by themselves: the test speaks for them, and sees every job each one was sent. */
function install(): { workers: GenerationWorker[]; jobsOf: (worker: number) => Generate[] } {
  const workers: GenerationWorker[] = [];
  const sent = new Map<GenerationWorker, Generate[]>();
  __setGenerationWorkerFactoryForTest(() => {
    const worker: GenerationWorker = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(message) { if (message.type === 'generate') sent.get(worker)?.push(message); },
    };
    sent.set(worker, []);
    workers.push(worker);
    return worker;
  });
  return { workers, jobsOf: (i) => sent.get(workers[i]) ?? [] };
}

const say = (worker: GenerationWorker, data: Parameters<NonNullable<GenerationWorker['onmessage']>>[0]['data']) => worker.onmessage?.({ data });
const turn = () => new Promise((r) => setImmediate(r));
const until = async (done: () => boolean) => { for (let i = 0; i < 500 && !done(); i++) await turn(); assert.ok(done(), 'timed out waiting'); };

let mainThread = 0;
afterEach(() => {
  mock.timers.reset();
  __setGenerationWorkerFactoryForTest(null);
  __setMainThreadRunnerForTest(null);
});
function countMainThread(): void {
  mainThread = 0;
  __setMainThreadRunnerForTest(async () => { mainThread++; return drawingOf(-1); });
}

describe('only the job a worker is on is timed (#863)', () => {
  it('a small view queued behind a long one is not given up on while the worker speaks about the long one', async () => {
    const warn = mock.method(console, 'warn', () => {});
    countMainThread();
    const stub = install();
    mock.timers.enable({ apis: ['setTimeout'] });
    const heavy = generateDrawing(request(HEAVY), undefined);
    const small = generateDrawing(request(SMALL_A), undefined);
    await until(() => stub.jobsOf(0).length === 2);
    const [heavyJob, smallJob] = stub.jobsOf(0);
    // The worker is on the heavy view for three minutes, saying so at intervals well inside that view's limit,
    // but longer than a small view's limit used to be (30 s).
    say(stub.workers[0], { type: 'alive', id: heavyJob.id });
    for (let s = 0; s < 180; s += 40) {
      mock.timers.tick(40_000);
      say(stub.workers[0], { type: 'alive', id: heavyJob.id });
    }
    await turn();
    say(stub.workers[0], { type: 'done', id: heavyJob.id, drawing: drawingOf(heavyJob.id) });
    say(stub.workers[0], { type: 'alive', id: smallJob.id });
    say(stub.workers[0], { type: 'done', id: smallJob.id, drawing: drawingOf(smallJob.id) });
    assert.equal(((await heavy) as unknown as { id: number }).id, heavyJob.id, 'the heavy view is the worker\'s drawing');
    assert.equal(((await small) as unknown as { id: number }).id, smallJob.id, 'so is the small one queued behind it');
    assert.equal(mainThread, 0, 'nothing was drawn on the main thread');
    assert.equal(warn.mock.calls.length, 0, 'and no worker was taken for dead');
    assert.equal(stub.workers.length, 1);
    mock.timers.tick(IDLE_TERMINATE_MS);
    warn.mock.restore();
  });
});

describe('one silent view does not send the set to the main thread (#863)', () => {
  it('a fresh worker takes the silent worker\'s jobs, the silent view included, and draws them', async () => {
    const warn = mock.method(console, 'warn', () => {});
    countMainThread();
    const stub = install();
    mock.timers.enable({ apis: ['setTimeout'] });
    const views = [HEAVY, SMALL_A, SMALL_B].map((m) => generateDrawing(request(m), undefined));
    await until(() => stub.jobsOf(0).length === 3);
    say(stub.workers[0], { type: 'alive', id: stub.jobsOf(0)[0].id });
    mock.timers.tick(silenceLimitMs(3) + 1);
    await until(() => stub.jobsOf(1).length === 3);
    assert.deepEqual(stub.jobsOf(1).map((j) => j.id), stub.jobsOf(0).map((j) => j.id), 'the fresh worker got the same jobs, in the same order');
    for (const job of stub.jobsOf(1)) say(stub.workers[1], { type: 'done', id: job.id, drawing: drawingOf(job.id) });
    const drawn = await Promise.all(views);
    assert.deepEqual(drawn.map((d) => (d as unknown as { id: number }).id), stub.jobsOf(1).map((j) => j.id), 'every view is the fresh worker\'s drawing');
    assert.equal(mainThread, 0, 'none was drawn on the main thread');
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /silent for [\d.]+ s \(job \d+\); it is replaced by a fresh worker, which takes its 3 job\(s\)/);
    // The next view still goes to a worker: one silent worker is not a reason to stop using them.
    const next = generateDrawing(request(SMALL_B), undefined);
    await until(() => stub.jobsOf(1).length === 4);
    say(stub.workers[1], { type: 'done', id: stub.jobsOf(1)[3].id, drawing: drawingOf(7) });
    await next;
    assert.equal(mainThread, 0);
    mock.timers.tick(IDLE_TERMINATE_MS);
    warn.mock.restore();
  });

  it('a view silent on two workers in turn is drawn on the main thread; the views behind it stay with the workers', async () => {
    const warn = mock.method(console, 'warn', () => {});
    countMainThread();
    const stub = install();
    mock.timers.enable({ apis: ['setTimeout'] });
    const [heavy, small] = [HEAVY, SMALL_A].map((m) => generateDrawing(request(m), undefined));
    await until(() => stub.jobsOf(0).length === 2);
    const limit = silenceLimitMs(3);
    mock.timers.tick(limit + 1);
    await until(() => stub.jobsOf(1).length === 2);
    mock.timers.tick(limit + 1);
    await until(() => stub.jobsOf(2).length === 1);
    assert.equal(stub.jobsOf(2)[0].id, stub.jobsOf(0)[1].id, 'the third worker got only the small view');
    // The main thread gives the page a turn (a timer) before each view it draws.
    let heavyDone = false;
    void heavy.then(() => { heavyDone = true; });
    for (let i = 0; i < 50 && !heavyDone; i++) { mock.timers.tick(1); await turn(); }
    assert.equal(((await heavy) as unknown as { id: number }).id, -1, 'the view silent twice was drawn on the main thread');
    say(stub.workers[2], { type: 'done', id: stub.jobsOf(2)[0].id, drawing: drawingOf(5) });
    assert.equal(((await small) as unknown as { id: number }).id, 5, 'the small view is the worker\'s drawing');
    assert.equal(mainThread, 1);
    mock.timers.tick(IDLE_TERMINATE_MS);
    warn.mock.restore();
  });
});
