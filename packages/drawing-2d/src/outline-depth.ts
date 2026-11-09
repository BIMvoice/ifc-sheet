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
import { outlineToProjectionLines, type ProjectionBandDepths } from './projection-bands.js';
import { EDGE, FaceGrid, STRIDE, projectTriangle } from './face-grid.js';
import { walkLocal, type LocalSurface } from './local-surface.js';

/** Resolution (pixels on the longer side) of the generator's hidden-line raster. */
export const HIDDEN_LINE_RESOLUTION = 1024;

const T_EPS = 1e-9;

interface OutlineSource {
  mesh: MeshData;
  plane: SectionPlaneConfig;
  /** The projected faces, built on first use for one raster pixel size. */
  built?: { faces: Float64Array; grid: FaceGrid; reach: number };
  /** For a line along a curved surface: the faces that form it, the only ones its depth is read from. */
  near?: LocalSurface;
}

/**
 * Over this many faces near a curved line (an element hardly larger than a raster pixel, a thin rail), its depth is the
 * lowest of each of `BUCKETS` stretches along it rather than exact, which costs the square of the faces.
 */
const MAX_EXACT_SPANS = 48;
const BUCKETS = 8;

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
 * depth of the element's own surface. The silhouette of a curved surface needs it as much as the Rust outline: a
 * column or a handrail is a tube, and its silhouette runs along the rim, behind the tube's own front by up to its radius within one raster
 * pixel, so the column of FZK's spiral stair was hidden by itself in Section A-A (#557).
 */
export function withOwnSurfaceDepth(lines: DrawingLine[], plane: SectionPlaneConfig, mesh: MeshData, near?: LocalSurface): DrawingLine[] {
  const source: OutlineSource = { mesh, plane, near };
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
 * hidden-line raster's extent. Lines from any other producer pass through,
 * and so does a curved line that `coveredByItself` says its own element
 * nowhere covers (`HiddenLineClassifier.coveredByItself`).
 */
export function refineOutlineDepths(lines: DrawingLine[], bounds: Bounds2D, coveredByItself?: (line: DrawingLine) => boolean): DrawingLine[] {
  const reach = rasterPixelSize(bounds);
  if (!(reach > 0)) return lines;
  const out: DrawingLine[] = [];
  for (const line of lines) {
    const source = sources.get(line);
    if (!source || (source.near && coveredByItself && !coveredByItself(line))) { out.push(line); continue; }
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
  const ax = line.line.start.x, ay = line.line.start.y;
  const dx = line.line.end.x - ax, dy = line.line.end.y - ay;
  const fallback = line.depth;

  // Each face near the line: its t interval and its lowered depth alpha + beta·t, floored at its nearest vertex.
  const spans: number[] = [];
  const ts: number[] = [0, 1];
  const add = (faces: Float64Array, o: number): boolean => {
    if (!(faces[o + 9] === EDGE ? clipToEdge(faces, o, ax, ay, dx, dy, reach) : clipToFace(faces, o, ax, ay, dx, dy, reach))) return false;
    const t0 = SPAN[0], t1 = SPAN[1], alpha = SPAN[2], beta = SPAN[3];
    const floor = faces[o + 10];
    spans.push(t0, t1, alpha, beta, floor);
    ts.push(t0, t1);
    if (beta !== 0) {
      const kink = (floor - alpha) / beta;
      if (kink > t0 && kink < t1) ts.push(kink);
    }
    return true;
  };
  if (source.near) walkLocal(source.mesh, source.near, add);
  else {
    const { faces, grid } = facesOf(source, reach);
    for (const f of grid.query(Math.min(ax, ax + dx) - reach, Math.min(ay, ay + dy) - reach, Math.max(ax, ax + dx) + reach, Math.max(ay, ay + dy) + reach)) add(faces, f * STRIDE);
  }

  if (source.near && spans.length > 5 * MAX_EXACT_SPANS) return simplify(clampToCut(bucketed(spans, fallback)));
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
 * Breakpoints at `BUCKETS` even steps along the line, none deeper than the nearest face anywhere in the stretches on
 * either side of it, so the depth between them is a lower bound of the exact one.
 */
function bucketed(spans: number[], fallback: number): Array<[number, number]> {
  const low = new Float64Array(BUCKETS).fill(Infinity);
  for (let s = 0; s < spans.length; s += 5) {
    const t0 = spans[s], t1 = spans[s + 1], alpha = spans[s + 2], beta = spans[s + 3], floor = spans[s + 4];
    const last = Math.min(BUCKETS - 1, Math.floor(t1 * BUCKETS));
    for (let b = Math.max(0, Math.floor(t0 * BUCKETS)); b <= last; b++) {
      const u0 = Math.max(t0, b / BUCKETS), u1 = Math.min(t1, (b + 1) / BUCKETS);
      low[b] = Math.min(low[b], Math.max(Math.min(alpha + beta * u0, alpha + beta * u1), floor));
    }
  }
  const at = (b: number) => (Number.isFinite(low[b]) ? low[b] : fallback);
  const points: Array<[number, number]> = [];
  for (let k = 0; k <= BUCKETS; k++) points.push([k / BUCKETS, Math.min(at(Math.max(0, k - 1)), at(Math.min(BUCKETS - 1, k)))]);
  return points;
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

/** The last clip's `[t0, t1, alpha, beta]` (`clipToFace`, `clipToEdge`), kept here so no clip allocates. */
const SPAN = new Float64Array(4);

function span(t0: number, t1: number, alpha: number, beta: number): true {
  SPAN[0] = t0; SPAN[1] = t1; SPAN[2] = alpha; SPAN[3] = beta;
  return true;
}

/**
 * The t interval of `A + t·D` (t in [0, 1]) inside face `o` grown by `reach`
 * on every edge, or false when it misses (Liang-Barsky against three edges),
 * with the face's depth there as `alpha + beta·t` (in `SPAN`).
 */
function clipToFace(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): boolean {
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
    if (len === 0) return false;
    const nx = (-ey * sign) / len, ny = (ex * sign) / len;
    // n·(A + t·D - P) + reach >= 0
    const c = nx * (ax - px) + ny * (ay - py) + reach;
    const k = nx * dx + ny * dy;
    if (k === 0) { if (c < 0) return false; continue; }
    const t = -c / k;
    if (k > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  // The face's depth plane along the line, lowered by its slope times reach.
  return span(t0, t1, faces[o + 6] * ax + faces[o + 7] * ay + faces[o + 8] - faces[o + 9] * reach, faces[o + 6] * dx + faces[o + 7] * dy);
}

/**
 * The t interval of `A + t·D` within `reach` of edge `o` (a box around it), with
 * the edge's depth there as `alpha + beta·t`, lowered by its slope times `reach`.
 */
function clipToEdge(faces: Float64Array, o: number, ax: number, ay: number, dx: number, dy: number, reach: number): boolean {
  const px = faces[o], py = faces[o + 1];
  const len = Math.hypot(faces[o + 2] - px, faces[o + 3] - py);
  const ex = (faces[o + 2] - px) / len, ey = (faces[o + 3] - py) / len;
  let t0 = 0, t1 = 1;
  // Along the edge from -reach to len + reach, across it within reach.
  for (const [nx, ny, lo, hi] of [[ex, ey, -reach, len + reach], [-ey, ex, -reach, reach]]) {
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
  return span(t0, t1, faces[o + 6] + slope * s0 - Math.abs(slope) * reach, slope * (ex * dx + ey * dy));
}

/** Project the mesh's faces once per source, faces first, then the edges of faces seen edge-on. */
function facesOf(source: OutlineSource, reach: number): { faces: Float64Array; grid: FaceGrid } {
  if (source.built && source.built.reach === reach) return source.built;
  const n = Math.floor(source.mesh.indices.length / 3);
  const faces: number[] = [];
  const edges: number[] = [];
  const one: number[] = [];
  for (let t = 0; t < n; t++) {
    one.length = 0;
    projectTriangle(source.mesh, source.plane, t, one);
    if (one.length > 0) (one[9] === EDGE ? edges : faces).push(...one);
  }
  const used = new Float64Array(faces.length + edges.length);
  used.set(faces);
  used.set(edges, faces.length);
  source.built = { faces: used, grid: new FaceGrid(used, reach), reach };
  return source.built;
}
