/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The end of a load, split into tasks (#154). A model's arrival used to append 11,000 meshes, fit the camera, drain the
 * instanced shards and render the panels in one 180 ms task. Now:
 *   - the hook's effects run in the task after the store update, not in the update's own render;
 *   - the instanced shards are registered with the scene at once (the data side), and their GPU upload waits while the
 *     viewport is covered and runs in arrival order once it is not;
 *   - the first camera fit runs in a task of its own while covered, at the moment the cover lifts if that comes first,
 *     and in the effect itself when nothing is covered (no frame can draw an unfitted camera).
 * Each deferred piece of work must still happen, and in order.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { create } from 'zustand';
import type { Renderer } from '@ifc-lite/renderer';
import type { MeshData } from '@ifc-lite/geometry';
import { laterTasksUntil, updateInThisTask } from '@/test/react-tasks.js';
import { useGeometryStreaming, type UseGeometryStreamingParams } from './useGeometryStreaming.js';
import { coverViewport } from './viewport-cover.js';
import { shardBytes } from '@/test/ifns-shard-bytes.js';

const mesh = (expressId: number): MeshData => ({
  expressId, modelIndex: 0, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]), color: [1, 1, 1, 1],
});

/** Browser tasks since the test began: a timer chain, so what ran in the same task shares a number. */
let task = 0;
let ticking = false;
function tick() { if (!ticking) return; task++; setTimeout(tick, 0); }

interface Entry { name: string; task: number; detail?: number }
let log: Entry[];
let afterAppend: (() => void) | null;
const record = (name: string, detail?: number) => log.push({ name, task, detail });
const entries = (name: string) => log.filter((e) => e.name === name);

function fakeRenderer(): Renderer {
  const registered: number[] = [];
  const scene = {
    clear: () => {}, clearFlatGeometry: () => {}, getInstancedModelIndices: () => [],
    removeInstancedTemplatesForModel: () => 0,
    registerInstancedShard: (shard: { instances: Array<{ entityId: number }> }) => { registered.push(shard.instances[0].entityId); record('register', shard.instances[0].entityId); },
    hasDeferredInstancedUploads: () => registered.length > 0,
    uploadDeferredInstanced: () => { for (const id of registered.splice(0)) record('shard', id); },
    appendToBatches: () => { record('append'); afterAppend?.(); },
    queueMeshes: () => {}, hasQueuedMeshes: () => false, getBatchedMeshes: () => [], flushPending: () => true,
    hasPendingBatches: () => false, rebuildPendingBatches: () => {}, removeMeshesForEntities: () => {},
    translateMeshesForEntities: () => {}, rotateMeshesForEntities: () => {}, hasStreamingFragments: () => false,
    isEphemeralStreaming: () => false, finalizeStreaming: () => {}, finalizeStreamingAsync: () => Promise.resolve(),
    finishEphemeralStreaming: () => {}, setEphemeralStreamingMode: () => {}, updateMeshColors: () => {},
    setColorOverrides: () => {}, clearColorOverrides: () => {},
  };
  const camera = {
    fitBoundsAdaptive: () => { record('fit'); return { kind: 'compact' as const }; },
    getPosition: () => ({ x: 0, y: 0, z: 0 }), getTarget: () => ({ x: 0, y: 0, z: 0 }),
    setSceneBounds: () => {}, setOrbitAnchorBounds: () => {}, reset: () => {},
  };
  return {
    getGPUDevice: () => ({}), getPipeline: () => ({}), getScene: () => scene, getCamera: () => camera,
    getCanvas: () => null, clearCaches: () => {}, requestRender: () => {},
  } as unknown as Renderer;
}

interface Inputs { geometry: MeshData[] | null; shards: Array<{ modelId: string; bytes: ArrayBuffer }> | null }
const useInputs = create<Inputs & { clears: number }>(() => ({ geometry: null, shards: null, clears: 0 }));

function Harness({ renderer }: { renderer: Renderer }) {
  const { geometry, shards } = useInputs();
  const rendererRef = useRef<Renderer | null>(renderer);
  const clearColorRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const geometryBoundsRef = useRef({ min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 100, z: 100 } });
  const noop = () => {};
  const params: UseGeometryStreamingParams = {
    rendererRef, isInitialized: true, geometry, geometryVersion: geometry?.length ?? 0, isStreaming: false, geometryBoundsRef, clearColorRef,
    pendingMeshColorUpdates: null, pendingColorUpdates: null, pendingMeshRemovals: null, pendingMeshTranslations: null,
    pendingMeshRotations: null, pendingInstancedShards: shards,
    clearPendingMeshColorUpdates: noop, clearPendingColorUpdates: noop, clearPendingMeshRemovals: noop, pruneGeometryMeshes: noop,
    clearPendingMeshTranslations: noop, clearPendingMeshRotations: noop,
    clearInstancedShards: () => { record('clear'); useInputs.setState({ shards: null }); },
  };
  useGeometryStreaming(params);
  return null;
}

let root: Root;
const lifts: Array<() => void> = [];
const cover = () => { const lift = coverViewport(); lifts.push(lift); return lift; };

beforeEach(async () => {
  log = []; afterAppend = null; task = 0; ticking = true; setTimeout(tick, 0);
  useInputs.setState({ geometry: null, shards: null });
  root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Harness renderer={fakeRenderer()} />); });
});

afterEach(async () => {
  ticking = false;
  await act(async () => { root.unmount(); });
  while (lifts.length) lifts.pop()!();
});

const load = (extra: Partial<Inputs> = {}) => updateInThisTask(() => useInputs.setState({ geometry: [mesh(1)], ...extra }));
const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

describe('the end of a load, in tasks (#154)', () => {
  it('runs the hook\'s effects in the task after the store update', async () => {
    await load();
    assert.equal(entries('append').length, 0, 'the update\'s own task appended nothing');
    await laterTasksUntil(() => entries('append').length === 1);
    assert.equal(entries('append').length, 1);
  });

  it('registers the instanced shards at once while covered, uploads them in arrival order when the cover lifts', async () => {
    const lift = cover();
    await load({ shards: [{ modelId: 'a', bytes: shardBytes(11) }, { modelId: 'a', bytes: shardBytes(22) }, { modelId: 'a', bytes: shardBytes(33) }] });
    await laterTasksUntil(() => entries('clear').length === 1);
    await idle();
    assert.deepEqual(entries('register').map((e) => e.detail), [11, 22, 33], 'the data side does not wait for the cover');
    assert.equal(entries('shard').length, 0, 'no GPU upload behind the cover');
    assert.equal(useInputs.getState().shards, null, 'the raw bytes are released once registered');
    await act(async () => { lift(); });
    await laterTasksUntil(() => entries('shard').length === 3);
    assert.deepEqual(entries('shard').map((e) => e.detail), [11, 22, 33], 'uploaded in the order they arrived');
  });

  it('registers and uploads the shards after the model is appended when nothing is covered', async () => {
    await load({ shards: [{ modelId: 'a', bytes: shardBytes(11) }, { modelId: 'a', bytes: shardBytes(22) }] });
    await laterTasksUntil(() => entries('shard').length === 2);
    assert.deepEqual(log.filter((e) => e.name !== 'fit' && e.name !== 'clear').map((e) => e.name), ['append', 'register', 'register', 'shard', 'shard']);
    assert.deepEqual(entries('shard').map((e) => e.detail), [11, 22]);
  });

  it('fits the camera in a task of its own while covered, and fits it once', async () => {
    cover();
    await load();
    await laterTasksUntil(() => entries('fit').length === 1);
    await idle();
    assert.equal(entries('fit').length, 1);
    assert.ok(entries('fit')[0].task > entries('append')[0].task, 'the fit is not in the task that appended the meshes');
    assert.ok(log.findIndex((e) => e.name === 'append') < log.findIndex((e) => e.name === 'fit'));
  });

  it('fits the camera at the moment the cover lifts, when that comes before the fit\'s own task', async () => {
    const lift = cover();
    afterAppend = () => queueMicrotask(lift); // right after the task whose effect appended, before the fit's timer
    await load();
    await laterTasksUntil(() => entries('fit').length === 1);
    await idle();
    assert.equal(entries('fit').length, 1, 'fitted once: the fit\'s own task finds it done');
    assert.equal(entries('fit')[0].task, entries('append')[0].task, 'fitted in the task that lifted the cover, before any frame');
  });

  it('fits in the effect itself when uncovered, so no frame draws an unfitted camera', async () => {
    await load();
    await laterTasksUntil(() => entries('fit').length === 1);
    assert.equal(entries('fit')[0].task, entries('append')[0].task, 'append and fit are one task');
  });
});
