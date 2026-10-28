/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The 3D scene is not uploaded behind the Wall (#154). A non-streaming load
 * appends its meshes from `useGeometryStreaming`'s effect, outside the render
 * loop, so pausing the loop (#217) did not hold it back: on a 56 MB model that
 * upload was a 365 ms main-thread task nobody could see. While the viewport is
 * covered the meshes are registered (CPU picking, bounds and visibility see
 * them) but no GPU buffer is made; the first frame after the cover lifts makes
 * them. Uncovered, as in the full edition, the upload happens in the effect as
 * before.
 *
 * The REAL `useGeometryStreaming` and `useAnimationLoop` run together over a
 * REAL `Scene`; only the WebGPU device (which counts `createBuffer`), the
 * camera and the renderer's frame entry points are stand-ins, and rAF is
 * stepped by hand.
 */

import '@/test/setup-dom.js';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Renderer } from '@ifc-lite/renderer';
import type { MeshData } from '@ifc-lite/geometry';
import { Scene } from '../../../../../packages/renderer/src/scene.js';
import { useAnimationLoop, type UseAnimationLoopParams } from './useAnimationLoop.js';
import { useGeometryStreaming, type UseGeometryStreamingParams } from './useGeometryStreaming.js';
import { coverViewport } from './viewport-cover.js';

const covers: Array<() => void> = [];
function cover(): () => void { const lift = coverViewport(); covers.push(lift); return lift; }

let queued: FrameRequestCallback[] = [];
let now = 0;
const realRaf = globalThis.requestAnimationFrame;
const realCancel = globalThis.cancelAnimationFrame;
function step(): void { const due = queued; queued = []; now += 16; for (const cb of due) cb(now); }

function mesh(expressId: number, color: [number, number, number, number]): MeshData {
  return {
    expressId,
    modelIndex: 0,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    color,
  };
}

interface Gpu { buffers: number; renders: number; renderRequested: boolean }

function realSceneRenderer(gpu: Gpu): { renderer: Renderer; scene: Scene } {
  Object.assign(globalThis, { GPUBufferUsage: { COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64 } });
  const device = {
    limits: { maxBufferSize: 1 << 30, maxStorageBufferBindingSize: 1 << 30 },
    createBuffer: ({ size }: GPUBufferDescriptor) => {
      gpu.buffers++;
      const data = new ArrayBuffer(size);
      return { size, getMappedRange: () => data, unmap() {}, destroy() {} };
    },
    createBindGroup: () => ({}),
    queue: { writeBuffer() {} },
  };
  const pipeline = { getUniformBufferSize: () => 256, getBindGroupLayout: () => ({}) };
  const scene = new Scene();
  const camera = {
    update: () => false,
    getRotation: () => ({ azimuth: 0, elevation: 0 }),
    getPosition: () => ({ x: 0, y: 0, z: 0 }),
    getTarget: () => ({ x: 0, y: 0, z: 0 }),
    getDistance: () => 10,
    fitBoundsAdaptive: () => ({ kind: 'compact' as const }),
    setSceneBounds: () => {},
    setOrbitAnchorBounds: () => {},
    reset: () => {},
  };
  const renderer = {
    getGPUDevice: () => device,
    getPipeline: () => pipeline,
    getScene: () => scene,
    getCamera: () => camera,
    getCanvas: () => null,
    getModelBounds: () => null,
    clearCaches: () => {},
    peekRenderRequest: () => gpu.renderRequested,
    consumeRenderRequest: () => { gpu.renderRequested = false; },
    requestRender: () => { gpu.renderRequested = true; },
    render: () => { gpu.renders++; },
  } as unknown as Renderer;
  return { renderer, scene };
}

const ref = <T,>(current: T) => ({ current });
const noop = () => {};

function Harness({ renderer, geometry }: { renderer: Renderer; geometry: MeshData[] }) {
  const rendererRef = useRef<Renderer | null>(renderer);
  const canvasRef = useRef<HTMLCanvasElement | null>(Object.assign(document.createElement('canvas'), { width: 256, height: 256 }));
  useGeometryStreaming({
    rendererRef, isInitialized: true, geometry, geometryVersion: 1, isStreaming: false, modelCount: 1,
    geometryBoundsRef: ref({ min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 100, z: 100 } }),
    pendingMeshColorUpdates: null, pendingColorUpdates: null, pendingMeshRemovals: null,
    pendingMeshTranslations: null, pendingMeshRotations: null, pendingInstancedShards: null,
    clearPendingMeshColorUpdates: noop, clearPendingColorUpdates: noop, clearPendingMeshRemovals: noop,
    pruneGeometryMeshes: noop, clearPendingMeshTranslations: noop, clearPendingMeshRotations: noop,
    clearInstancedShards: noop, clearColorRef: ref<[number, number, number, number]>([0, 0, 0, 1]),
  } as UseGeometryStreamingParams);
  useAnimationLoop({
    canvasRef, rendererRef, isInitialized: true,
    animationFrameRef: ref<number | null>(null), lastFrameTimeRef: ref(0), mouseIsDraggingRef: ref(false),
    activeToolRef: ref('select'), terrainClipYRef: ref<number | null>(null),
    hiddenEntitiesRef: ref(new Set<number>()), isolatedEntitiesRef: ref<Set<number> | null>(null),
    ghostExceptEntitiesRef: ref<Set<number> | null>(null), selectedEntityIdRef: ref<number | null>(null),
    selectedModelIndexRef: ref<number | undefined>(undefined), clearColorRef: ref<[number, number, number, number]>([1, 1, 1, 1]),
    visualEnhancementRef: ref({ enabled: false }), environmentRef: ref({}), sunShadowsRef: ref(null),
    sectionPlaneRef: ref({ axis: 'y', position: 0, enabled: false, flipped: false }),
    sectionRangeRef: ref<{ min: number; max: number } | null>(null),
    selectedEntityIdsRef: ref<Set<number> | undefined>(undefined),
    clashHighlightColorsRef: ref<Map<number, [number, number, number, number]> | null>(null),
    coordinateInfoRef: ref(undefined), isInteractingRef: ref(false), lastCameraStateRef: ref(null),
    updateCameraRotationRealtime: noop, calculateScale: noop, updateMeasurementScreenCoords: noop,
    hasPendingMeasurements: () => false,
  } as unknown as UseAnimationLoopParams);
  return null;
}

const mounted: Root[] = [];
let warnings: unknown[][] = [];
const realWarn = console.warn;

beforeEach(() => {
  queued = []; now = 0; warnings = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { queued.push(cb); return queued.length; }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => { queued = []; }) as typeof cancelAnimationFrame;
});

afterEach(async () => {
  console.warn = realWarn;
  for (const lift of covers.splice(0)) lift();
  for (const root of mounted.splice(0)) await act(async () => { root.unmount(); });
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancel;
});

async function load(renderer: Renderer, geometry: MeshData[]): Promise<(next: MeshData[]) => Promise<void>> {
  const root = createRoot(document.createElement('div'));
  mounted.push(root);
  await act(async () => { root.render(<Harness renderer={renderer} geometry={geometry} />); });
  return async (next) => { await act(async () => { root.render(<Harness renderer={renderer} geometry={next} />); }); };
}

const MODEL = [mesh(1, [1, 0, 0, 1]), mesh(2, [0, 0, 1, 1]), mesh(3, [1, 0, 0, 1])];

describe('3D scene upload while the viewport is covered (#154)', () => {
  it('makes no GPU buffer behind the Wall, yet registers the meshes', async () => {
    const gpu: Gpu = { buffers: 0, renders: 0, renderRequested: false };
    const { renderer, scene } = realSceneRenderer(gpu);
    cover();
    await load(renderer, MODEL);
    for (let i = 0; i < 3; i++) step();
    assert.equal(gpu.buffers, 0, 'no GPU buffer is created while covered');
    assert.equal(scene.getBatchedMeshes().length, 0);
    assert.equal(gpu.renders, 0);
    assert.ok(scene.getMeshDataPieces(1)?.length && scene.getMeshDataPieces(2)?.length, 'CPU-side mesh data is registered');
    assert.ok(scene.hasPendingBatches(), 'the batches are owed');
  });

  it('uploads on the first frame after the cover lifts, and draws it', async () => {
    const gpu: Gpu = { buffers: 0, renders: 0, renderRequested: false };
    const { renderer, scene } = realSceneRenderer(gpu);
    const lift = cover();
    await load(renderer, MODEL);
    step();
    assert.equal(gpu.buffers, 0, 'precondition: nothing uploaded while covered');

    lift();
    step();
    assert.ok(gpu.buffers > 0, 'GPU buffers are created once the cover lifts');
    const batches = scene.getBatchedMeshes();
    assert.equal(batches.length, 2, 'one batch per colour, as an uncovered load makes');
    assert.deepEqual(batches.flatMap((b) => [...b.expressIds]).sort(), [1, 2, 3]);
    assert.equal(scene.hasPendingBatches(), false);
    assert.equal(gpu.renders, 1, 'and the frame draws it');

    const after = gpu.buffers;
    step(); step();
    assert.equal(gpu.buffers, after, 'uploaded once, not every frame');
    assert.equal(warnings.length, 0, `no upload failure: ${JSON.stringify(warnings)}`);
  });

  it('a model replaced while covered uploads only the latest one once the cover lifts', async () => {
    const gpu: Gpu = { buffers: 0, renders: 0, renderRequested: false };
    const { renderer, scene } = realSceneRenderer(gpu);
    const lift = cover();
    const reload = await load(renderer, MODEL);
    await reload([mesh(7, [0, 1, 0, 1]), mesh(8, [0, 1, 0, 1])]);
    step();
    assert.equal(gpu.buffers, 0);
    lift();
    step();
    assert.deepEqual(scene.getBatchedMeshes().flatMap((b) => [...b.expressIds]).sort(), [7, 8]);
    assert.equal(scene.getMeshDataPieces(1), undefined, 'the replaced model left nothing behind');
  });

  it('uncovered (the full edition) uploads in the effect, as before', async () => {
    const gpu: Gpu = { buffers: 0, renders: 0, renderRequested: false };
    const { renderer, scene } = realSceneRenderer(gpu);
    await load(renderer, MODEL);
    assert.ok(gpu.buffers > 0, 'buffers exist before any frame runs');
    assert.equal(scene.getBatchedMeshes().length, 2);
    const before = gpu.buffers;
    step();
    assert.equal(gpu.buffers, before, 'the frame owes no further upload');
  });
});
