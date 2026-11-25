/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * When the drawing worker cannot be used (#863).
 *
 * The report ended on `[drawing-generation] worker unavailable, generating on
 * the main thread: ` with nothing after the colon, and a page that froze: every
 * view of the set was cut on the main thread at once. So the logged line
 * itself must name the failure (a copied console log keeps the text and may
 * drop the object), and the views that fall back are drawn one at a time, the
 * event loop turning between two, while the count of views waiting there is
 * observable for the notice that says drawings are being made slowly.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { __setGenerationWorkerFactoryForTest, generateDrawing, type DrawingRequest, type GenerationWorker } from './client';
import { __setMainThreadRunnerForTest, mainThreadDrawingsWaiting, subscribeMainThreadDrawings } from './main-thread-fallback';
import type { GenerationRequest } from './drawing-generation.worker';

const mesh = (expressId: number): MeshData => ({
  expressId,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
});

const ALL = Array.from({ length: 6 }, (_, i) => mesh(i + 1));
const request = (meshes: MeshData[]): DrawingRequest => ({
  allMeshes: ALL, meshes, config: createSectionConfig('y', 0.5),
  options: { includeHiddenLines: false, includeProjection: false, includeEdges: false, mergeLines: false, outline: false },
});
const EMPTY = { lines: [], cutPolygons: [], projectionPolygons: [] } as unknown as Drawing2D;

type Generate = Extract<GenerationRequest, { type: 'generate' }>;

/** Workers that do `onGenerate` with each job that reaches them. */
function install(onGenerate: (worker: GenerationWorker, message: Generate, arrived: number) => void): void {
  let arrived = 0;
  __setGenerationWorkerFactoryForTest(() => {
    const worker: GenerationWorker = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(message) {
        if (message.type === 'generate') onGenerate(worker, message, ++arrived);
      },
    };
    return worker;
  });
}

/** The text the fallback logged: the first argument, which is what a copied console log keeps. */
const loggedText = (warn: ReturnType<typeof mock.method>): string[] => warn.mock.calls.map((call) => String(call.arguments[0]));

afterEach(() => {
  __setGenerationWorkerFactoryForTest(null);
  __setMainThreadRunnerForTest(null);
});

describe('the fallback names why the worker could not be used (#863)', () => {
  it('a worker error event with no message: its type and where it was raised', async () => {
    const warn = mock.method(console, 'warn', () => {});
    install((worker) => worker.onerror?.({ type: 'error', filename: 'https://ifcsheet.example/assets/drawing-generation.worker-x.js', lineno: 12, colno: 7 }));
    await generateDrawing(request([ALL[0]]), undefined);
    const [line] = loggedText(warn);
    assert.match(line, /worker unavailable, generating on the main thread: WorkerCrash: /);
    assert.match(line, /"error"/, 'the event type is in the text');
    assert.match(line, /no message/, 'an event without a message says so instead of printing nothing');
    assert.match(line, /drawing-generation\.worker-x\.js:12:7/, 'where the error was raised is in the text');
    warn.mock.restore();
  });

  it('a request the browser cannot send to the worker: the exception\'s name and message', async () => {
    const warn = mock.method(console, 'warn', () => {});
    install(() => { throw new DOMException('An ArrayBuffer is detached and could not be cloned.', 'DataCloneError'); });
    await generateDrawing(request([ALL[0]]), undefined);
    assert.match(loggedText(warn)[0], /: DataCloneError: An ArrayBuffer is detached and could not be cloned\.$/);
    warn.mock.restore();
  });

  it('a job that failed in the worker without a message', async () => {
    const warn = mock.method(console, 'warn', () => {});
    install((worker, message) => queueMicrotask(() => worker.onmessage?.({ data: { type: 'error', id: message.id, error: '' } })));
    await generateDrawing(request([ALL[0]]), undefined);
    assert.match(loggedText(warn)[0], /: Error: \(no message\)$/);
    warn.mock.restore();
  });
});

describe('views that fall back are drawn one at a time, the page turning between two (#863)', () => {
  it('a crash with five views in flight: they are drawn one after another, each after a turn of the event loop', async () => {
    const warn = mock.method(console, 'warn', () => {});
    install((worker, _message, arrived) => { if (arrived === 5) worker.onerror?.({ type: 'error', message: 'boom' }); });
    const events: string[] = [];
    let active = 0;
    let most = 0;
    // A task queued when a view ends; it has run before the next view starts only if the page got a turn in between.
    let turned = true;
    __setMainThreadRunnerForTest(async (job) => {
      active++;
      most = Math.max(most, active);
      events.push(`start ${job.meshes[0].expressId}${turned ? '' : ' without a turn'}`);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      turned = false;
      setTimeout(() => { turned = true; }, 0);
      return EMPTY;
    });
    const waiting: number[] = [];
    const unsubscribe = subscribeMainThreadDrawings((n) => waiting.push(n));
    const views = ALL.slice(0, 5).map((m) => generateDrawing(request([m]), undefined));
    const drawn = await Promise.all(views);
    unsubscribe();
    assert.equal(drawn.length, 5, 'every view still gets its drawing');
    assert.equal(most, 1, 'never two views drawn on the main thread at once');
    assert.deepEqual(events, ['start 1', 'start 2', 'start 3', 'start 4', 'start 5'], 'in the order asked for, each after a turn of the event loop');
    assert.equal(Math.max(...waiting), 5, 'all five were counted as waiting on the main thread');
    assert.equal(mainThreadDrawingsWaiting(), 0, 'and none is once they are drawn');
    assert.equal(waiting.at(-1), 0);
    warn.mock.restore();
  });

  it('after the session gives up on the worker, each view still waits its turn', async () => {
    const warn = mock.method(console, 'warn', () => {});
    install((worker) => worker.onerror?.({ type: 'error', message: 'boom' }));
    __setMainThreadRunnerForTest(async () => EMPTY);
    await generateDrawing(request([ALL[0]]), undefined);
    await generateDrawing(request([ALL[1]]), undefined);
    let active = 0;
    let most = 0;
    __setMainThreadRunnerForTest(async () => {
      active++;
      most = Math.max(most, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return EMPTY;
    });
    await Promise.all(ALL.slice(2).map((m) => generateDrawing(request([m]), undefined)));
    assert.equal(most, 1);
    const said = loggedText(warn).filter((line) => /draws small views on the main thread, one at a time/.test(line));
    assert.equal(said.length, 1, 'giving up on the worker is said once, not for every view');
    warn.mock.restore();
  });
});
