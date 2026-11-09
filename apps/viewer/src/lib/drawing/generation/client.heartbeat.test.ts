/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A busy worker is not a dead one: a heavy view can compute for longer than the
 * silence limit (one elevation of a large model took 39 to 43 s), and the worker
 * says it is alive from inside its work, so the client keeps waiting. A worker
 * that truly says nothing is still given up on, and a view too large to draw on
 * the main thread without freezing the page then fails with a message.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import {
  __setGenerationWorkerFactoryForTest, generateDrawing, silenceLimitMs, IDLE_TERMINATE_MS, MAIN_THREAD_FALLBACK_MAX_MESHES,
  type DrawingRequest, type GenerationWorker,
} from './client';
import { withHeartbeat } from './drawing-generation.worker';
import type { GenerationRequest } from './drawing-generation.worker';

const mesh = (expressId: number): MeshData => ({
  expressId,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
});
const request = (all: MeshData[], meshes: MeshData[]): DrawingRequest => ({
  allMeshes: all, meshes, config: createSectionConfig('y', 0.5),
  options: { includeHiddenLines: false, includeProjection: false, includeEdges: false, mergeLines: false, outline: false },
});
const SMALL = [mesh(1)];
const EMPTY_DRAWING = { lines: [], cutPolygons: [], projectionPolygons: [] } as never;

/** A worker that never answers on its own; the test speaks for it. */
function silentWorker(): { sent: () => Extract<GenerationRequest, { type: 'generate' }>[]; worker: () => GenerationWorker } {
  const jobs: Extract<GenerationRequest, { type: 'generate' }>[] = [];
  let created: GenerationWorker | null = null;
  __setGenerationWorkerFactoryForTest(() => {
    created = { onmessage: null, onerror: null, terminate() {}, postMessage(m) { if (m.type === 'generate') jobs.push(m); } };
    return created;
  });
  return { sent: () => jobs, worker: () => created as GenerationWorker };
}
const turn = () => new Promise((r) => setImmediate(r));
const until = async (done: () => boolean) => { for (let i = 0; i < 500 && !done(); i++) await turn(); assert.ok(done(), 'timed out waiting'); };

/** A finished job leaves the client's idle timer on the mocked clock: let it fire here, so no handle of this clock outlives the test. */
const letIdlePoolGo = () => mock.timers.tick(IDLE_TERMINATE_MS);

afterEach(() => {
  mock.timers.reset();
  __setGenerationWorkerFactoryForTest(null);
});

describe('a busy worker that sends heartbeats is not declared dead', () => {
  it('stays alive for several times the silence limit, then its own drawing is used', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const stub = silentWorker();
    mock.timers.enable({ apis: ['setTimeout'] });
    let settled = false;
    const result = generateDrawing(request(SMALL, SMALL), undefined).then((d) => { settled = true; return d; });
    await until(() => stub.sent().length === 1);
    const limit = silenceLimitMs(1);
    const id = stub.sent()[0].id;
    for (let i = 0; i < 5; i++) {
      mock.timers.tick(limit - 1);
      stub.worker().onmessage?.({ data: { type: 'alive', id } });
    }
    await turn();
    assert.equal(settled, false, 'still waiting after five silence limits of computing');
    assert.equal(warn.mock.calls.length, 0, 'the view did not fall back to the main thread');
    stub.worker().onmessage?.({ data: { type: 'done', id, drawing: EMPTY_DRAWING } });
    assert.equal(await result, EMPTY_DRAWING, 'the worker\'s own drawing came back');
    letIdlePoolGo();
    warn.mock.restore();
  });

  it('a heartbeat on one job keeps the jobs queued behind it alive', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const stub = silentWorker();
    mock.timers.enable({ apis: ['setTimeout'] });
    const settled = [false, false];
    const all = [mesh(1), mesh(2)];
    const results = [[all[0]], [all[1]]].map((m, i) => generateDrawing(request(all, m), undefined).then((d) => { settled[i] = true; return d; }));
    await until(() => stub.sent().length === 2);
    const limit = silenceLimitMs(1);
    for (let i = 0; i < 3; i++) {
      mock.timers.tick(limit - 1);
      stub.worker().onmessage?.({ data: { type: 'alive', id: stub.sent()[0].id } });
    }
    await turn();
    assert.deepEqual(settled, [false, false]);
    assert.equal(warn.mock.calls.length, 0);
    for (const job of stub.sent()) stub.worker().onmessage?.({ data: { type: 'done', id: job.id, drawing: EMPTY_DRAWING } });
    await Promise.all(results);
    letIdlePoolGo();
    warn.mock.restore();
  });
});

describe('a worker that truly goes silent is still given up on', () => {
  it('a small view is drawn on the main thread after the limit with no heartbeat', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const stub = silentWorker();
    mock.timers.enable({ apis: ['setTimeout'] });
    const result = generateDrawing(request(SMALL, SMALL), undefined);
    await until(() => stub.sent().length === 1);
    mock.timers.tick(silenceLimitMs(1));
    mock.timers.reset();
    assert.ok(await result, 'drawn in this realm');
    assert.match(String(warn.mock.calls.at(-1)?.arguments.join(' ')), /silent for [\d.]+ s/);
    warn.mock.restore();
  });

  it('a view too large for the main thread fails with a message instead of freezing the page', async () => {
    const warn = mock.method(console, 'warn', () => {});
    const big = Array.from({ length: MAIN_THREAD_FALLBACK_MAX_MESHES + 1 }, (_, i) => mesh(i + 1));
    const stub = silentWorker();
    mock.timers.enable({ apis: ['setTimeout'] });
    const result = generateDrawing(request(big, big), undefined);
    const failed = assert.rejects(result, /too large to draw without freezing the page/);
    await until(() => stub.sent().length === 1);
    mock.timers.tick(silenceLimitMs(big.length));
    mock.timers.reset();
    await failed;
    warn.mock.restore();
  });
});

describe('withHeartbeat', () => {
  it('beats at most once per interval, and every call still reaches the binding', () => {
    let clock = 0;
    let beats = 0;
    let calls = 0;
    const fn = withHeartbeat((() => { calls++; return undefined; }) as unknown as MeshOutline2dFn, () => { beats++; }, 1_000, () => clock);
    assert.ok(fn);
    for (let i = 0; i < 10; i++) { clock += 300; (fn as (...a: unknown[]) => unknown)(); }
    assert.equal(calls, 10);
    assert.equal(beats, 2, 'ten calls over 3000 ms beat at 1200 and 2400 ms: one per full interval, not one per call');
  });

  it('leaves a missing binding missing', () => {
    assert.equal(withHeartbeat(undefined, () => {}), undefined);
  });
});
