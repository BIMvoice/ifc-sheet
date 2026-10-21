/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drawings are generated in a worker (#154), and must be the drawings the
 * main thread made. These run the real hook (`useDrawingGeneration`, through
 * the view harness) on AC20-FZK-Haus three ways: in this realm, as Node
 * always does; through the worker's real handler behind a structured-clone
 * boundary with the meshes transferred (one worker); and with them shared
 * (the pool). The drawings must be equal, and the worker must have made them:
 * the meshes cross once, each view sends only indices.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import * as IfcWasm from '@ifc-lite/wasm';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import type { ProjectView } from '@/project/types';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { __setGenerationWorkerFactoryForTest, type GenerationWorker } from './client';
import { __setOutlineLoaderForTest, handle, postDrawing, PART_SIZE, type GenerationReply, type GenerationRequest } from './drawing-generation.worker';

const FZK = new URL('../../../../../../tests/models/ara3d/AC20-FZK-Haus.ifc', import.meta.url);

const s = Math.SQRT1_2;
const VIEWS: Exclude<ProjectView, { kind: '3d' }>[] = [
  { id: 'south', name: 'south', kind: 'elevation', direction: 'south', createdAt: 0 },
  { id: 'east-deep', name: 'east', kind: 'elevation', direction: 'east', createdAt: 0, viewDepth: 8 },
  { id: 's1', name: 's1', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: -5, flipped: false }, viewDepth: 5 },
  { id: 's3', name: 's3', kind: 'section', createdAt: 0, viewDepth: 6, plane: { axis: 'side', offset: 6, flipped: false, custom: { normal: [s, 0, s], distance: 0, pickedAt: [5, 1, -5], tangent: [s, 0, -s], bitangent: [0, 1, 0] } } },
];

/** What crossed the boundary: every request, by type, and whether a pack carried shared buffers. */
interface Traffic { requests: GenerationRequest[]; replies: GenerationReply[] }

/** The worker's real handler behind `structuredClone`, transfers and all, as a `postMessage` hop imposes. */
function inProcessWorker(traffic: Traffic): GenerationWorker {
  const worker: GenerationWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message, transfer) {
      const data = structuredClone(message, { transfer: transfer ?? [] });
      traffic.requests.push(data);
      void handle(data, (reply) => {
        traffic.replies.push(reply);
        const copy = structuredClone(reply);
        queueMicrotask(() => worker.onmessage?.({ data: copy }));
      });
    },
    terminate() {},
  };
  return worker;
}

/** The drawing without the one field that is a measurement, not a result: how long it took. */
const timeless = (d: Drawing2D | null) => (d ? { ...d, stats: { ...d.stats, processingTimeMs: 0 } } : d);

let geometry: GeometryResult | null = null;
let onMain: Map<string, Drawing2D | null> = new Map();

before(async () => {
  geometry = await meshFile(FZK);
  if (!geometry) return;
  const outline = (IfcWasm as unknown as { meshOutline2d?: MeshOutline2dFn }).meshOutline2d;
  __setOutlineLoaderForTest(async () => outline);
  for (const view of VIEWS) onMain.set(view.id, await viewDrawing(view, geometry));
});

after(() => {
  __setGenerationWorkerFactoryForTest(null);
  __setOutlineLoaderForTest(null);
  onMain = new Map();
});

describe('drawing generation in the worker', () => {
  for (const shared of [false, true]) {
    it(`draws what the main thread draws (meshes ${shared ? 'shared' : 'transferred'})`, async (t) => {
      if (!geometry) return t.skip('run pnpm fixtures and pnpm build:wasm:fetch');
      const traffic: Traffic = { requests: [], replies: [] };
      __setGenerationWorkerFactoryForTest(() => inProcessWorker(traffic), shared);
      try {
        for (const view of VIEWS) {
          const expected = onMain.get(view.id);
          assert.ok(expected && expected.lines.length > 0, `${view.id} draws nothing on the main thread`);
          assert.deepEqual(timeless(await viewDrawing(view, geometry)), timeless(expected), view.id);
        }
      } finally {
        __setGenerationWorkerFactoryForTest(null);
      }
      const of = (type: string) => traffic.requests.filter((r) => r.type === type);
      assert.equal(of('pack').length, 1, 'the meshes cross once for every view');
      assert.equal(of('generate').length, VIEWS.length);
      for (const request of of('generate')) assert.ok(request.type === 'generate' && request.meshIndices instanceof Uint32Array, 'a view sends mesh indices, not meshes');
      assert.equal(traffic.replies.filter((r) => r.type === 'done').length, VIEWS.length, 'the worker made every drawing');
      const pack = of('pack')[0];
      assert.ok(pack.type === 'pack');
      assert.equal(pack.pack.positions.buffer instanceof SharedArrayBuffer, shared);
    });
  }

  it('a drawing longer than one message arrives in slices and is put back in order', async () => {
    const lines = Array.from({ length: PART_SIZE * 2 + 7 }, (_, i) => ({ line: { start: { x: i, y: 0 }, end: { x: i, y: 1 } }, category: 'cut', visibility: 'visible', entityId: i, depth: 0 }));
    const drawing = { lines, cutPolygons: [], projectionPolygons: [], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } } as unknown as Drawing2D;
    const posted: GenerationReply[] = [];
    postDrawing(7, drawing, (reply) => posted.push(reply));
    assert.deepEqual(posted.map((r) => r.type), ['part', 'part', 'part', 'done']);
    const done = posted.at(-1)!;
    assert.ok(done.type === 'done' && done.drawing.lines.length === 0, 'the sliced list is not sent twice');

    // And the client reassembles it: a worker that answers every job with the same slices.
    const traffic: Traffic = { requests: [], replies: [] };
    __setGenerationWorkerFactoryForTest(() => {
      const worker: GenerationWorker = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
          traffic.requests.push(message);
          if (message.type !== 'generate') return;
          postDrawing(message.id, drawing, (reply) => queueMicrotask(() => worker.onmessage?.({ data: structuredClone(reply) })));
        },
        terminate() {},
      };
      return worker;
    });
    try {
      const { generateDrawing } = await import('./client');
      const mesh = { expressId: 1, positions: new Float32Array(9), normals: new Float32Array(0), indices: new Uint32Array([0, 1, 2]), color: [1, 1, 1, 1] as [number, number, number, number] };
      const back = await generateDrawing({
        allMeshes: [mesh], meshes: [mesh], config: drawing.config,
        options: { includeHiddenLines: false, includeProjection: false, includeEdges: false, mergeLines: false, outline: false },
      }, undefined);
      assert.deepEqual(back, drawing);
    } finally {
      __setGenerationWorkerFactoryForTest(null);
    }
  });
});
