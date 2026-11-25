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
import { EDGE, FaceGrid, SPAN, STRIDE, clipToEdge, clipToFace, projectMesh } from './face-grid.js';
import { localDepth, type LocalSurface } from './local-surface.js';

/** Resolution (pixels on the longer side) of the generator's hidden-line raster. */
export const HIDDEN_LINE_RESOLUTION = 1024;

const T_EPS = 1e-9;
/** A curved line's depth is kept within this of its sampled own surface (metres) when its breakpoints are thinned. */
const NEAR_TOLERANCE = 5e-4;

interface OutlineSource {
  mesh: MeshData;
  plane: SectionPlaneConfig;
  /** The projected faces, built on first use for one raster pixel size. */
  built?: { faces: Float64Array; grid: FaceGrid; reach: number };
  /** For a line along a curved surface: the faces that form it, the only ones its depth is read from. */
  near?: LocalSurface;
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
export function refineOutlineDepths(lines: DrawingLine[], bounds: Bounds2D, coveredByItself?: (line: DrawingLine) => boolean, tick?: () => void): DrawingLine[] {
  const reach = rasterPixelSize(bounds);
  if (!(reach > 0)) return lines;
  const out: DrawingLine[] = [];
  for (const line of lines) {
    tick?.();
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

/**
 * Scratch buffers for `depthAlong`, reused across lines: an outline line meets
 * hundreds of faces of its own element (every face within a raster pixel), so
 * a tuple per face and a fresh array per line made the collector a third of
 * the cost on ISSUE_068 (#557).
 */
let spanBuf = new Float64Array(5 * 256);
let tBuf = new Float64Array(3 * 256 + 2);

/** Breakpoints `[t, depth]` along `line` (t from 0 to 1), its depth linear between them. */
function depthAlong(source: OutlineSource, reach: number, line: DrawingLine): Array<[number, number]> {
  const ax = line.line.start.x, ay = line.line.start.y;
  const dx = line.line.end.x - ax, dy = line.line.end.y - ay;
  const fallback = line.depth;

  if (source.near) return simplify(clampToCut(localDepth(source.mesh, source.near, reach, line)), NEAR_TOLERANCE);

  // Each face near the line, nearest first: its t interval and its lowered depth alpha + beta·t, floored at its
  // nearest vertex. Once the faces taken put the whole line at or in front of the next face's nearest vertex, no face
  // left can bring any of it nearer (`coveredBy`): the rest still add their breakpoints, so the line is cut where it
  // was, but no depth is read off them.
  const { faces, grid } = facesOf(source, reach);
  const found = grid.query(Math.min(ax, ax + dx), Math.min(ay, ay + dy), Math.max(ax, ax + dx), Math.max(ay, ay + dy));
  const near = grid.found;
  if (spanBuf.length < found * 5) spanBuf = new Float64Array(found * 10);
  if (tBuf.length < found * 3 + 2) tBuf = new Float64Array(found * 6 + 2);
  const spans = spanBuf, ts = tBuf;
  let ns = 0, nt = 0;
  ts[nt++] = 0;
  ts[nt++] = 1;
  let taken = found;
  for (let i = 0, check = 4; i < found; i++) {
    const o = near[i] * STRIDE;
    const floor = faces[o + 10];
    if (taken === found && ns >= check * 5) {
      check *= 2;
      if (coveredBy(spans, ns, floor)) taken = i;
    }
    if (!(faces[o + 9] === EDGE ? clipToEdge(faces, o, ax, ay, dx, dy, reach) : clipToFace(faces, o, ax, ay, dx, dy, reach))) continue;
    const t0 = SPAN[0], t1 = SPAN[1], alpha = SPAN[2], beta = SPAN[3];
    if (i < taken) { spans[ns++] = t0; spans[ns++] = t1; spans[ns++] = alpha; spans[ns++] = beta; spans[ns++] = floor; }
    ts[nt++] = t0;
    ts[nt++] = t1;
    if (beta !== 0) {
      const kink = (floor - alpha) / beta;
      if (kink > t0 && kink < t1) ts[nt++] = kink;
    }
  }

  // Numeric order; no t is NaN, and +0 and -0 give the same point.
  const sorted = ts.subarray(0, nt).sort();
  const points: Array<[number, number]> = [];
  // The depth at each t is the nearest of the spans over it. The t are read in order, so the spans are swept: each joins
  // the spans over t when t reaches its start and leaves when t passes its end, and a t reads only the spans over it, not
  // every span of the line (#863: a long outline over a finely meshed element met thousands, for each of thousands of t).
  // The nearest of the same spans is the same number in any order, so the depths are those of reading every span.
  const sweep = spanSweep(spans, ns);
  let next = 0, nActive = 0;
  const active = sweep.active;
  for (let i = 0; i < nt; i++) {
    const t = sorted[i];
    if (t < 0 || t > 1 || (points.length > 0 && t - points[points.length - 1][0] < T_EPS)) continue;
    while (next < sweep.count && !(t < sweep.start[next])) active[nActive++] = sweep.order[next++];
    let depth = Infinity;
    let kept = 0;
    for (let a = 0; a < nActive; a++) {
      const s = active[a];
      if (t > spans[s + 1] + T_EPS) continue; // past its end, and so past it for every later t
      active[kept++] = s;
      depth = Math.min(depth, Math.max(spans[s + 2] + spans[s + 3] * t, spans[s + 4]));
    }
    nActive = kept;
    points.push([t, Number.isFinite(depth) ? depth : fallback]);
  }
  if (points[points.length - 1][0] < 1) points[points.length - 1][0] = 1;
  return simplify(clampToCut(points));
}

let sweepStart = new Float64Array(256);
let sweepOrder = new Int32Array(256);
let sweepActive = new Int32Array(256);

/**
 * The spans (`[t0, t1, alpha, beta, floor]` each) by where they start to count, `t0 - T_EPS`, as offsets into `spans`. A
 * span whose start is NaN counts from the first t, as the test `t < NaN` that it replaces never skipped it.
 */
function spanSweep(spans: Float64Array, ns: number): { start: Float64Array; order: Int32Array; active: Int32Array; count: number } {
  const count = ns / 5;
  if (sweepOrder.length < count) { sweepStart = new Float64Array(count * 2); sweepOrder = new Int32Array(count * 2); sweepActive = new Int32Array(count * 2); }
  const order = sweepOrder.subarray(0, count);
  for (let k = 0; k < count; k++) order[k] = k * 5;
  const from = (s: number): number => { const v = spans[s] - T_EPS; return Number.isNaN(v) ? -Infinity : v; };
  order.sort((a, b) => from(a) - from(b));
  for (let k = 0; k < count; k++) sweepStart[k] = from(order[k]);
  return { start: sweepStart, order: sweepOrder, active: sweepActive, count };
}

let partBuf = new Float64Array(2 * 256);
let orderBuf = new Int32Array(256);

/**
 * Whether the spans (`[t0, t1, alpha, beta, floor]` each) put every t in [0, 1] at or in front of `level`: the parts
 * of each that are, sorted by where they start, leave no gap from 0 to 1.
 */
function coveredBy(spans: Float64Array, ns: number, level: number): boolean {
  if (orderBuf.length < ns / 5) { partBuf = new Float64Array((ns / 5) * 4); orderBuf = new Int32Array((ns / 5) * 2); }
  const parts = partBuf, order = orderBuf;
  let n = 0;
  for (let s = 0; s < ns; s += 5) {
    if (spans[s + 4] > level) continue;
    let t0 = spans[s], t1 = spans[s + 1];
    const alpha = spans[s + 2], beta = spans[s + 3];
    if (beta === 0) { if (alpha > level) continue; }
    else if (beta > 0) t1 = Math.min(t1, (level - alpha) / beta);
    else t0 = Math.max(t0, (level - alpha) / beta);
    if (!(t0 <= t1)) continue;
    parts[n * 2] = t0; parts[n * 2 + 1] = t1; order[n] = n; n++;
  }
  order.subarray(0, n).sort((p, q) => parts[p * 2] - parts[q * 2]);
  let reached = 0;
  for (let k = 0; k < n && reached < 1; k++) {
    const i = order[k];
    if (parts[i * 2] > reached) return false;
    reached = Math.max(reached, parts[i * 2 + 1]);
  }
  return reached >= 1;
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

/**
 * Drop breakpoints while the longer chord stays at or in front of every point it skips.
 *
 * The chord from point i may take any slope that keeps each point it skips: at most `(dk + slack - di) / (tk - ti)` for
 * each, and with a `tolerance` at least `(dk - tolerance - di) / (tk - ti)`. Those bounds grow by one point per longer
 * chord, so a chord whose slope is inside them, by more than the rounding of {@link chordKeeps}, keeps every point
 * without reading them again; only a chord at or past a bound is read point by point, by `chordKeeps` as before. The
 * same points are dropped, and a run of n points costs n steps, not n² (#863: a long outline's depth has thousands).
 */
function simplify(points: Array<[number, number]>, tolerance?: number): Array<[number, number]> {
  const out: Array<[number, number]> = [points[0]];
  let most = 0;
  for (const p of points) most = Math.max(most, Math.abs(p[1]));
  // More than `chordKeeps` and the bounds below can round by, between them, on depths of this size.
  const rounding = 64 * Number.EPSILON * (most + 1);
  const slack = tolerance ?? CHORD_SLACK;
  let i = 0;
  while (i < points.length - 1) {
    const [ti, di] = points[i];
    let j = i + 1;
    let below = Infinity, above = -Infinity;
    while (j + 1 < points.length) {
      const [tk, dk] = points[j];
      below = Math.min(below, (dk + slack - di - rounding) / (tk - ti));
      if (tolerance !== undefined) above = Math.max(above, (dk - tolerance - di + rounding) / (tk - ti));
      const [tj, dj] = points[j + 1];
      const slope = (dj - di) / (tj - ti);
      if (!((slope <= below && slope >= above) || chordKeeps(points, i, j + 1, tolerance))) break;
      j++;
    }
    out.push(points[j]);
    i = j;
  }
  return out;
}

/** How far behind a point a chord may pass and still keep it, without a tolerance. */
const CHORD_SLACK = 1e-9;

/** Whether the chord from point i to point j stays in front of every point between, or with `tolerance` within it either way. */
function chordKeeps(points: Array<[number, number]>, i: number, j: number, tolerance?: number): boolean {
  const [ti, di] = points[i];
  const [tj, dj] = points[j];
  for (let k = i + 1; k < j; k++) {
    const [tk, dk] = points[k];
    const chord = di + (dj - di) * ((tk - ti) / (tj - ti));
    if (tolerance === undefined ? chord > dk + CHORD_SLACK : Math.abs(chord - dk) > tolerance) return false;
  }
  return true;
}

/** Project the mesh's faces once per source, nearest first (`projectMesh`). */
function facesOf(source: OutlineSource, reach: number): { faces: Float64Array; grid: FaceGrid } {
  if (source.built && source.built.reach === reach) return source.built;
  const faces = projectMesh(source.mesh, source.plane);
  source.built = { faces, grid: new FaceGrid(faces, reach), reach };
  return source.built;
}
