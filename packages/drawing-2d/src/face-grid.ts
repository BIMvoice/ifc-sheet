/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The faces of a mesh projected on a drawing plane, and a uniform grid of them, for `outline-depth.ts`.
 *
 * Every clip stays inside its entry's bounding box grown by `reach`, and the grid files each entry under exactly that
 * box, so a query never misses an entry a clip would take and the faces a line meets do not depend on the grid's cells
 * (#557). Before, `clipToFace` grew a triangle by moving its edges out by `reach`, and a sliver's grown corner reached
 * `reach / sin(half its angle)` past its tip, out of the box it was filed under: whether a line there met it depended
 * on whether the line's cell held it.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from './types.js';
import { getVertex } from './raster-core.js';
import { projectPointForPlane, signedDepth } from './projection-bands.js';

/**
 * Per face: 0-5 the three projected vertices, 6-8 the depth plane `a·u + b·v + c`, 9 its slope, 10 its nearest vertex
 * depth, 11-16 the inward unit normal of each edge. Per edge of a face seen edge-on (slope slot -1): its two projected
 * ends (the second twice), their depths, the nearer one, 11-13 its unit direction and length. For both, 17-20 the
 * bounding box `minU, minV, maxU, maxV`. The normals and directions are worked out once here rather than in every
 * clip: an outline line clips every face within a raster pixel, hundreds per line on ISSUE_068 (#557).
 */
export const STRIDE = 21;
/** Slope slot of an entry that is an edge of a face seen edge-on. */
export const EDGE = -1;
const BOX = 17;

/** World x, y, z, then u, v and depth of a triangle's three corners. */
const CORNER = new Float64Array(18);

function box(out: Float64Array, o: number, u0: number, v0: number, u1: number, v1: number, u2: number, v2: number): void {
  out[o + BOX] = Math.min(u0, u1, u2); out[o + BOX + 1] = Math.min(v0, v1, v2);
  out[o + BOX + 2] = Math.max(u0, u1, u2); out[o + BOX + 3] = Math.max(v0, v1, v2);
}

/**
 * Write the entries of triangle `t` of `mesh` projected on `plane` into `out` from entry `at`: one for a face, one per
 * edge for a face seen edge-on (it holds no area the raster can fill), none for a degenerate triangle. `out` needs room
 * for three. Returns how many it wrote.
 */
export function projectTriangle(mesh: MeshData, plane: SectionPlaneConfig, t: number, out: Float64Array, at: number): number {
  const { positions, indices, origin } = mesh;
  const c = CORNER;
  for (let k = 0; k < 3; k++) {
    const p = getVertex(positions, indices[t * 3 + k], origin);
    const q = projectPointForPlane(p, plane);
    c[k * 6] = p.x; c[k * 6 + 1] = p.y; c[k * 6 + 2] = p.z;
    c[k * 6 + 3] = q.x; c[k * 6 + 4] = q.y; c[k * 6 + 5] = -signedDepth(p, plane);
  }
  const u0 = c[3], v0 = c[4], d0 = c[5], u1 = c[9], v1 = c[10], d1 = c[11], u2 = c[15], v2 = c[16], d2 = c[17];
  const e1u = u1 - u0, e1v = v1 - v0, e2u = u2 - u0, e2v = v2 - v0;
  const area2 = e1u * e2v - e2u * e1v;
  const ax = c[6] - c[0], ay = c[7] - c[1], az = c[8] - c[2];
  const bx = c[12] - c[0], by = c[13] - c[1], bz = c[14] - c[2];
  const area3 = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  if (!(area3 > 0)) return 0;
  if (Math.abs(area2) <= 1e-3 * area3) {
    let n = 0;
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const ui = c[i * 6 + 3], vi = c[i * 6 + 4], di = c[i * 6 + 5], uj = c[j * 6 + 3], vj = c[j * 6 + 4], dj = c[j * 6 + 5];
      const len = Math.hypot(uj - ui, vj - vi);
      if (len === 0) continue;
      const o = (at + n++) * STRIDE;
      out[o] = ui; out[o + 1] = vi; out[o + 2] = uj; out[o + 3] = vj; out[o + 4] = uj; out[o + 5] = vj;
      out[o + 6] = di; out[o + 7] = dj; out[o + 8] = 0; out[o + 9] = EDGE; out[o + 10] = Math.min(di, dj);
      out[o + 11] = (uj - ui) / len; out[o + 12] = (vj - vi) / len; out[o + 13] = len;
      out[o + 14] = 0; out[o + 15] = 0; out[o + 16] = 0;
      box(out, o, ui, vi, uj, vj, uj, vj);
    }
    return n;
  }
  const e1d = d1 - d0, e2d = d2 - d0;
  const a = (e1d * e2v - e2d * e1v) / area2;
  const b = (e1u * e2d - e2u * e1d) / area2;
  const o = at * STRIDE;
  out[o] = u0; out[o + 1] = v0; out[o + 2] = u1; out[o + 3] = v1; out[o + 4] = u2; out[o + 5] = v2;
  out[o + 6] = a; out[o + 7] = b; out[o + 8] = d0 - a * u0 - b * v0; out[o + 9] = Math.hypot(a, b); out[o + 10] = Math.min(d0, d1, d2);
  // Inward edge normals, whichever way the face winds.
  const sign = area2 > 0 ? 1 : -1;
  for (let e = 0; e < 3; e++) {
    const p = o + e * 2, q = o + ((e + 1) % 3) * 2;
    const ex = out[q] - out[p], ey = out[q + 1] - out[p + 1];
    const len = Math.hypot(ex, ey);
    out[o + 11 + e * 2] = (-ey * sign) / len; out[o + 12 + e * 2] = (ex * sign) / len;
  }
  box(out, o, u0, v0, u1, v1, u2, v2);
  return 1;
}

/** The entries of all of `mesh`'s triangles on `plane`, nearest vertex first, so entries in index order are in depth order. */
export function projectMesh(mesh: MeshData, plane: SectionPlaneConfig): Float64Array {
  const n = Math.floor(mesh.indices.length / 3);
  // One entry a triangle, room for three more; a face seen edge-on takes up to three.
  let all = new Float64Array((n + 3) * STRIDE);
  let count = 0;
  for (let t = 0; t < n; t++) {
    if ((count + 3) * STRIDE > all.length) {
      const grown = new Float64Array(Math.max(all.length * 2, (count + 3) * STRIDE));
      grown.set(all.subarray(0, count * STRIDE));
      all = grown;
    }
    count += projectTriangle(mesh, plane, t, all, count);
  }
  const order = new Int32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  order.sort((p, q) => all[p * STRIDE + 10] - all[q * STRIDE + 10] || p - q);
  const out = new Float64Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    const from = order[i] * STRIDE, to = i * STRIDE;
    for (let k = 0; k < STRIDE; k++) out[to + k] = all[from + k];
  }
  return out;
}

/** The last clip's `[t0, t1, alpha, beta]` (`clipToFace`, `clipToEdge`), kept here so no clip allocates. */
export const SPAN = new Float64Array(4);

/** `[t0, t1]` of `A + t·D` (t in [0, 1]) inside entry `o`'s box grown by `reach` (in `SPAN`), or false when it misses. */
function clipToBox(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): boolean {
  let t0 = 0, t1 = 1;
  for (let axis = 0; axis < 2; axis++) {
    const a = axis === 0 ? ax : ay, d = axis === 0 ? dx : dy;
    const lo = faces[o + BOX + axis] - reach, hi = faces[o + BOX + 2 + axis] + reach;
    if (d === 0) { if (a < lo || a > hi) return false; continue; }
    const ta = (lo - a) / d, tb = (hi - a) / d;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  SPAN[0] = t0; SPAN[1] = t1;
  return true;
}

/**
 * The t interval of `A + t·D` (t in [0, 1]) inside face `o` grown by `reach`
 * on every edge and kept to its box grown by `reach`, or false when it misses
 * (Liang-Barsky), with the face's depth there as `alpha + beta·t` (in `SPAN`).
 * Everything within `reach` of the face lies inside both.
 */
export function clipToFace(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): boolean {
  if (!clipToBox(faces, o, ax, ay, dx, dy, reach)) return false;
  let t0 = SPAN[0], t1 = SPAN[1];
  for (let e = 0; e < 3; e++) {
    const px = faces[o + e * 2], py = faces[o + e * 2 + 1];
    const nx = faces[o + 11 + e * 2], ny = faces[o + 12 + e * 2];
    // n·(A + t·D - P) + reach >= 0
    const c = nx * (ax - px) + ny * (ay - py) + reach;
    const k = nx * dx + ny * dy;
    if (k === 0) { if (c < 0) return false; continue; }
    const t = -c / k;
    if (k > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  // The face's depth plane along the line, lowered by its slope times reach.
  SPAN[0] = t0; SPAN[1] = t1;
  SPAN[2] = faces[o + 6] * ax + faces[o + 7] * ay + faces[o + 8] - faces[o + 9] * reach;
  SPAN[3] = faces[o + 6] * dx + faces[o + 7] * dy;
  return true;
}

/**
 * The t interval of `A + t·D` within `reach` of edge `o` (a box around it, kept to
 * its bounding box grown by `reach`), with the edge's depth there as
 * `alpha + beta·t`, lowered by its slope times `reach`.
 */
export function clipToEdge(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): boolean {
  if (!clipToBox(faces, o, ax, ay, dx, dy, reach)) return false;
  const px = faces[o], py = faces[o + 1];
  const ex = faces[o + 11], ey = faces[o + 12], len = faces[o + 13];
  let t0 = SPAN[0], t1 = SPAN[1];
  // Along the edge from -reach to len + reach, across it within reach.
  for (let side = 0; side < 2; side++) {
    const nx = side === 0 ? ex : -ey, ny = side === 0 ? ey : ex;
    const lo = -reach, hi = side === 0 ? len + reach : reach;
    const c = nx * (ax - px) + ny * (ay - py);
    const k = nx * dx + ny * dy;
    if (k === 0) { if (c < lo || c > hi) return false; continue; }
    const ta = (lo - c) / k, tb = (hi - c) / k;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  const slope = (faces[o + 7] - faces[o + 6]) / len;
  const s0 = ex * (ax - px) + ey * (ay - py);
  SPAN[0] = t0; SPAN[1] = t1;
  SPAN[2] = faces[o + 6] + slope * s0 - Math.abs(slope) * reach;
  SPAN[3] = slope * (ex * dx + ey * dy);
  return true;
}

/**
 * A uniform grid of entry boxes grown by `reach`, so a line looks only at the entries near it. Its cells are no smaller
 * than `reach`: finer ones file every entry in many cells and make a query walk it again in each.
 */
export class FaceGrid {
  /** Cell `c` holds entries `items[start[c]]` up to `items[start[c + 1]]`, ascending. */
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly nu: number;
  private readonly nv: number;
  private readonly minU: number;
  private readonly minV: number;
  private readonly cellU: number;
  private readonly cellV: number;
  private readonly seen: Int32Array;
  private stamp = 0;
  /** The entries the last `query` found, as many as it returned, ascending (so nearest first); reused, so a query allocates nothing. */
  readonly found: Int32Array;

  constructor(faces: Float64Array, reach: number) {
    const count = faces.length / STRIDE;
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let o = 0; o < faces.length; o += STRIDE) {
      minU = Math.min(minU, faces[o + BOX]); minV = Math.min(minV, faces[o + BOX + 1]);
      maxU = Math.max(maxU, faces[o + BOX + 2]); maxV = Math.max(maxV, faces[o + BOX + 3]);
    }
    const size = count > 64 ? Math.min(64, Math.ceil(Math.sqrt(count))) : 1;
    const spanU = maxU - minU + 2 * reach, spanV = maxV - minV + 2 * reach;
    this.nu = Math.max(1, Math.min(size, Math.floor(spanU / reach)));
    this.nv = Math.max(1, Math.min(size, Math.floor(spanV / reach)));
    this.minU = minU - reach;
    this.minV = minV - reach;
    this.cellU = Math.max(spanU / this.nu, 1e-12);
    this.cellV = Math.max(spanV / this.nv, 1e-12);
    // Counts, then each cell's entries in one array.
    const cells = this.nu * this.nv;
    const start = new Int32Array(cells + 1);
    this.fileEntries(faces, reach, (c) => { start[c + 1]++; });
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const items = new Int32Array(start[cells]);
    const next = start.slice(0, cells);
    this.fileEntries(faces, reach, (c, f) => { items[next[c]++] = f; });
    this.start = start;
    this.items = items;
    this.seen = new Int32Array(count);
    this.found = new Int32Array(count);
  }

  private fileEntries(faces: Float64Array, reach: number, file: (cell: number, f: number) => void): void {
    for (let f = 0, count = faces.length / STRIDE; f < count; f++) {
      const o = f * STRIDE + BOX;
      const u0 = this.cellU0(faces[o] - reach), v0 = this.cellV0(faces[o + 1] - reach);
      const u1 = this.cellU0(faces[o + 2] + reach), v1 = this.cellV0(faces[o + 3] + reach);
      for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) file(v * this.nu + u, f);
    }
  }

  private cellU0(x: number): number {
    return Math.max(0, Math.min(this.nu - 1, Math.floor((x - this.minU) / this.cellU)));
  }

  private cellV0(y: number): number {
    return Math.max(0, Math.min(this.nv - 1, Math.floor((y - this.minV) / this.cellV)));
  }

  /**
   * How many entries' grown boxes may meet the box `minU`..`maxV`: the first that many of `found`. Entries are filed
   * grown, so pass the line's own box.
   */
  query(minU: number, minV: number, maxU: number, maxV: number): number {
    const u0 = this.cellU0(minU), v0 = this.cellV0(minV), u1 = this.cellU0(maxU), v1 = this.cellV0(maxV);
    const { found, seen, start, items, nu } = this;
    if (u0 === u1 && v0 === v1) {
      const c = v0 * nu + u0;
      found.set(items.subarray(start[c], start[c + 1]));
      return start[c + 1] - start[c];
    }
    const stamp = ++this.stamp;
    let n = 0;
    for (let v = v0; v <= v1; v++) {
      for (let u = u0; u <= u1; u++) {
        for (let i = start[v * nu + u], end = start[v * nu + u + 1]; i < end; i++) {
          const f = items[i];
          if (seen[f] === stamp) continue;
          seen[f] = stamp;
          found[n++] = f;
        }
      }
    }
    found.subarray(0, n).sort();
    return n;
  }
}
