/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An element's box from its meshes, world metres in the frame the meshes are
 * in. The set's extent and the proposed sections' rooms and stairs are
 * measured with it, in the browser and headless alike.
 */

import { NORMAL_COORD_THRESHOLD_M, type MeshData } from '@ifc-lite/geometry';

/** A point in the meshes' frame, metres. */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** An axis-aligned box in the meshes' frame, metres. */
export interface BoundingBox3D {
  min: Point3D;
  max: Point3D;
}

/**
 * Maximum coordinate threshold for valid geometry (10km).
 * Coordinates beyond this are likely corrupted or unshifted original coordinates.
 * Shared with `CoordinateHandler` and `localParsingUtils` — see
 * `NORMAL_COORD_THRESHOLD_M`.
 */
const MAX_VALID_COORD = NORMAL_COORD_THRESHOLD_M;

/**
 * Check if a vertex coordinate is valid (finite and within reasonable bounds)
 */
export function isValidCoord(x: number, y: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) &&
    Math.abs(x) < MAX_VALID_COORD &&
    Math.abs(y) < MAX_VALID_COORD &&
    Math.abs(z) < MAX_VALID_COORD;
}

/**
 * Get bounding box for a specific entity from geometry
 * @param geometry - Array of mesh data
 * @param entityId - Express ID of the entity
 * @returns Bounding box or null if entity not found
 */
export function getEntityBounds(
  geometry: MeshData[] | null,
  entityId: number
): BoundingBox3D | null {
  if (!geometry) {
    return null;
  }

  // Find ALL meshes for this entity (entities can have multiple submeshes)
  const matchingMeshes = geometry.filter(
    (m) => m.expressId === entityId && m.positions.length >= 3
  );

  if (matchingMeshes.length === 0) {
    return null;
  }

  return boundsFromMeshes(matchingMeshes);
}

/**
 * Aggregate a bounding box across an entity's already-collected submeshes.
 * Shared by `getEntityBounds` (single id, one `.filter()` pass) and
 * `unionEntityBounds`'s indexed path (many ids, one shared index) — the
 * vertex-aggregation loop used to live only in `getEntityBounds`.
 */
function boundsFromMeshes(meshes: MeshData[]): BoundingBox3D | null {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  // Aggregate bounds across all submeshes
  // Filter out corrupted/unshifted vertices (> 10km from origin)
  for (const mesh of meshes) {
    // world = origin + position (per-element local frame; absent → absolute).
    const ox = mesh.origin ? mesh.origin[0] : 0;
    const oy = mesh.origin ? mesh.origin[1] : 0;
    const oz = mesh.origin ? mesh.origin[2] : 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i] + ox;
      const y = mesh.positions[i + 1] + oy;
      const z = mesh.positions[i + 2] + oz;
      // Skip corrupted vertices (NaN, Inf, or huge coordinates from unshifted data)
      if (!isValidCoord(x, y, z)) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
  }

  // If no valid vertices found, return null
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * Bucket a flat mesh list by `expressId`, keeping only the meshes
 * `getEntityBounds` would have kept (`positions.length >= 3`).
 *
 * One pass over the array, so a caller that needs bounds for many ids pays
 * O(meshes + N) instead of the O(N x meshes) of one `getEntityBounds` filter
 * per id.
 */
export function indexMeshesByEntity(geometry: MeshData[]): Map<number, MeshData[]> {
  const index = new Map<number, MeshData[]>();
  for (const mesh of geometry) {
    if (mesh.positions.length < 3) continue;
    const list = index.get(mesh.expressId);
    if (list) list.push(mesh);
    else index.set(mesh.expressId, [mesh]);
  }
  return index;
}

/**
 * The indexed equivalent of `getEntityBounds` — identical result, no scan.
 */
export function boundsFromIndex(
  index: Map<number, MeshData[]>,
  entityId: number,
): BoundingBox3D | null {
  const meshes = index.get(entityId);
  return meshes ? boundsFromMeshes(meshes) : null;
}

/**
 * Number of unindexed lookups a `createEntityBoundsLookup` reader gets before
 * it switches to the shared index. A handful of ids (a row click, a clash
 * pair) is cheaper to answer with one `.filter()` pass each than by building a
 * Map over the whole mesh array; past that the unindexed cost dominates.
 */
const INDEX_AFTER_LOOKUPS = 4;

/**
 * A bounds reader over a flat mesh list that indexes itself once the caller
 * asks about more than a handful of ids.
 *
 * Every reader returns exactly what `getEntityBounds(geometry, id)` returns —
 * the index is a lookup strategy, not a different answer. Use this instead of
 * calling `getEntityBounds` in a loop: an unindexed loop over N ids is
 * O(N x meshes), which on a large isolate/frame set (the Filter tab's
 * "Isolate in 3D" #2532, or an assembly whose parts are resolved one by one)
 * stalls the main thread for seconds.
 *
 * Does NOT memoise per id — that stays the caller's job, since callers that
 * also need the renderer's instanced-occurrence fallback must cache the
 * combined answer, not this one.
 *
 * @param geometry flat mesh list, or null once streaming released it
 * @param expectedLookups how many ids the caller already knows it will ask
 *   about, when it knows up front (`unionEntityBounds` has the id array).
 *   Above the threshold the index is built on the FIRST lookup rather than
 *   after a few unindexed ones. Callers that discover ids as they go (the
 *   viewport's aggregation expansion, where one assembly id can turn into
 *   hundreds of parts) omit it and let the reader index itself.
 */
export function createEntityBoundsLookup(
  geometry: MeshData[] | null,
  expectedLookups?: number,
): (entityId: number) => BoundingBox3D | null {
  const indexUpFront = (expectedLookups ?? 0) > INDEX_AFTER_LOOKUPS;
  let index: Map<number, MeshData[]> | null = null;
  let lookups = 0;
  return (entityId: number) => {
    if (!geometry) return null;
    if (!index && (indexUpFront || ++lookups > INDEX_AFTER_LOOKUPS)) {
      index = indexMeshesByEntity(geometry);
    }
    return index ? boundsFromIndex(index, entityId) : getEntityBounds(geometry, entityId);
  };
}


/**
 * Union the world AABBs of `ids`, taking each entity's bounds from the flat mesh
 * list first and falling back to the renderer's per-occurrence AABB.
 *
 * The fallback exists because GPU-instanced occurrences are not in
 * `geometryResult.meshes` at all — and, critically, because `geometry` can be
 * `null` on its own: once streaming releases the mesh arrays, the renderer's
 * scene is the ONLY source of bounds left. Callers must therefore not short-circuit
 * on a null `geometry`; `getEntityBounds(null, id)` already returns null and lets
 * each id fall through to `instancedBounds`.
 *
 * @param geometry flat mesh list, or null once released
 * @param ids federated GLOBAL ids (single model: global === express)
 * @param instancedBounds per-occurrence AABB from the renderer scene
 * @returns the union, or null when no id resolved to bounds
 */
export function unionEntityBounds(
  geometry: MeshData[] | null,
  ids: number[],
  instancedBounds: (id: number) => BoundingBox3D | null | undefined,
): { min: Point3D; max: Point3D } | null {
  let min: Point3D | null = null;
  let max: Point3D | null = null;

  // Self-indexing reader: past a handful of ids it buckets the mesh array by
  // expressId ONCE rather than re-filtering the whole array per id, so this
  // loop is O(meshes + N) instead of O(N × meshes). Shared with every other
  // many-id bounds path (see `createEntityBoundsLookup`).
  const meshBounds = createEntityBoundsLookup(geometry, ids.length);

  for (const id of ids) {
    const b = meshBounds(id) ?? instancedBounds(id) ?? null;
    if (!b) continue;
    if (!min || !max) {
      min = { x: b.min.x, y: b.min.y, z: b.min.z };
      max = { x: b.max.x, y: b.max.y, z: b.max.z };
    } else {
      min.x = Math.min(min.x, b.min.x);
      min.y = Math.min(min.y, b.min.y);
      min.z = Math.min(min.z, b.min.z);
      max.x = Math.max(max.x, b.max.x);
      max.y = Math.max(max.y, b.max.y);
      max.z = Math.max(max.z, b.max.z);
    }
  }
  return min && max ? { min, max } : null;
}
