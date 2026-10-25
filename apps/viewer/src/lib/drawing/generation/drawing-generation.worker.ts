/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Worker host for drawing generation (#154).
 *
 * `Drawing2DGenerator.generate` is synchronous: cutting, polygon building,
 * projection, the hidden-line raster and line merging run in one call. On a
 * large model that is seconds per view, and on the main thread every view of
 * a set ran back to back in one task, so the page froze while the Wall drew.
 * Here it runs off the page: the main thread sends the model's meshes once
 * (packed, by transfer, see `mesh-pack.ts`) and then one small request per
 * view, and each drawing comes back as soon as it is cut.
 *
 * The worker keeps the packs it was sent until it is told to drop them, so a
 * later view, or a regenerated one, sends only mesh indices.
 */

import type { Drawing2D, ProfileEntry, SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { MeshOutline2dFn } from '@/hooks/meshOutlineProvider';
import { unpackMeshes, type PackedMeshes } from './mesh-pack';
import { runGenerateJob, type AxonometricJob, type GenerateJobOptions } from './generate-job';

export type GenerationRequest =
  | { type: 'pack'; packId: number; pack: PackedMeshes }
  | { type: 'drop'; packId: number }
  | {
    type: 'generate';
    id: number;
    packId: number;
    meshIndices: Uint32Array;
    config: SectionConfig;
    options: GenerateJobOptions;
    profiles?: ProfileEntry[];
    axonometric?: AxonometricJob;
  };

export type GenerationReply =
  | { type: 'progress'; id: number; stage: string; progress: number }
  /** A slice of one of the drawing's long lists, sent ahead of `done` (see {@link postDrawing}). */
  | { type: 'part'; id: number; key: string; items: unknown[] }
  | { type: 'done'; id: number; drawing: Drawing2D }
  | { type: 'error'; id: number; error: string };

const packs = new Map<number, MeshData[]>();

/**
 * The `meshOutline2d` binding, from this realm's own wasm instance. The wasm
 * module is loaded only when a job asks for outlines, and once.
 */
let outlineFn: Promise<MeshOutline2dFn | undefined> | null = null;

type OutlineLoader = () => Promise<MeshOutline2dFn | undefined>;

const loadOutlineDefault: OutlineLoader = async () => {
  const { GeometryProcessor } = await import('@ifc-lite/geometry');
  const processor = new GeometryProcessor();
  await processor.init();
  const wasm = await import('@ifc-lite/wasm');
  return (wasm as unknown as { meshOutline2d?: MeshOutline2dFn }).meshOutline2d;
};

let loadOutline: OutlineLoader = loadOutlineDefault;

/** Tests only: where the outline binding comes from. Pass null to restore the default. */
export function __setOutlineLoaderForTest(loader: OutlineLoader | null): void {
  loadOutline = loader ?? loadOutlineDefault;
  outlineFn = null;
}

type Post = (reply: GenerationReply) => void;

/** Items per `part` message: small enough that the main thread reads each in a few milliseconds. */
export const PART_SIZE = 5_000;

/**
 * Post a drawing in slices. A message is deserialised on the main thread in
 * one go, and a large plan's lines alone take a few hundred milliseconds to
 * read back; slices of {@link PART_SIZE} items arrive as separate tasks. Every
 * top-level list longer than one slice goes ahead in `part` messages, in
 * order, and `done` carries the rest of the drawing with those lists empty.
 */
export function postDrawing(id: number, drawing: Drawing2D, post: Post): void {
  const rest: Record<string, unknown> = { ...drawing };
  for (const [key, value] of Object.entries(drawing)) {
    if (!Array.isArray(value) || value.length <= PART_SIZE) continue;
    for (let i = 0; i < value.length; i += PART_SIZE) post({ type: 'part', id, key, items: value.slice(i, i + PART_SIZE) });
    rest[key] = [];
  }
  post({ type: 'done', id, drawing: rest as unknown as Drawing2D });
}

/** Serialises jobs: one drawing at a time, in the order they were asked for. */
let queue: Promise<void> = Promise.resolve();

export function handle(request: GenerationRequest, post: Post): Promise<void> {
  queue = queue.then(() => run(request, post)).catch((error: unknown) => {
    console.error('[drawing-generation] job failed outside its handler', error);
  });
  return queue;
}

async function run(request: GenerationRequest, post: Post): Promise<void> {
  if (request.type === 'pack') {
    packs.set(request.packId, unpackMeshes(request.pack));
    return;
  }
  if (request.type === 'drop') {
    packs.delete(request.packId);
    return;
  }
  const { id, packId, meshIndices, config, options, profiles, axonometric } = request;
  try {
    const all = packs.get(packId);
    if (!all) throw new Error(`drawing generation: mesh pack ${packId} is not loaded`);
    const meshes = Array.from(meshIndices, (i) => all[i]);
    let outline: MeshOutline2dFn | undefined;
    if (options.outline) {
      outlineFn ??= loadOutline();
      outline = await outlineFn;
      // Without the binding the generator would fall back to the TS silhouette and
      // draw differently from the main thread, so the job fails and the client runs it there.
      if (!outline) throw new Error('drawing generation: the meshOutline2d binding is not available in the worker');
    }
    const drawing = await runGenerateJob({ meshes, config, options, profiles, axonometric }, outline,
      (stage, progress) => post({ type: 'progress', id, stage, progress }));
    postDrawing(id, drawing, post);
  } catch (error) {
    post({ type: 'error', id, error: error instanceof Error ? error.message : String(error) });
  }
}

// Wire up only inside a real worker realm; under test the module is imported and `handle` called directly.
const scope = globalThis as unknown as { WorkerGlobalScope?: unknown; addEventListener?: (type: string, fn: (event: MessageEvent<GenerationRequest>) => void) => void; postMessage?: (message: unknown) => void };
if (typeof scope.WorkerGlobalScope !== 'undefined' && typeof scope.addEventListener === 'function') {
  scope.addEventListener('message', (event) => {
    void handle(event.data, (reply) => scope.postMessage?.(reply));
  });
}
