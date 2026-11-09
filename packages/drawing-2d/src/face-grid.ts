/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The faces of a mesh projected on a drawing plane, and a uniform grid of them, for `outline-depth.ts`. */

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

/**
 * The t interval of `A + t·D` (t in [0, 1]) inside face `o` grown by `reach`
 * on every edge, or false when it misses (Liang-Barsky against three edges),
 * with the face's depth there as `alpha + beta·t` (in `SPAN`).
 */
export function clipToFace(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): boolean {
  let t0 = 0, t1 = 1;
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
 * The t interval of `A + t·D` within `reach` of edge `o` (a box around it), with
 * the edge's depth there as `alpha + beta·t`, lowered by its slope times `reach`.
 */
export function clipToEdge(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): boolean {
  const px = faces[o], py = faces[o + 1];
  const ex = faces[o + 11], ey = faces[o + 12], len = faces[o + 13];
  let t0 = 0, t1 = 1;
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

/** The corners `reachBox` takes the box of. */
const REACH_CORNERS = new Float64Array(8);

/**
 * The box of what `clipToFace` or `clipToEdge` can take of entry `o` (the face with its edges moved out by `reach`, the
 * edge's box around it) into `out` at `at`, a hair larger so rounding never leaves a clip outside it.
 */
function reachBox(faces: Float64Array, o: number, reach: number, out: Float64Array, at: number): void {
  const c = REACH_CORNERS;
  let n = 0;
  if (faces[o + 9] === EDGE) {
    const ex = faces[o + 11], ey = faces[o + 12], len = faces[o + 13];
    for (let k = 0; k < 4; k++) {
      const along = k < 2 ? -reach : len + reach, across = k % 2 === 0 ? -reach : reach;
      c[n++] = faces[o] + ex * along - ey * across; c[n++] = faces[o + 1] + ey * along + ex * across;
    }
  } else {
    // Each corner moves to where its two edges, each moved out by reach, meet.
    for (let i = 0; i < 3; i++) {
      const a = o + 11 + ((i + 2) % 3) * 2, b = o + 11 + i * 2;
      const det = faces[a] * faces[b + 1] - faces[a + 1] * faces[b];
      c[n++] = faces[o + i * 2] + (reach * (faces[a + 1] - faces[b + 1])) / det;
      c[n++] = faces[o + i * 2 + 1] + (reach * (faces[b] - faces[a])) / det;
    }
  }
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (let k = 0; k < n; k += 2) {
    if (!Number.isFinite(c[k]) || !Number.isFinite(c[k + 1])) { minU = minV = -Infinity; maxU = maxV = Infinity; break; }
    minU = Math.min(minU, c[k]); maxU = Math.max(maxU, c[k]); minV = Math.min(minV, c[k + 1]); maxV = Math.max(maxV, c[k + 1]);
  }
  const pad = 1e-9 * (1 + Math.abs(minU) + Math.abs(maxU) + Math.abs(minV) + Math.abs(maxV));
  out[at] = minU - pad; out[at + 1] = minV - pad; out[at + 2] = maxU + pad; out[at + 3] = maxV + pad;
}

/**
 * The faces a line may meet, exactly those of the grid #779 shipped. That grid filed each face in the cells of its box
 * grown by `reach` (cells as fine as one per face, up to 64 a side) and a line took every face of the cells of its own
 * box grown by `reach`, so each face sat in some 25 cells of a small element and a query walked it as often. Its cells
 * also decide which faces count: a sliver grown by `reach` reaches past its box, and whether a line there meets it
 * depends on the line's cell. So each face keeps the range of cells #779 filed it in, and a coarse grid of cells no
 * finer than `reach`, filed by what a clip can take of each face (`reachBox`), finds the candidates, of which a query
 * keeps those whose cell range meets the line's.
 */
export class FaceGrid {
  /** Per entry: the cells #779's grid filed it in, `u0, v0, u1, v1`. */
  private readonly cellsOf: Int32Array;
  private readonly size: number;
  private readonly minU: number;
  private readonly minV: number;
  private readonly cellU: number;
  private readonly cellV: number;
  /** Per entry: the box of what a clip can take of it. */
  private readonly reachBoxes: Float64Array;
  /** The coarse grid: cell `c` holds entries `items[start[c]]` up to `items[start[c + 1]]`, ascending. */
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly nu: number;
  private readonly nv: number;
  private readonly coarseU: number;
  private readonly coarseV: number;
  private readonly seen: Int32Array;
  private stamp = 0;
  private readonly reach: number;
  /** The entries the last `query` found, as many as it returned, ascending (so nearest first); reused, so a query allocates nothing. */
  readonly found: Int32Array;

  constructor(faces: Float64Array, reach: number) {
    const count = faces.length / STRIDE;
    this.reach = reach;
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let o = 0; o < faces.length; o += STRIDE) {
      minU = Math.min(minU, faces[o + BOX]); minV = Math.min(minV, faces[o + BOX + 1]);
      maxU = Math.max(maxU, faces[o + BOX + 2]); maxV = Math.max(maxV, faces[o + BOX + 3]);
    }
    this.size = count > 64 ? Math.min(64, Math.ceil(Math.sqrt(count))) : 1;
    this.minU = minU - reach;
    this.minV = minV - reach;
    this.cellU = Math.max((maxU - minU + 2 * reach) / this.size, 1e-12);
    this.cellV = Math.max((maxV - minV + 2 * reach) / this.size, 1e-12);
    this.cellsOf = new Int32Array(count * 4);
    this.reachBoxes = new Float64Array(count * 4);
    for (let f = 0; f < count; f++) {
      const o = f * STRIDE + BOX, c = f * 4;
      this.cellsOf[c] = this.cell(faces[o] - reach, this.minU, this.cellU, this.size);
      this.cellsOf[c + 1] = this.cell(faces[o + 1] - reach, this.minV, this.cellV, this.size);
      this.cellsOf[c + 2] = this.cell(faces[o + 2] + reach, this.minU, this.cellU, this.size);
      this.cellsOf[c + 3] = this.cell(faces[o + 3] + reach, this.minV, this.cellV, this.size);
      reachBox(faces, f * STRIDE, reach, this.reachBoxes, c);
    }
    const spanU = maxU - minU + 2 * reach, spanV = maxV - minV + 2 * reach;
    this.nu = Math.max(1, Math.min(this.size, Math.floor(spanU / reach)));
    this.nv = Math.max(1, Math.min(this.size, Math.floor(spanV / reach)));
    this.coarseU = Math.max(spanU / this.nu, 1e-12);
    this.coarseV = Math.max(spanV / this.nv, 1e-12);
    // Counts, then each coarse cell's entries in one array.
    const cells = this.nu * this.nv;
    const start = new Int32Array(cells + 1);
    this.fileEntries(count, (c) => { start[c + 1]++; });
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const items = new Int32Array(start[cells]);
    const next = start.slice(0, cells);
    this.fileEntries(count, (c, f) => { items[next[c]++] = f; });
    this.start = start;
    this.items = items;
    this.seen = new Int32Array(count);
    this.found = new Int32Array(count);
  }

  private fileEntries(count: number, file: (cell: number, f: number) => void): void {
    const b = this.reachBoxes;
    for (let f = 0; f < count; f++) {
      const u0 = this.cell(b[f * 4], this.minU, this.coarseU, this.nu), v0 = this.cell(b[f * 4 + 1], this.minV, this.coarseV, this.nv);
      const u1 = this.cell(b[f * 4 + 2], this.minU, this.coarseU, this.nu), v1 = this.cell(b[f * 4 + 3], this.minV, this.coarseV, this.nv);
      for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) file(v * this.nu + u, f);
    }
  }

  private cell(x: number, min: number, size: number, n: number): number {
    return Math.max(0, Math.min(n - 1, Math.floor((x - min) / size)));
  }

  /** How many faces a line with the box `minU`..`maxV` may meet: the first that many of `found`. */
  query(minU: number, minV: number, maxU: number, maxV: number): number {
    const { found, seen, start, items, nu, cellsOf, reachBoxes: b, reach } = this;
    // The cells of #779's grid the line looked in.
    const lu0 = this.cell(minU - reach, this.minU, this.cellU, this.size), lv0 = this.cell(minV - reach, this.minV, this.cellV, this.size);
    const lu1 = this.cell(maxU + reach, this.minU, this.cellU, this.size), lv1 = this.cell(maxV + reach, this.minV, this.cellV, this.size);
    const u0 = this.cell(minU, this.minU, this.coarseU, nu), v0 = this.cell(minV, this.minV, this.coarseV, this.nv);
    const u1 = this.cell(maxU, this.minU, this.coarseU, nu), v1 = this.cell(maxV, this.minV, this.coarseV, this.nv);
    const single = u0 === u1 && v0 === v1;
    const stamp = ++this.stamp;
    let n = 0;
    for (let v = v0; v <= v1; v++) {
      for (let u = u0; u <= u1; u++) {
        for (let i = start[v * nu + u], end = start[v * nu + u + 1]; i < end; i++) {
          const f = items[i];
          if (!single) { if (seen[f] === stamp) continue; seen[f] = stamp; }
          if (b[f * 4] > maxU || b[f * 4 + 2] < minU || b[f * 4 + 1] > maxV || b[f * 4 + 3] < minV) continue;
          if (cellsOf[f * 4] > lu1 || cellsOf[f * 4 + 2] < lu0 || cellsOf[f * 4 + 1] > lv1 || cellsOf[f * 4 + 3] < lv0) continue;
          found[n++] = f;
        }
      }
    }
    if (!single) found.subarray(0, n).sort();
    return n;
  }
}
