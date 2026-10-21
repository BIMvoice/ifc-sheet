/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Client for {@link ./drawing-generation.worker.ts}: every view's drawing is
 * generated off the main thread (#154).
 *
 * The model's meshes go to the workers once per geometry, packed
 * (`mesh-pack.ts`); a view then sends only the indices of the meshes it
 * draws, its section config and its profiles. Drawings come back one view at
 * a time, so each sheet can show as soon as its own views are ready.
 *
 * Where the page is cross-origin isolated, the pack is shared memory and a
 * small pool of workers cuts several views at once, so one heavy view does
 * not hold up the others. Elsewhere one worker gets the pack by transfer.
 *
 * Where no worker can run (Node, where the tests drive the hooks), or when
 * the workers fail, the same job runs in this realm (`runGenerateJob`), as it
 * always did: a drawing that is slow to make is better than none.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import type { GenerationReply, GenerationRequest } from './drawing-generation.worker';
import { packCovers, packMeshes, packSourceOf, packTransferables, type PackedMeshes, type PackSource } from './mesh-pack';
import { runGenerateJob, type GenerateJob, type ProgressFn } from './generate-job';

/** The worker as the client uses it; a test installs an in-process one. */
export interface GenerationWorker {
  postMessage(message: GenerationRequest, transfer?: Transferable[]): void;
  onmessage: ((event: { data: GenerationReply }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
}

type WorkerFactory = () => GenerationWorker;

function defaultWorkerFactory(): WorkerFactory | null {
  if (typeof Worker === 'undefined') return null;
  return () => new Worker(new URL('./drawing-generation.worker.ts', import.meta.url), { type: 'module' }) as unknown as GenerationWorker;
}

let workerFactory: WorkerFactory | null = defaultWorkerFactory();
/** Whether packs go to the workers as shared memory (and so to more than one worker). */
let shareable = typeof SharedArrayBuffer !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

/** Workers in the pool when the pack can be shared: a few, leaving cores for the page and the 3D view. */
function poolSize(): number {
  if (!shareable) return 1;
  const cores = (globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency ?? 2;
  return Math.max(1, Math.min(3, cores - 2));
}

/**
 * A worker that has gone this long without a word (no progress, no reply) is
 * taken for dead: one the OS killed for memory fires neither `message` nor
 * `error`, and its jobs would otherwise never settle.
 */
export const SILENCE_TIMEOUT_MS = 300_000;
/** An idle pool is let go after this long, returning its memory to the OS. */
export const IDLE_TERMINATE_MS = 60_000;

interface Slot {
  worker: GenerationWorker;
  inFlight: number;
  /** The pack this worker holds, or is being sent. */
  loading: { record: PackRecord; done: Promise<void> } | null;
}

interface Pending {
  resolve: (drawing: Drawing2D) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressFn;
  timer: ReturnType<typeof setTimeout>;
  slot: Slot;
  /** The lists that arrived in `part` messages, by drawing key. */
  parts: Map<string, unknown[]>;
}

interface PackRecord {
  id: number;
  source: PackSource;
  /** The packed meshes, while the pool may still need them (a shared pack is kept for every worker). */
  packed: Promise<PackedMeshes> | null;
}

let slots: Slot[] = [];
let nextId = 1;
const pending = new Map<number, Pending>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;
/** The packs by the mesh array they were made from. */
const packs = new WeakMap<readonly MeshData[], PackRecord>();
/** The pack the pool was last sent, so it can be let go with the pool. */
let livePack: PackRecord | null = null;
/** Worker failures in a row; after {@link MAX_FAILURES} the session stops trying the workers. */
let failures = 0;
const MAX_FAILURES = 2;

function terminatePool(): void {
  for (const slot of slots) slot.worker.terminate();
  slots = [];
  if (livePack) livePack.packed = null;
  livePack = null;
}

function failAll(message: string): void {
  const outstanding = [...pending.values()];
  pending.clear();
  terminatePool();
  for (const job of outstanding) {
    clearTimeout(job.timer);
    job.reject(new Error(message));
  }
}

function armSilence(id: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => failAll(`drawing generation worker silent for ${SILENCE_TIMEOUT_MS / 1000} s (job ${id})`), SILENCE_TIMEOUT_MS);
}

function onReply(data: GenerationReply): void {
  const job = pending.get(data.id);
  if (!job) return;
  clearTimeout(job.timer);
  if (data.type === 'progress' || data.type === 'part') {
    job.timer = armSilence(data.id);
    if (data.type === 'progress') job.onProgress?.(data.stage, data.progress);
    else {
      const list = job.parts.get(data.key);
      if (list) for (const item of data.items) list.push(item);
      else job.parts.set(data.key, data.items);
    }
    return;
  }
  pending.delete(data.id);
  job.slot.inFlight--;
  if (data.type === 'done') job.resolve(job.parts.size ? { ...data.drawing, ...Object.fromEntries(job.parts) } : data.drawing);
  else job.reject(new Error(data.error));
  scheduleIdle();
}

function ensurePool(factory: WorkerFactory): Slot[] {
  if (slots.length) return slots;
  const size = poolSize();
  for (let i = 0; i < size; i++) {
    const worker = factory();
    worker.onmessage = ({ data }) => onReply(data);
    worker.onerror = (event) => failAll(event.message || 'drawing generation worker failed');
    slots.push({ worker, inFlight: 0, loading: null });
  }
  return slots;
}

function scheduleIdle(): void {
  clearTimeout(idleTimer);
  if (pending.size > 0) return;
  idleTimer = setTimeout(() => {
    if (pending.size === 0) terminatePool();
  }, IDLE_TERMINATE_MS);
}

/** The pack record for `all`, made afresh when it no longer covers `meshes`. */
function packFor(all: readonly MeshData[], meshes: readonly MeshData[]): { record: PackRecord; indices: Uint32Array } {
  let record = packs.get(all);
  let indices = record ? packCovers(record.source, meshes) : null;
  if (!record || !indices) {
    record = { id: nextId++, source: packSourceOf(all), packed: null };
    packs.set(all, record);
    indices = packCovers(record.source, meshes);
    if (!indices) throw new Error('drawing generation: the drawn meshes are not among the model meshes');
  }
  return { record, indices };
}

/** Make sure `slot`'s worker holds `record`'s meshes; the pack it held before is dropped there. */
function loadPack(slot: Slot, record: PackRecord, all: readonly MeshData[]): Promise<void> {
  if (slot.loading?.record === record) return slot.loading.done;
  const previous = slot.loading?.record ?? null;
  const done = (async () => {
    record.packed ??= packMeshes(all, shareable);
    const pack = await record.packed;
    if (!slots.includes(slot)) throw new Error('drawing generation worker was let go while packing');
    if (previous) slot.worker.postMessage({ type: 'drop', packId: previous.id });
    if (livePack && livePack !== record) livePack.packed = null;
    livePack = record;
    if (shareable) slot.worker.postMessage({ type: 'pack', packId: record.id, pack });
    else {
      // Transferred: this realm's copy is gone, and the one worker holds the only one.
      record.packed = null;
      slot.worker.postMessage({ type: 'pack', packId: record.id, pack }, packTransferables(pack));
    }
  })();
  slot.loading = { record, done };
  done.catch(() => { if (slot.loading?.done === done) slot.loading = null; });
  return done;
}

export interface DrawingRequest extends Omit<GenerateJob, 'meshes'> {
  /** Every mesh of the model the drawing is cut from (the pack is made of these, once). */
  allMeshes: readonly MeshData[];
  /** The meshes this drawing draws: a subset of `allMeshes`, by identity. */
  meshes: MeshData[];
  onProgress?: ProgressFn;
}

/**
 * Generate one drawing, off the main thread where a worker can run.
 * `outlineFn` is this realm's `meshOutline2d` binding, used only when the job
 * runs here; the workers load their own.
 */
export async function generateDrawing(request: DrawingRequest, outlineFn: MeshOutline2dFn | undefined): Promise<Drawing2D> {
  const { allMeshes, meshes, config, options, profiles, onProgress } = request;
  const job: GenerateJob = { meshes, config, options, profiles };
  const factory = workerFactory;
  if (!factory || failures >= MAX_FAILURES) return runGenerateJob(job, outlineFn, onProgress);
  try {
    clearTimeout(idleTimer);
    const pool = ensurePool(factory);
    const { record, indices } = packFor(allMeshes, meshes);
    const slot = pool.reduce((a, b) => (b.inFlight < a.inFlight ? b : a));
    // Counted before packing, so neither the idle timer nor the next request treats this worker as free.
    slot.inFlight++;
    const id = nextId++;
    const done = new Promise<Drawing2D>((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress, timer: armSilence(id), slot, parts: new Map() });
    });
    try {
      await loadPack(slot, record, allMeshes);
    } catch (error) {
      const held = pending.get(id);
      if (held) { clearTimeout(held.timer); pending.delete(id); slot.inFlight--; }
      throw error;
    }
    slot.worker.postMessage({ type: 'generate', id, packId: record.id, meshIndices: indices, config, options, profiles }, [indices.buffer]);
    const drawing = await done;
    failures = 0;
    return drawing;
  } catch (error) {
    failures++;
    console.warn('[drawing-generation] worker unavailable, generating on the main thread:', error);
    return runGenerateJob(job, outlineFn, onProgress);
  }
}

/**
 * Tests only: install a worker factory (an in-process one runs the real
 * handler) and whether packs are shared, or pass null to restore the
 * defaults. Returns the factory installed before.
 */
export function __setGenerationWorkerFactoryForTest(factory: WorkerFactory | null, shared = false): WorkerFactory | null {
  const previous = workerFactory;
  failAll('worker factory replaced');
  failures = 0;
  workerFactory = factory ?? defaultWorkerFactory();
  shareable = factory ? shared : typeof SharedArrayBuffer !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  return previous;
}
