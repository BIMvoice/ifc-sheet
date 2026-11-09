/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The surface a curved outline line lies on, for its own surface depth
 * (`outline-depth.ts`, #557): the faces connected to the line's own two within
 * one raster pixel of it, never a distant part of the same mesh.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from './types.js';
import { EDGE, STRIDE, projectTriangle } from './face-grid.js';

/**
 * The faces a curved outline line lies on, by the mesh's triangle index (`mesh.indices`). Its depth is read only from
 * the surface connected to them within one raster pixel of the line, never from a distant part of the same mesh: the
 * inner outline of a ring wall lies behind the wall's own front, and that front must still hide it.
 */
export interface LocalSurface {
  /** The triangles on either side of the line's edge. */
  seeds: readonly number[];
  /** What the curved lines of one mesh share. */
  mesh: LocalFaces;
}

/** A mesh's face adjacency and its projected triangles (filled here), shared by its curved lines. */
export interface LocalFaces {
  /** The triangles sharing an edge with triangle `f`: `faces[start[f]]` up to `faces[start[f + 1]]`. */
  adjacency: { start: Int32Array; faces: Int32Array };
  /** The drawing's plane. */
  plane: SectionPlaneConfig;
  /** Where triangle `f`'s entries start in `pool` (-1 until projected) and how many there are; `used` of `pool` is filled. */
  first: Int32Array;
  count: Uint8Array;
  pool: Float64Array;
  used: number;
  /** Walk marks, one per triangle. */
  seen: Int32Array;
  stamp: number;
}

/** Faces walked at most from a curved line's own faces. */
const MAX_LOCAL_FACES = 512;

/**
 * Walk from a curved line's own faces across the faces next to them, as long as each lies within reach of the line, and
 * pass each one's entries to `add`. A face seen edge-on is walked only as a seed: the cap of a ring wall, edge-on in a
 * level view, would lead from the inner surface across to the outer one.
 */
export function walkLocal(mesh: MeshData, near: LocalSurface, add: (faces: Float64Array, o: number) => boolean): void {
  const local = near.mesh;
  const { start, faces } = local.adjacency;
  const stamp = ++local.stamp;
  const queue = [...near.seeds];
  for (const f of queue) local.seen[f] = stamp;
  for (let q = 0; q < queue.length && q < MAX_LOCAL_FACES; q++) {
    const f = queue[q];
    if (local.first[f] < 0) project(mesh, local, f);
    const o0 = local.first[f], n = local.count[f];
    if (n === 0) continue;
    const seed = q < near.seeds.length;
    if (local.pool[o0 + 9] === EDGE && !seed) continue;
    let within = false;
    for (let k = 0; k < n; k++) within = add(local.pool, o0 + k * STRIDE) || within;
    if (!within && !seed) continue;
    for (let k = start[f]; k < start[f + 1]; k++) {
      const h = faces[k];
      if (local.seen[h] !== stamp) { local.seen[h] = stamp; queue.push(h); }
    }
  }
}

const scratch: number[] = [];

/** Project triangle `f` into `local.pool`, growing it as needed. */
function project(mesh: MeshData, local: LocalFaces, f: number): void {
  scratch.length = 0;
  projectTriangle(mesh, local.plane, f, scratch);
  if (local.used + scratch.length > local.pool.length) {
    const grown = new Float64Array(Math.max(2 * local.pool.length, local.used + scratch.length, 64 * STRIDE));
    grown.set(local.pool.subarray(0, local.used));
    local.pool = grown;
  }
  local.pool.set(scratch, local.used);
  local.first[f] = local.used;
  local.count[f] = scratch.length / STRIDE;
  local.used += scratch.length;
}
