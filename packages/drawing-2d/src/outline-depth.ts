/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * View depth along a mesh outline, read off the element's own surface.
 *
 * The Rust `meshOutline2d` contours are 2D only, so `outlineToProjectionLines`
 * can give each outline line no more than one scalar depth: the element's
 * nearest extent. For an element that runs deep into the view that is wrong
 * along most of its outline. On FZK-Haus the rafters run 5.5 m from eave to
 * ridge under the roof slab, yet every rafter line carried the eave's depth,
 * so the slab in front never hid them and the South and North elevations
 * showed some twenty vertical lines through the roof.
 *
 * This module gives each outline line the depth of its own element's nearest
 * surface under it, split where that surface changes, so the hidden-line
 * classifier can hide it behind what is really in front.
 *
 * # Never hidden by itself
 * The depth raster holds the element itself, sampled at pixel centres up to
 * 0.71 px from the line, and across a sloped face that is a nearer depth than
 * the face has on the line. So the depth taken here is a LOWER bound of the
 * element's own surface within `reach` (one raster pixel) of the line: each
 * face counts within `reach` of its edges, at its depth less its slope times
 * `reach` (never nearer than its nearest vertex), and between breakpoints the
 * line's linear depth stays at or in front of the nearest face. Lines can come
 * out slightly under-hidden; they cannot be hidden by their own element.
 *
 * A face seen edge-on fills no pixel, but its edges still bound how near the
 * element comes along the outline it lies on: a wall cut by a plan has no cap,
 * and its outline is as near as the top of its sides, the cut, not its foot.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { Bounds2D, DrawingLine, MeshOutline2D, SectionPlaneConfig } from './types.js';
import { getVertex } from './raster-core.js';
import { outlineToProjectionLines, projectPointForPlane, signedDepth, type ProjectionBandDepths } from './projection-bands.js';

/** Resolution (pixels on the longer side) of the generator's hidden-line raster. */
export const HIDDEN_LINE_RESOLUTION = 1024;

/**
 * Per face: the three projected vertices, the depth plane `a·u + b·v + c`, its
 * slope and its nearest vertex depth. Per edge of a face seen edge-on (slope
 * slot -1): its two projected ends (the second twice), their depths and the
 * nearer one.
 */
const STRIDE = 11;
const EDGE = -1;
const T_EPS = 1e-9;

interface OutlineSource {
  mesh: MeshData;
  plane: SectionPlaneConfig;
  /** The projected faces, built on first use for one raster pixel size. */
  built?: { faces: Float64Array; grid: FaceGrid; reach: number };
}

/** Lines `outlineLinesWithDepth` produced, mapped to the mesh their depth is read from. */
const sources = new WeakMap<DrawingLine, OutlineSource>();

/**
 * `outlineToProjectionLines`, remembering `mesh` for each line so
 * `refineOutlineDepths` can give it the depth of the element's own surface.
 */
export function outlineLinesWithDepth(
  outline: MeshOutline2D,
  meta: { entityId: number; ifcType: string; modelIndex: number },
  plane: SectionPlaneConfig,
  depths: ProjectionBandDepths,
  mesh: MeshData,
): DrawingLine[] {
  return withOwnSurfaceDepth(outlineToProjectionLines(outline, meta, plane, depths), plane, mesh);
}

/**
 * Remember `mesh` for each of `lines` (lines drawn from that mesh on `plane`), so `refineOutlineDepths` gives them the
 * depth of the element's own surface. The mesh silhouette needs it as much as the Rust outline: a column or a handrail
 * is a tube, and its silhouette runs along the rim, behind the tube's own front by up to its radius within one raster
 * pixel, so the column of FZK's spiral stair was hidden by itself in Section A-A (#557).
 */
export function withOwnSurfaceDepth(lines: DrawingLine[], plane: SectionPlaneConfig, mesh: MeshData): DrawingLine[] {
  const source: OutlineSource = { mesh, plane };
  for (const line of lines) sources.set(line, source);
  return lines;
}

/** Model size of one pixel of the hidden-line raster over `bounds` (the larger of its two axes, as `buildDepthRaster` sizes it). */
export function rasterPixelSize(bounds: Bounds2D, resolution = HIDDEN_LINE_RESOLUTION): number {
  const w = bounds.max.x - bounds.min.x;
  const h = bounds.max.y - bounds.min.y;
  if (!(w > 0) || !(h > 0)) return 0;
  const width = w > h ? resolution : Math.max(1, Math.floor(resolution * (w / h)));
  const height = w > h ? Math.max(1, Math.floor(resolution / (w / h))) : resolution;
  return Math.max(w / Math.max(1, width - 1), h / Math.max(1, height - 1));
}

/**
 * Replace each outline line in `lines` by pieces whose `depth`/`depthEnd`
 * follow its element's own surface (see the module comment). `bounds` is the
 * hidden-line raster's extent. Lines from any other producer pass through.
 */
export function refineOutlineDepths(lines: DrawingLine[], bounds: Bounds2D): DrawingLine[] {
  const reach = rasterPixelSize(bounds);
  if (!(reach > 0)) return lines;
  const out: DrawingLine[] = [];
  for (const line of lines) {
    const source = sources.get(line);
    if (!source) { out.push(line); continue; }
    const pieces = depthAlong(source, reach, line);
    const { start, end } = line.line;
    const at = (t: number) => (t === 0 ? start : t === 1 ? end : { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
    for (let i = 0; i + 1 < pieces.length; i++) {
      const [t0, d0] = pieces[i];
      const [t1, d1] = pieces[i + 1];
      const piece: DrawingLine = { ...line, line: { start: at(t0), end: at(t1) }, depth: d0 };
      if (d1 !== d0) piece.depthEnd = d1; else delete piece.depthEnd;
      out.push(piece);
    }
  }
  return out;
}

/** Breakpoints `[t, depth]` along `line` (t from 0 to 1), its depth linear between them. */
function depthAlong(source: OutlineSource, reach: number, line: DrawingLine): Array<[number, number]> {
  const { faces, grid } = facesOf(source, reach);
  const ax = line.line.start.x, ay = line.line.start.y;
  const dx = line.line.end.x - ax, dy = line.line.end.y - ay;
  const fallback = line.depth;

  // Each face near the line: its t interval and its lowered depth alpha + beta·t, floored at its nearest vertex.
  const spans: number[] = [];
  const ts: number[] = [0, 1];
  for (const f of grid.query(Math.min(ax, ax + dx) - reach, Math.min(ay, ay + dy) - reach, Math.max(ax, ax + dx) + reach, Math.max(ay, ay + dy) + reach)) {
    const o = f * STRIDE;
    const edge = faces[o + 9] === EDGE;
    const span = edge ? clipToEdge(faces, o, ax, ay, dx, dy, reach) : clipToFace(faces, o, ax, ay, dx, dy, reach);
    if (!span) continue;
    const [t0, t1, alpha, beta] = span;
    const floor = faces[o + 10];
    spans.push(t0, t1, alpha, beta, floor);
    ts.push(t0, t1);
    if (beta !== 0) {
      const kink = (floor - alpha) / beta;
      if (kink > t0 && kink < t1) ts.push(kink);
    }
  }

  ts.sort((p, q) => p - q);
  const points: Array<[number, number]> = [];
  for (const t of ts) {
    if (t < 0 || t > 1 || (points.length > 0 && t - points[points.length - 1][0] < T_EPS)) continue;
    let depth = Infinity;
    for (let s = 0; s < spans.length; s += 5) {
      if (t < spans[s] - T_EPS || t > spans[s + 1] + T_EPS) continue;
      depth = Math.min(depth, Math.max(spans[s + 2] + spans[s + 3] * t, spans[s + 4]));
    }
    points.push([t, Number.isFinite(depth) ? depth : fallback]);
  }
  if (points[points.length - 1][0] < 1) points[points.length - 1][0] = 1;
  return simplify(clampToCut(points));
}

/**
 * View depth is never negative (0 is the cut plane): clamp, inserting the
 * point where a piece crosses 0 so the clamped chord stays in front.
 */
function clampToCut(points: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i++) {
    const [t, d] = points[i];
    if (i > 0) {
      const [tp, dp] = points[i - 1];
      if ((dp < 0) !== (d < 0) && dp !== d) out.push([tp + (t - tp) * (dp / (dp - d)), 0]);
    }
    out.push([t, Math.max(0, d)]);
  }
  return out;
}

/** Drop breakpoints while the longer chord stays at or in front of every point it skips. */
function simplify(points: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = i + 1;
    while (j + 1 < points.length && chordKeeps(points, i, j + 1)) j++;
    out.push(points[j]);
    i = j;
  }
  return out;
}

function chordKeeps(points: Array<[number, number]>, i: number, j: number): boolean {
  const [ti, di] = points[i];
  const [tj, dj] = points[j];
  for (let k = i + 1; k < j; k++) {
    const [tk, dk] = points[k];
    if (di + (dj - di) * ((tk - ti) / (tj - ti)) > dk + 1e-9) return false;
  }
  return true;
}

/**
 * The t interval of `A + t·D` (t in [0, 1]) inside face `o` grown by `reach`
 * on every edge, or null when it misses (Liang-Barsky against three edges),
 * with the face's depth there as `alpha + beta·t`.
 */
function clipToFace(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  // Orientation, so every edge normal points into the face.
  const ux0 = faces[o], uy0 = faces[o + 1];
  const area2 = (faces[o + 2] - ux0) * (faces[o + 5] - uy0) - (faces[o + 4] - ux0) * (faces[o + 3] - uy0);
  const sign = area2 > 0 ? 1 : -1;
  for (let e = 0; e < 3; e++) {
    const px = faces[o + e * 2], py = faces[o + e * 2 + 1];
    const qx = faces[o + ((e + 1) % 3) * 2], qy = faces[o + ((e + 1) % 3) * 2 + 1];
    const ex = qx - px, ey = qy - py;
    const len = Math.hypot(ex, ey);
    if (len === 0) return null;
    const nx = (-ey * sign) / len, ny = (ex * sign) / len;
    // n·(A + t·D - P) + reach >= 0
    const c = nx * (ax - px) + ny * (ay - py) + reach;
    const k = nx * dx + ny * dy;
    if (k === 0) { if (c < 0) return null; continue; }
    const t = -c / k;
    if (k > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  // The face's depth plane along the line, lowered by its slope times reach.
  return [t0, t1, faces[o + 6] * ax + faces[o + 7] * ay + faces[o + 8] - faces[o + 9] * reach, faces[o + 6] * dx + faces[o + 7] * dy];
}

/**
 * The t interval of `A + t·D` within `reach` of edge `o` (a box around it), with
 * the edge's depth there as `alpha + beta·t`, lowered by its slope times `reach`.
 */
function clipToEdge(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): [number, number, number, number] | null {
  const px = faces[o], py = faces[o + 1];
  const len = Math.hypot(faces[o + 2] - px, faces[o + 3] - py);
  const ex = (faces[o + 2] - px) / len, ey = (faces[o + 3] - py) / len;
  let t0 = 0, t1 = 1;
  // Along the edge from -reach to len + reach, across it within reach.
  for (const [nx, ny, lo, hi] of [[ex, ey, -reach, len + reach], [-ey, ex, -reach, reach]]) {
    const c = nx * (ax - px) + ny * (ay - py);
    const k = nx * dx + ny * dy;
    if (k === 0) { if (c < lo || c > hi) return null; continue; }
    const ta = (lo - c) / k, tb = (hi - c) / k;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return null;
  }
  const slope = (faces[o + 7] - faces[o + 6]) / len;
  const s0 = ex * (ax - px) + ey * (ay - py);
  return [t0, t1, faces[o + 6] + slope * s0 - Math.abs(slope) * reach, slope * (ex * dx + ey * dy)];
}

/** Project the mesh's faces once per source; a face seen edge-on keeps only its edges (it holds no area the raster can fill). */
function facesOf(source: OutlineSource, reach: number): { faces: Float64Array; grid: FaceGrid } {
  if (source.built && source.built.reach === reach) return source.built;
  const { positions, indices, origin } = source.mesh;
  const plane = source.plane;
  const n = Math.floor(indices.length / 3);
  const faces = new Float64Array(n * STRIDE);
  const edges: number[] = [];
  let count = 0;
  for (let t = 0; t < n; t++) {
    const p = [getVertex(positions, indices[t * 3], origin), getVertex(positions, indices[t * 3 + 1], origin), getVertex(positions, indices[t * 3 + 2], origin)];
    const uv = p.map((v) => projectPointForPlane(v, plane));
    const d = p.map((v) => -signedDepth(v, plane));
    const e1u = uv[1].x - uv[0].x, e1v = uv[1].y - uv[0].y, e2u = uv[2].x - uv[0].x, e2v = uv[2].y - uv[0].y;
    const area2 = e1u * e2v - e2u * e1v;
    const ax = p[1].x - p[0].x, ay = p[1].y - p[0].y, az = p[1].z - p[0].z;
    const bx = p[2].x - p[0].x, by = p[2].y - p[0].y, bz = p[2].z - p[0].z;
    const area3 = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    if (!(area3 > 0)) continue;
    if (Math.abs(area2) <= 1e-3 * area3) {
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        if (Math.hypot(uv[j].x - uv[i].x, uv[j].y - uv[i].y) === 0) continue;
        edges.push(uv[i].x, uv[i].y, uv[j].x, uv[j].y, uv[j].x, uv[j].y, d[i], d[j], 0, EDGE, Math.min(d[i], d[j]));
      }
      continue;
    }
    const e1d = d[1] - d[0], e2d = d[2] - d[0];
    const a = (e1d * e2v - e2d * e1v) / area2;
    const b = (e1u * e2d - e2u * e1d) / area2;
    const o = count * STRIDE;
    faces[o] = uv[0].x; faces[o + 1] = uv[0].y; faces[o + 2] = uv[1].x; faces[o + 3] = uv[1].y; faces[o + 4] = uv[2].x; faces[o + 5] = uv[2].y;
    faces[o + 6] = a; faces[o + 7] = b; faces[o + 8] = d[0] - a * uv[0].x - b * uv[0].y;
    faces[o + 9] = Math.hypot(a, b); faces[o + 10] = Math.min(d[0], d[1], d[2]);
    count++;
  }
  const used = new Float64Array(count * STRIDE + edges.length);
  used.set(faces.subarray(0, count * STRIDE));
  used.set(edges, count * STRIDE);
  source.built = { faces: used, grid: new FaceGrid(used, reach), reach };
  return source.built;
}

/** A uniform grid of face bounds (grown by `reach`), so a line looks only at the faces near it. */
class FaceGrid {
  private readonly cells: number[][];
  private readonly size: number;
  private readonly minU: number;
  private readonly minV: number;
  private readonly cellU: number;
  private readonly cellV: number;
  private readonly seen: Int32Array;
  private stamp = 0;

  constructor(faces: Float64Array, reach: number) {
    const count = faces.length / STRIDE;
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let i = 0; i < faces.length; i += STRIDE) {
      for (let k = 0; k < 6; k += 2) {
        minU = Math.min(minU, faces[i + k]); maxU = Math.max(maxU, faces[i + k]);
        minV = Math.min(minV, faces[i + k + 1]); maxV = Math.max(maxV, faces[i + k + 1]);
      }
    }
    this.size = count > 64 ? Math.min(64, Math.ceil(Math.sqrt(count))) : 1;
    this.minU = minU - reach;
    this.minV = minV - reach;
    this.cellU = Math.max((maxU - minU + 2 * reach) / this.size, 1e-12);
    this.cellV = Math.max((maxV - minV + 2 * reach) / this.size, 1e-12);
    this.cells = Array.from({ length: this.size * this.size }, () => []);
    this.seen = new Int32Array(count);
    for (let f = 0; f < count; f++) {
      const o = f * STRIDE;
      const lo = this.cellRange(Math.min(faces[o], faces[o + 2], faces[o + 4]) - reach, Math.min(faces[o + 1], faces[o + 3], faces[o + 5]) - reach);
      const hi = this.cellRange(Math.max(faces[o], faces[o + 2], faces[o + 4]) + reach, Math.max(faces[o + 1], faces[o + 3], faces[o + 5]) + reach);
      for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) this.cells[y * this.size + x].push(f);
    }
  }

  private cellRange(u: number, v: number): [number, number] {
    const clamp = (c: number) => Math.max(0, Math.min(this.size - 1, Math.floor(c)));
    return [clamp((u - this.minU) / this.cellU), clamp((v - this.minV) / this.cellV)];
  }

  /** Faces whose grown bounds may meet the box. */
  query(minU: number, minV: number, maxU: number, maxV: number): number[] {
    const lo = this.cellRange(minU, minV);
    const hi = this.cellRange(maxU, maxV);
    const found: number[] = [];
    this.stamp++;
    for (let y = lo[1]; y <= hi[1]; y++) {
      for (let x = lo[0]; x <= hi[0]; x++) {
        for (const f of this.cells[y * this.size + x]) {
          if (this.seen[f] === this.stamp) continue;
          this.seen[f] = this.stamp;
          found.push(f);
        }
      }
    }
    return found;
  }
}
