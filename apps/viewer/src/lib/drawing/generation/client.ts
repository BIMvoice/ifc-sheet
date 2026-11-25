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
 * Where no worker can run (Node, where the tests drive the hooks), the same
 * job runs in this realm (`runGenerateJob`). When the workers fail, the views
 * are drawn on the main thread one at a time, the page turning between two
 * (`main-thread-fallback.ts`, #863), and the failure is logged as text that
 * names it (`failure-text.ts`): a drawing that is slow to make is better than
 * none, and a page that freezes on it is not.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import type { GenerationReply, GenerationRequest } from './drawing-generation.worker';
import { packCovers, packMeshes, packSourceOf, packTransferables, type PackedMeshes, type PackSource } from './mesh-pack';
import { runGenerateJob, type GenerateJob, type ProgressFn } from './generate-job';
import { describeWorkerFailure, type WorkerFailureEvent } from './failure-text';
import { drawOnMainThreadIfSmall } from './main-thread-fallback';

/** The worker as the client uses it; a test installs an in-process one. */
export interface GenerationWorker {
  postMessage(message: GenerationRequest, transfer?: Transferable[]): void;
  onmessage: ((event: { data: GenerationReply }) => void) | null;
  onerror: ((event: WorkerFailureEvent) => void) | null;
  /** A reply that could not be read here (it never reaches `onmessage`, so its job would wait for the silence limit). */
  onmessageerror?: ((event: WorkerFailureEvent) => void) | null;
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
 * A worker is taken for dead when the job it is working on goes this long
 * without a word from it (#863). A worker at work says so: when it starts a
 * job, at most every 2 s from inside the generator's loops (per mesh, per
 * element, per line) and while it awaits. So silence means one call that does
 * not come back to the loops for this long: the outline of one mesh in wasm,
 * or one mesh rasterized. Measured in the production build with two models
 * (the worker reports it with each drawing, `quietMs`): at most 0.07 s on the
 * 343 MB O-S1 model, 0.5 s on skolebygg (56 MB), 1.4 s on Holter (177 MB),
 * and 7.1 s on skolebygg with the machine loaded ten times over. The limit is
 * 60 s, eight times the loaded figure, plus 0.1 ms per vertex of the job's
 * largest mesh, whose one call is the longest. A job queued behind others is
 * not timed: only the one the worker is on.
 */
export const SILENCE_BASE_MS = 60_000;
/** Added per vertex of the job's largest mesh. */
export const SILENCE_PER_VERTEX_MS = 0.1;
export const SILENCE_MAX_MS = 300_000;

export function silenceLimitMs(largestMeshVertices: number): number {
  return Math.min(SILENCE_MAX_MS, SILENCE_BASE_MS + largestMeshVertices * SILENCE_PER_VERTEX_MS);
}
/** An idle pool is let go after this long, returning its memory to the OS. */
export const IDLE_TERMINATE_MS = 60_000;

interface Slot {
  worker: GenerationWorker;
  inFlight: number;
  /** The pack this worker holds, or is being sent. */
  loading: { record: PackRecord; done: Promise<void> } | null;
  /** The jobs sent to this worker, in the order it works them; the first is the one it is on. */
  jobs: number[];
  /** Fires when the job the worker is on has heard nothing for its limit ({@link watch}). */
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface Pending {
  resolve: (drawing: Drawing2D) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressFn;
  /** How long this job lets its worker stay silent while it is the one being worked on ({@link silenceLimitMs}). */
  silenceMs: number;
  slot: Slot;
  /** Pack the meshes for `slot`'s worker if it lacks them, then send it this job. */
  send: (slot: Slot) => Promise<void>;
  /** Sent again once already, to a fresh worker, after its first worker went silent on it. */
  retried: boolean;
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
/**
 * Worker failures in a row, with no drawing made by a worker in between; after {@link MAX_FAILURES}
 * the session stops trying the workers. One crash or one silent worker is one failure, however many
 * jobs it held.
 */
let failures = 0;
const MAX_FAILURES = 2;

/** The error a job is rejected with when its worker is gone; the failure was counted once, where it was found. */
class WorkerCrash extends Error {
  override name = 'WorkerCrash';
}

/** Whether the session's switch to the main thread has been logged; it is said once, not for every view after it. */
let gaveUpLogged = false;

function terminatePool(): void {
  for (const slot of slots) {
    clearTimeout(slot.timer);
    slot.worker.terminate();
  }
  slots = [];
  if (livePack) livePack.packed = null;
  livePack = null;
}

/** A worker failed for good (an error event): every job in flight is rejected, and the crash counts as one failure whatever the number of jobs. */
function failAll(message: string): void {
  const outstanding = [...pending.values()];
  pending.clear();
  terminatePool();
  failures++;
  for (const job of outstanding) job.reject(new WorkerCrash(message));
}

/**
 * Time the job `slot`'s worker is on, from now. Called whenever the worker says anything and whenever
 * the job it is on changes, so a job is timed only while it is the one being worked on.
 */
function watch(slot: Slot): void {
  clearTimeout(slot.timer);
  slot.timer = undefined;
  const id = slot.jobs[0];
  const head = id === undefined ? undefined : pending.get(id);
  if (!head) return;
  slot.timer = setTimeout(() => {
    // Messages the worker sent while this page was busy may still be waiting to be read: they go first,
    // and any of them re-arms the watch, which clears this verdict before it is given.
    slot.timer = setTimeout(() => replaceSilent(slot, id, head.silenceMs), 0);
  }, head.silenceMs);
}

/**
 * `slot`'s worker said nothing for `silenceMs` while on job `id`: it is let go and a fresh worker takes
 * its place and its jobs, in order. The job it went silent on is tried once more on the fresh worker;
 * silent there too, it is drawn on the main thread. The other views stay with the workers (#863).
 */
function replaceSilent(slot: Slot, id: number, silenceMs: number): void {
  const index = slots.indexOf(slot);
  const factory = workerFactory;
  if (index < 0 || !factory) return;
  failures++;
  clearTimeout(slot.timer);
  slot.worker.terminate();
  const fresh = newSlot(factory);
  slots[index] = fresh;
  // The jobs sent to the silent worker, then those still being packed for it.
  const moving = [...slot.jobs, ...[...pending.entries()].filter(([jobId, job]) => job.slot === slot && !slot.jobs.includes(jobId)).map(([jobId]) => jobId)];
  const message = `drawing generation worker silent for ${silenceMs / 1000} s (job ${id})`;
  console.warn(`[drawing-generation] ${message}; it is replaced by a fresh worker, which takes its ${moving.length} job(s)`);
  for (const jobId of moving) {
    const job = pending.get(jobId);
    if (!job) continue;
    if (jobId === id && job.retried) {
      pending.delete(jobId);
      job.reject(new WorkerCrash(`${message}, the second time; the view is drawn on the main thread`));
      continue;
    }
    if (jobId === id) job.retried = true;
    job.slot = fresh;
    fresh.inFlight++;
    job.send(fresh).catch((error: unknown) => {
      if (pending.get(jobId)?.slot !== fresh) return;
      pending.delete(jobId);
      fresh.inFlight--;
      job.reject(error instanceof Error ? error : new Error(String(error)));
    });
  }
}

function onReply(slot: Slot, data: GenerationReply): void {
  const job = pending.get(data.id);
  if (job && (data.type === 'progress' || data.type === 'part' || data.type === 'alive')) {
    if (data.type === 'progress') job.onProgress?.(data.stage, data.progress);
    else if (data.type === 'part') {
      const list = job.parts.get(data.key);
      if (list) for (const item of data.items) list.push(item);
      else job.parts.set(data.key, data.items);
    }
  } else if (job && (data.type === 'done' || data.type === 'error')) {
    pending.delete(data.id);
    job.slot.inFlight--;
    // A worker that came near its limit is worth knowing about before it is passed (#863).
    if (data.type === 'done' && (data.quietMs ?? 0) > job.silenceMs / 4) {
      console.info(`[drawing-generation] job ${data.id}: the worker went ${(data.quietMs ?? 0) / 1000} s without a word (limit ${job.silenceMs / 1000} s)`);
    }
    if (data.type === 'done') job.resolve(job.parts.size ? { ...data.drawing, ...Object.fromEntries(job.parts) } : data.drawing);
    else job.reject(new Error(data.error));
    scheduleIdle();
  }
  if (data.type === 'done' || data.type === 'error') slot.jobs = slot.jobs.filter((jobId) => jobId !== data.id);
  // Any word shows the worker alive; a finished job hands the watch to the next one.
  watch(slot);
}

function newSlot(factory: WorkerFactory): Slot {
  const worker = factory();
  const slot: Slot = { worker, inFlight: 0, loading: null, jobs: [], timer: undefined };
  worker.onmessage = ({ data }) => { if (slots.includes(slot)) onReply(slot, data); };
  worker.onerror = (event) => failAll(`drawing generation worker failed: ${describeWorkerFailure(event)}`);
  worker.onmessageerror = (event) => failAll(`a reply of the drawing generation worker could not be read: ${describeWorkerFailure(event)}`);
  return slot;
}

function ensurePool(factory: WorkerFactory): Slot[] {
  if (slots.length) return slots;
  const size = poolSize();
  for (let i = 0; i < size; i++) slots.push(newSlot(factory));
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
    if (!slots.includes(slot)) throw new WorkerCrash('drawing generation worker was let go while packing');
    if (previous) slot.worker.postMessage({ type: 'drop', packId: previous.id });
    if (livePack && livePack !== record) livePack.packed = null;
    livePack = record;
    if (shareable) slot.worker.postMessage({ type: 'pack', packId: record.id, pack });
    else {
      // Transferred: this realm's copy is gone, and the one worker holds the only one (a fresh worker gets a new pack).
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

/** Vertices of the largest of `meshes`: its one outline or raster call is the longest the worker cannot speak during. */
function largestMeshVertices(meshes: readonly MeshData[]): number {
  let most = 0;
  for (const mesh of meshes) most = Math.max(most, mesh.positions.length / 3);
  return most;
}

/**
 * Generate one drawing, off the main thread where a worker can run.
 * `outlineFn` is this realm's `meshOutline2d` binding, used only when the job
 * runs here; the workers load their own.
 */
export async function generateDrawing(request: DrawingRequest, outlineFn: MeshOutline2dFn | undefined): Promise<Drawing2D> {
  const { allMeshes, meshes, config, options, profiles, axonometric, onProgress } = request;
  const job: GenerateJob = { meshes, config, options, profiles, axonometric };
  const factory = workerFactory;
  if (!factory) return runGenerateJob(job, outlineFn, onProgress);
  if (failures >= MAX_FAILURES) {
    if (!gaveUpLogged) {
      gaveUpLogged = true;
      console.warn(`[drawing-generation] the worker failed ${failures} times in a row; this session draws small views on the main thread, one at a time, and says a larger one could not be drawn`);
    }
    return drawOnMainThreadIfSmall(job, outlineFn, onProgress, `the drawing worker failed ${failures} times in a row`);
  }
  try {
    clearTimeout(idleTimer);
    const pool = ensurePool(factory);
    const { record, indices } = packFor(allMeshes, meshes);
    const slot = pool.reduce((a, b) => (b.inFlight < a.inFlight ? b : a));
    // Counted before packing, so neither the idle timer nor the next request treats this worker as free.
    slot.inFlight++;
    const id = nextId++;
    const send = async (target: Slot): Promise<void> => {
      try {
        await loadPack(target, record, allMeshes);
      } catch (error) {
        // Moved to a fresh worker while packing for this one: the move sends it there.
        if (pending.get(id)?.slot !== target) return;
        throw error;
      }
      if (pending.get(id)?.slot !== target) return;
      target.jobs.push(id);
      // A copy each time: the indices cross by transfer, and a job may be sent again to a fresh worker.
      const meshIndices = indices.slice();
      target.worker.postMessage({ type: 'generate', id, packId: record.id, meshIndices, config, options, profiles, axonometric }, [meshIndices.buffer]);
      if (target.jobs[0] === id) watch(target);
    };
    const done = new Promise<Drawing2D>((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress, silenceMs: silenceLimitMs(largestMeshVertices(meshes)), slot, send, retried: false, parts: new Map() });
    });
    // If the pool goes down while this job is still packing, nothing awaits `done`: its rejection is the crash already counted.
    done.catch(() => {});
    try {
      await send(slot);
    } catch (error) {
      if (pending.get(id)?.slot === slot) { pending.delete(id); slot.inFlight--; }
      throw error;
    }
    const drawing = await done;
    failures = 0;
    return drawing;
  } catch (error) {
    // A crash or a silent worker was counted once where it was found; a job that failed by itself counts here.
    if (!(error instanceof WorkerCrash)) failures++;
    // The cause goes into the text: a copied console log keeps the text and may drop the object after it (#863).
    console.warn(`[drawing-generation] worker unavailable, generating on the main thread: ${describeWorkerFailure(error)}`, error);
    return drawOnMainThreadIfSmall(job, outlineFn, onProgress, `the drawing worker failed (${describeWorkerFailure(error)})`);
  }
}

/**
 * Tests only: install a worker factory (an in-process one runs the real
 * handler) and whether packs are shared, or pass null to restore the
 * defaults. Returns the factory installed before.
 */
export function __setGenerationWorkerFactoryForTest(factory: WorkerFactory | null, shared = false): WorkerFactory | null {
  const previous = workerFactory;
  clearTimeout(idleTimer);
  failAll('worker factory replaced');
  failures = 0;
  gaveUpLogged = false;
  workerFactory = factory ?? defaultWorkerFactory();
  shareable = factory ? shared : typeof SharedArrayBuffer !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  return previous;
}
