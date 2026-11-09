/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The surface a curved outline line lies on, for its own surface depth
 * (`outline-depth.ts`, #557): the faces joined to the line's own two across
 * smooth edges within one raster pixel of it, never a distant part of the same
 * mesh, and the lowest depth of that surface within one pixel of each point of
 * the line, so the line is neither hidden by the surface it lies on nor shown
 * where something in front of that surface hides it.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from './types.js';
import type { DrawingLine } from './types.js';
import { EDGE, SPAN, STRIDE, clipToEdge, clipToFace, projectTriangle } from './face-grid.js';

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
 * pass each one's entries to `add`. The adjacency joins faces across smooth edges only (`faceAdjacency`), so the walk
 * stays on the curved surface: the cap or rim of a ring wall or a hollow pipe meets it at a crease, and seen at any
 * angle the walk does not cross over to the outer surface in front. A face seen edge-on is walked only as a seed.
 */
function walkLocal(mesh: MeshData, near: LocalSurface, add: (faces: Float64Array, o: number) => boolean): void {
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

/** Points along a curved line where its own surface depth is read. */
const SAMPLES = 16;

/**
 * Breakpoints `[t, depth]` at `SAMPLES` even steps along `line`: at each, the lowest depth of the line's own surface
 * (`LocalSurface`) within `reach` of the point, exactly, from each face's part inside that disc. Never deeper than the
 * surface the hidden-line raster samples within a pixel of the point, and never nearer than that surface really is: a
 * plane's slope times `reach` lowered a thin rail running into the view to its near end, and it showed through a wall
 * in front of it.
 */
export function localDepth(mesh: MeshData, near: LocalSurface, reach: number, line: DrawingLine): Array<[number, number]> {
  const ax = line.line.start.x, ay = line.line.start.y;
  const dx = line.line.end.x - ax, dy = line.line.end.y - ay;
  const best = new Float64Array(SAMPLES + 1).fill(Infinity);
  walkLocal(mesh, near, (faces, o) => {
    const edge = faces[o + 9] === EDGE;
    if (!(edge ? clipToEdge(faces, o, ax, ay, dx, dy, reach) : clipToFace(faces, o, ax, ay, dx, dy, reach))) return false;
    const last = Math.min(SAMPLES, Math.floor(SPAN[1] * SAMPLES + 1e-9));
    for (let k = Math.max(0, Math.ceil(SPAN[0] * SAMPLES - 1e-9)); k <= last; k++) {
      const px = ax + (dx * k) / SAMPLES, py = ay + (dy * k) / SAMPLES;
      const d = edge ? segmentLowest(faces, o, px, py, reach) : faceLowest(faces, o, px, py, reach);
      if (d < best[k]) best[k] = d;
    }
    return true;
  });
  const d0 = line.depth, d1 = line.depthEnd ?? line.depth;
  return Array.from(best, (d, k): [number, number] => [k / SAMPLES, Number.isFinite(d) ? d : d0 + ((d1 - d0) * k) / SAMPLES]);
}

/** The lowest depth of face `o` within `r` of (`px`, `py`); Infinity when none of it is. */
function faceLowest(f: Float64Array, o: number, px: number, py: number, r: number): number {
  const a = f[o + 6], b = f[o + 7], c = f[o + 8], g = f[o + 9];
  // The disc's lowest point: when it lies on the face, nothing of the face in the disc is lower.
  const qx = g > 0 ? px - (r * a) / g : px, qy = g > 0 ? py - (r * b) / g : py;
  if (inTriangle(f, o, qx, qy)) return a * qx + b * qy + c;
  let low = Infinity;
  for (let e = 0; e < 3; e++) {
    const ux = f[o + e * 2], uy = f[o + e * 2 + 1];
    const wx = f[o + ((e + 1) % 3) * 2], wy = f[o + ((e + 1) % 3) * 2 + 1];
    if (!clipSegmentToDisc(ux, uy, wx, wy, px, py, r)) continue;
    const s0 = DISC[0], s1 = DISC[1];
    low = Math.min(low, a * (ux + (wx - ux) * s0) + b * (uy + (wy - uy) * s0) + c, a * (ux + (wx - ux) * s1) + b * (uy + (wy - uy) * s1) + c);
  }
  return low;
}

/** The lowest depth of the edge `o` (of a face seen edge-on) within `r` of (`px`, `py`); Infinity when none of it is. */
function segmentLowest(f: Float64Array, o: number, px: number, py: number, r: number): number {
  if (!clipSegmentToDisc(f[o], f[o + 1], f[o + 2], f[o + 3], px, py, r)) return Infinity;
  return Math.min(f[o + 6] + (f[o + 7] - f[o + 6]) * DISC[0], f[o + 6] + (f[o + 7] - f[o + 6]) * DISC[1]);
}

/** The part `[DISC[0], DISC[1]]` of the segment u to w (0 at u, 1 at w) within `r` of p; false when none is. */
const DISC = new Float64Array(2);
function clipSegmentToDisc(ux: number, uy: number, wx: number, wy: number, px: number, py: number, r: number): boolean {
  const ex = wx - ux, ey = wy - uy, fx = ux - px, fy = uy - py;
  const A = ex * ex + ey * ey, B = 2 * (fx * ex + fy * ey), C = fx * fx + fy * fy - r * r;
  if (A === 0) { DISC[0] = DISC[1] = 0; return C <= 0; }
  const disc = B * B - 4 * A * C;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  DISC[0] = Math.max(0, (-B - root) / (2 * A));
  DISC[1] = Math.min(1, (-B + root) / (2 * A));
  return DISC[0] <= DISC[1];
}

function inTriangle(f: Float64Array, o: number, x: number, y: number): boolean {
  const cross = (e: number) => {
    const ux = f[o + e * 2], uy = f[o + e * 2 + 1], wx = f[o + ((e + 1) % 3) * 2], wy = f[o + ((e + 1) % 3) * 2 + 1];
    return (wx - ux) * (y - uy) - (wy - uy) * (x - ux);
  };
  const c0 = cross(0), c1 = cross(1), c2 = cross(2);
  return (c0 >= 0 && c1 >= 0 && c2 >= 0) || (c0 <= 0 && c1 <= 0 && c2 <= 0);
}
