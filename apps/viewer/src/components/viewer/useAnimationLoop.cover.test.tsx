/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The 3D view does not render behind the Wall (#154). While something covers
 * the viewport the loop draws nothing, uploads nothing and arms no frame; when
 * the cover lifts it picks up where it left off, with a render owed.
 *
 * The loop is driven by a hand-rolled rAF so frames step deterministically;
 * `render()` is the spy.
 */

import '@/test/setup-dom.js';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Renderer } from '@ifc-lite/renderer';
import { useAnimationLoop, type UseAnimationLoopParams } from './useAnimationLoop.js';
import { coverViewport as cover } from './viewport-cover.js';

/** Every cover a test puts up is lifted after it, so a failure cannot leak into the next test. */
const covers: Array<() => void> = [];
function coverViewport(): () => void { const lift = cover(); covers.push(lift); return lift; }

// ---- deterministic rAF -----------------------------------------------------

let queued: FrameRequestCallback[] = [];
let now = 0;
const realRaf = globalThis.requestAnimationFrame;
const realCancel = globalThis.cancelAnimationFrame;

/** Run exactly one frame: drain what is queued now, at a fresh timestamp. */
function step(): void {
  const due = queued;
  queued = [];
  now += 16;
  for (const cb of due) cb(now);
}

// ---- fakes -----------------------------------------------------------------

interface FakeRendererState {
  renderCalls: number;
  /** The renderer's dirty flag, modelled as the real one behaves: consumable. */
  renderRequested: boolean;
  /** scene uploads performed */
  uploads: number;
  /** whether a streaming mesh queue is waiting */
  queued: boolean;
}

function fakeRenderer(state: FakeRendererState): Renderer {
  const camera = {
    update: () => false,
    getRotation: () => ({ azimuth: 0, elevation: 0 }),
    getPosition: () => ({ x: 0, y: 0, z: 0 }),
    getDistance: () => 10,
  };
  const scene = {
    hasQueuedMeshes: () => state.queued,
    flushPending: () => { state.uploads++; state.queued = false; return true; },
    hasResidencyRestoreWork: () => false,
    getColorOverrides: () => null,
  };
  return {
    getCamera: () => camera,
    getScene: () => scene,
    getGPUDevice: () => ({}),
    getPipeline: () => ({}),
    peekRenderRequest: () => state.renderRequested,
    consumeRenderRequest: () => { state.renderRequested = false; },
    requestRender: () => { state.renderRequested = true; },
    clearCaches: () => {},
    getModelBounds: () => null,
    render: () => {
      state.renderCalls++;
    },
  } as unknown as Renderer;
}

function ref<T>(current: T) { return { current }; }

function baseParams(renderer: Renderer): UseAnimationLoopParams {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  return {
    canvasRef: ref<HTMLCanvasElement | null>(canvas),
    rendererRef: ref<Renderer | null>(renderer),
    isInitialized: true,
    animationFrameRef: ref<number | null>(null),
    lastFrameTimeRef: ref(0),
    mouseIsDraggingRef: ref(false),
    activeToolRef: ref('select'),
    terrainClipYRef: ref<number | null>(null),
    hiddenEntitiesRef: ref(new Set<number>()),
    isolatedEntitiesRef: ref<Set<number> | null>(null),
    ghostExceptEntitiesRef: ref<Set<number> | null>(null),
    selectedEntityIdRef: ref<number | null>(null),
    selectedModelIndexRef: ref<number | undefined>(undefined),
    clearColorRef: ref<[number, number, number, number]>([1, 1, 1, 1]),
    visualEnhancementRef: ref({ enabled: false }),
    environmentRef: ref({}),
    sunShadowsRef: ref(null),
    sectionPlaneRef: ref({ axis: 'y', position: 0, enabled: false, flipped: false }),
    sectionRangeRef: ref<{ min: number; max: number } | null>(null),
    selectedEntityIdsRef: ref<Set<number> | undefined>(undefined),
    clashHighlightColorsRef: ref<Map<number, [number, number, number, number]> | null>(null),
    coordinateInfoRef: ref(undefined),
    isInteractingRef: ref(false),
    lastCameraStateRef: ref(null),
    updateCameraRotationRealtime: () => {},
    calculateScale: () => {},
    updateMeasurementScreenCoords: () => {},
    hasPendingMeasurements: () => false,
  } as unknown as UseAnimationLoopParams;
}

function Harness({ params }: { params: UseAnimationLoopParams }) {
  const rendererRef = useRef(params.rendererRef.current);
  useAnimationLoop({ ...params, rendererRef });
  return null;
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let warnings: unknown[][] = [];
const realWarn = console.warn;

beforeEach(() => {
  queued = [];
  now = 0;
  warnings = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    queued.push(cb);
    return queued.length;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => { queued = []; }) as typeof globalThis.cancelAnimationFrame;
});

afterEach(async () => {
  console.warn = realWarn;
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancel;
  for (const lift of covers.splice(0)) lift();
  for (const m of mounted.splice(0)) {
    await act(async () => { m.root.unmount(); });
    m.container.remove();
  }
});

async function mount(params: UseAnimationLoopParams): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => { root.render(<Harness params={params} />); });
}

describe('useAnimationLoop - covered by the Wall (#154)', () => {
  it('renders nothing while covered, and again after the cover lifts', async () => {
    const state: FakeRendererState = { renderCalls: 0, renderRequested: true, uploads: 0, queued: false };
    await mount(baseParams(fakeRenderer(state)));
    step();
    assert.equal(state.renderCalls, 1, 'precondition: uncovered, a dirty viewport renders');

    const lift = coverViewport();
    state.queued = true;
    for (let i = 0; i < 5; i++) { state.renderRequested = true; step(); }
    assert.equal(state.renderCalls, 1, 'no render behind the Wall');
    assert.equal(queued.length, 0, 'and no frame is armed at all');
    assert.equal(state.uploads, 0, 'no scene upload either');

    lift();
    assert.equal(queued.length, 1, 'the loop is armed again');
    step();
    assert.equal(state.renderCalls, 2, 'and draws what it owed');
  });

  it('does not start while covered, and starts when the cover lifts', async () => {
    const lift = coverViewport();
    const state: FakeRendererState = { renderCalls: 0, renderRequested: true, uploads: 0, queued: false };
    await mount(baseParams(fakeRenderer(state)));
    assert.equal(queued.length, 0, 'no frame is armed');
    step(); step();
    assert.equal(state.renderCalls, 0);
    lift();
    step();
    assert.equal(state.renderCalls, 1);
  });

  it('loses no state: a request made while covered is drawn on return, and a streaming queue drains', async () => {
    const state: FakeRendererState = { renderCalls: 0, renderRequested: false, uploads: 0, queued: false };
    const lift = coverViewport();
    await mount(baseParams(fakeRenderer(state)));
    state.renderRequested = true; // a mouse move, a theme change: the renderer keeps the flag
    state.queued = true;          // a mesh arrived
    step();
    assert.equal(state.uploads, 0);
    lift();
    step();
    assert.equal(state.renderCalls, 1);
    assert.equal(state.uploads, 1, 'the queued meshes upload once the view is shown');
  });

  it('owes one render on return even when nothing was dirtied meanwhile', async () => {
    const state: FakeRendererState = { renderCalls: 0, renderRequested: false, uploads: 0, queued: false };
    await mount(baseParams(fakeRenderer(state)));
    const lift = coverViewport();
    step();
    lift();
    step();
    assert.equal(state.renderCalls, 1, 'the view is drawn as it comes back into sight');
  });

  it('draws nothing in a frame that was already in flight when the Wall came up', async () => {
    const state: FakeRendererState = { renderCalls: 0, renderRequested: true, uploads: 0, queued: false };
    await mount(baseParams(fakeRenderer(state)));
    globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame; // the frame cannot be called back
    coverViewport();
    step();
    assert.equal(state.renderCalls, 0);
    assert.equal(queued.length, 0, 'and it does not arm another');
  });

  it('keeps the view covered until every cover is lifted', async () => {
    const state: FakeRendererState = { renderCalls: 0, renderRequested: true, uploads: 0, queued: false };
    await mount(baseParams(fakeRenderer(state)));
    const a = coverViewport();
    const b = coverViewport();
    a(); a();
    state.renderRequested = true; step();
    assert.equal(state.renderCalls, 0);
    b();
    step();
    assert.equal(state.renderCalls, 1);
  });

  it('leaves nothing armed after unmount while covered and lifted', async () => {
    const state: FakeRendererState = { renderCalls: 0, renderRequested: true, uploads: 0, queued: false };
    const lift = coverViewport();
    await mount(baseParams(fakeRenderer(state)));
    for (const m of mounted.splice(0)) { await act(async () => { m.root.unmount(); }); m.container.remove(); }
    lift();
    step();
    assert.equal(state.renderCalls, 0);
    assert.equal(queued.length, 0);
  });
});
