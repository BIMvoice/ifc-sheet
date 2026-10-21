/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The meshes the drawing generator reads, packed into a few flat buffers so
 * they can be handed to the generation worker by transfer (#154).
 *
 * A `MeshData[]` posted as it is would be structured-cloned: one copy per
 * typed array, all serialised on the main thread, for every view. Packed, the
 * model's meshes cross once per geometry, as a handful of transferred
 * buffers, and each view after that sends only the indices of the meshes it
 * draws.
 *
 * Where the page is cross-origin isolated the buffers are shared, so several
 * workers read one copy; elsewhere they are transferred to the one worker.
 *
 * Only what `Drawing2DGenerator.generate` reads is carried: positions,
 * indices, the per-element origin, the identity fields (express id, IFC type,
 * model index), and what a cut polygon is coloured and layered by (colour,
 * material id), plus the geometry class. Normals are not read by the
 * generator (only the colour raster of a 3D view reads them), so they cross
 * empty. Numbers that are doubles in `MeshData` stay doubles here, so the
 * worker computes on the same values the main thread would.
 */

import type { MeshData } from '@ifc-lite/geometry';

/** Fields per mesh in {@link PackedMeshes.ranges}: position start / length, index start / length. */
const RANGE_STRIDE = 4;
const EMPTY_NORMALS = new Float32Array(0);

export interface PackedMeshes {
  count: number;
  positions: Float32Array;
  indices: Uint32Array;
  /** Per mesh: position start, position length, index start, index length (elements). */
  ranges: Float64Array;
  expressId: Float64Array;
  /** NaN where the mesh carries none. */
  modelIndex: Float64Array;
  /** NaN where the mesh carries none. */
  materialId: Float64Array;
  /** NaN where the mesh carries none. */
  geometryClass: Float64Array;
  /** Four per mesh. */
  color: Float64Array;
  /** Three per mesh; meaningful where `hasOrigin` is 1. */
  origin: Float64Array;
  hasOrigin: Uint8Array;
  ifcType: (string | null)[];
}

/** The buffers of an unshared pack, for `postMessage`'s transfer list. */
export function packTransferables(pack: PackedMeshes): ArrayBuffer[] {
  return [pack.positions, pack.indices, pack.ranges, pack.expressId, pack.modelIndex, pack.materialId,
    pack.geometryClass, pack.color, pack.origin, pack.hasOrigin].map((a) => a.buffer as ArrayBuffer);
}

/** Hands control back to the event loop, so a long copy does not become one long task. */
export function yieldToEventLoop(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Floats copied between yields: about 16 MB of positions. */
const COPY_SLICE = 4_000_000;

type TypedArrayCtor<T> = { new (length: number): T; new (buffer: ArrayBufferLike): T; BYTES_PER_ELEMENT: number };

/** A typed array of `length` elements, over a `SharedArrayBuffer` when `shared`. */
function alloc<T>(Ctor: TypedArrayCtor<T>, length: number, shared: boolean): T {
  return shared ? new Ctor(new SharedArrayBuffer(length * Ctor.BYTES_PER_ELEMENT)) : new Ctor(length);
}

/**
 * Pack `meshes`, yielding to the event loop between slices of about 16 MB so
 * the copy never blocks the page for long. With `shared`, the buffers are
 * `SharedArrayBuffer`s, which every worker reads without a copy.
 */
export async function packMeshes(meshes: readonly MeshData[], shared = false): Promise<PackedMeshes> {
  const count = meshes.length;
  let positionTotal = 0;
  let indexTotal = 0;
  for (const mesh of meshes) {
    positionTotal += mesh.positions.length;
    indexTotal += mesh.indices.length;
  }
  const pack: PackedMeshes = {
    count,
    positions: alloc(Float32Array, positionTotal, shared),
    indices: alloc(Uint32Array, indexTotal, shared),
    ranges: alloc(Float64Array, count * RANGE_STRIDE, shared),
    expressId: alloc(Float64Array, count, shared),
    modelIndex: alloc(Float64Array, count, shared),
    materialId: alloc(Float64Array, count, shared),
    geometryClass: alloc(Float64Array, count, shared),
    color: alloc(Float64Array, count * 4, shared),
    origin: alloc(Float64Array, count * 3, shared),
    hasOrigin: alloc(Uint8Array, count, shared),
    ifcType: new Array<string | null>(count),
  };
  let p = 0;
  let q = 0;
  let sinceYield = 0;
  for (let i = 0; i < count; i++) {
    const mesh = meshes[i];
    pack.positions.set(mesh.positions, p);
    pack.indices.set(mesh.indices, q);
    const r = i * RANGE_STRIDE;
    pack.ranges[r] = p;
    pack.ranges[r + 1] = mesh.positions.length;
    pack.ranges[r + 2] = q;
    pack.ranges[r + 3] = mesh.indices.length;
    p += mesh.positions.length;
    q += mesh.indices.length;
    pack.expressId[i] = mesh.expressId;
    pack.modelIndex[i] = mesh.modelIndex ?? Number.NaN;
    pack.materialId[i] = mesh.materialId ?? Number.NaN;
    pack.geometryClass[i] = mesh.geometryClass ?? Number.NaN;
    for (let c = 0; c < 4; c++) pack.color[i * 4 + c] = mesh.color[c];
    if (mesh.origin) {
      pack.hasOrigin[i] = 1;
      for (let c = 0; c < 3; c++) pack.origin[i * 3 + c] = mesh.origin[c];
    }
    pack.ifcType[i] = mesh.ifcType ?? null;
    sinceYield += mesh.positions.length + mesh.indices.length;
    if (sinceYield >= COPY_SLICE) {
      sinceYield = 0;
      await yieldToEventLoop();
    }
  }
  return pack;
}

const orUndefined = (value: number): number | undefined => (Number.isNaN(value) ? undefined : value);

/** The meshes of a pack, as views into its buffers (no copy). */
export function unpackMeshes(pack: PackedMeshes): MeshData[] {
  const out = new Array<MeshData>(pack.count);
  for (let i = 0; i < pack.count; i++) {
    const r = i * RANGE_STRIDE;
    const mesh: MeshData = {
      expressId: pack.expressId[i],
      positions: pack.positions.subarray(pack.ranges[r], pack.ranges[r] + pack.ranges[r + 1]),
      normals: EMPTY_NORMALS,
      indices: pack.indices.subarray(pack.ranges[r + 2], pack.ranges[r + 2] + pack.ranges[r + 3]),
      color: [pack.color[i * 4], pack.color[i * 4 + 1], pack.color[i * 4 + 2], pack.color[i * 4 + 3]],
    };
    const ifcType = pack.ifcType[i];
    if (ifcType !== null) mesh.ifcType = ifcType;
    const modelIndex = orUndefined(pack.modelIndex[i]);
    if (modelIndex !== undefined) mesh.modelIndex = modelIndex;
    const materialId = orUndefined(pack.materialId[i]);
    if (materialId !== undefined) mesh.materialId = materialId;
    const geometryClass = orUndefined(pack.geometryClass[i]);
    if (geometryClass !== undefined) mesh.geometryClass = geometryClass;
    if (pack.hasOrigin[i]) mesh.origin = [pack.origin[i * 3], pack.origin[i * 3 + 1], pack.origin[i * 3 + 2]];
    out[i] = mesh;
  }
  return out;
}

/**
 * What a pack was made from, mesh by mesh: the object and the arrays it held.
 * A geometry edit that swaps a mesh's arrays or its origin, a mesh for
 * another, or a colour edit makes the pack stale, and {@link packCovers}
 * reports it. Vertex data edited in place inside the same array is not seen.
 */
export interface PackSource {
  index: Map<MeshData, number>;
  positions: Float32Array[];
  indices: Uint32Array[];
  origin: (readonly number[] | undefined)[];
  /** Colour, express id and type as they were packed: values, since a colour can be edited in place. */
  color: Float64Array;
  expressId: number[];
  ifcType: (string | undefined)[];
}

export function packSourceOf(meshes: readonly MeshData[]): PackSource {
  const index = new Map<MeshData, number>();
  meshes.forEach((mesh, i) => index.set(mesh, i));
  return {
    index,
    positions: meshes.map((m) => m.positions),
    indices: meshes.map((m) => m.indices),
    origin: meshes.map((m) => m.origin),
    color: Float64Array.from(meshes.flatMap((m) => [m.color[0], m.color[1], m.color[2], m.color[3]])),
    expressId: meshes.map((m) => m.expressId),
    ifcType: meshes.map((m) => m.ifcType),
  };
}

/**
 * The pack positions of `meshes`, or `null` when any of them is not in the
 * pack as it is now (a new mesh, or one whose arrays were replaced).
 */
export function packCovers(source: PackSource, meshes: readonly MeshData[]): Uint32Array | null {
  const out = new Uint32Array(meshes.length);
  for (let k = 0; k < meshes.length; k++) {
    const mesh = meshes[k];
    const i = source.index.get(mesh);
    if (i === undefined) return null;
    if (source.positions[i] !== mesh.positions || source.indices[i] !== mesh.indices
      || source.origin[i] !== mesh.origin || source.expressId[i] !== mesh.expressId || source.ifcType[i] !== mesh.ifcType) return null;
    for (let c = 0; c < 4; c++) if (source.color[i * 4 + c] !== mesh.color[c]) return null;
    out[k] = i;
  }
  return out;
}
