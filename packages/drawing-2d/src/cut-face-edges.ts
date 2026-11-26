/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether a point is strictly inside a cut face, without walking every edge of a large face for every point (#863).
 *
 * `dropInsideCutFaces` asks it at the middle of every run of every line near a face, and the plain test walks all the
 * face's edges: for the distance to each, and for the crossings of a ray to the right. On O-S1's South Elevation (395,130
 * lines behind 394 cut faces of up to 840 edges) that was 323 s of a 427 s drawing. A face's edges are filed once in a grid
 * ({@link FaceEdgeIndex}), and a point reads only the edges in its own cell (for the distance) and in the cells along one
 * ray out of the face (for the crossings).
 */

import type { Point2D } from './types.js';

/** Distance from `p` to the segment `a`-`b`. */
export function segmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether the ray from `p` to the right crosses the edge `a`-`b`: the even-odd step of the plain inside test. */
export function rayCrosses(p: Point2D, a: Point2D, b: Point2D): boolean {
  return (a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
}

/** The same step for a ray along x (`+1` right, `-1` left) or along y (`+2` up, `-2` down). */
function crossesToward(dir: number, p: Point2D, a: Point2D, b: Point2D): boolean {
  if (dir === 1) return rayCrosses(p, a, b);
  if (dir === -1) return (a.y > p.y) !== (b.y > p.y) && p.x > a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
  if ((a.x > p.x) === (b.x > p.x)) return false;
  const y = a.y + ((p.x - a.x) * (b.y - a.y)) / (b.x - a.x);
  return dir === 2 ? p.y < y : p.y > y;
}

/**
 * A face with at least this many edges is tested through its index; a smaller one edge by edge. Measured on that elevation's
 * lines and faces: 16 s at 8, 20 s at 16, 33 s at 32, 46 s at 64, the same at 3.
 */
export const INDEXED_EDGES = 8;
/** Margin over the tolerance for filing an edge in a cell: more than the rounding of `segmentDistance`. */
const MARGIN = 1e-9;

/**
 * A face's edges filed in a grid of cells, each edge in the cells its box (grown by `reach`) meets.
 *
 * Inside: a point further than the tolerance from every edge is inside when a ray from it crosses the rings an odd number of
 * times, whichever way the ray goes; only the edges in the cells it passes can cross it. The plain test always looks right
 * along x, past every edge of the face; here the ray goes the way that passes the fewest filed edges. A point within the
 * tolerance of an edge has that edge filed in its own cell, and is not inside, as in the plain test. The crossing count of
 * two rays can differ only for a point within a rounding error of an edge, which the tolerance has already excluded.
 */
export class FaceEdgeIndex {
  /** Edge `e` runs from `from[e]` to `to[e]`: ring point j to ring point i, as the plain test walks them. */
  private readonly from: Point2D[] = [];
  private readonly to: Point2D[] = [];
  private readonly minX: number;
  private readonly minY: number;
  private rowH = 1;
  private colW = 1;
  private nRows = 1;
  private nCols = 1;
  /** Cell `r * nCols + c` holds edges `items[start[k]]` up to `items[start[k + 1]]`. */
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  /** Entries in the cells of row r before column c: `alongRow[r * (nCols + 1) + c]`; and down column c before row r. */
  private readonly alongRow: Int32Array;
  private readonly alongCol: Int32Array;
  private readonly seen: Int32Array;
  private stamp = 0;
  /** Whether every ring point has finite coordinates; the plain test is used otherwise. */
  readonly usable: boolean;

  /** `reach`: the largest tolerance the index answers for. */
  constructor(rings: readonly (readonly Point2D[])[], readonly reach: number) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        this.from.push(ring[j]);
        this.to.push(ring[i]);
        minX = Math.min(minX, ring[i].x); maxX = Math.max(maxX, ring[i].x);
        minY = Math.min(minY, ring[i].y); maxY = Math.max(maxY, ring[i].y);
      }
    }
    const n = this.from.length;
    this.usable = Number.isFinite(minX + minY + maxX + maxY);
    const grow = reach + MARGIN;
    this.minX = minX - grow;
    this.minY = minY - grow;
    const { from, to } = this;
    // Cells about as wide and as high as the edges are on average, so most edges lie in one or two, and a ray out of the face
    // meets few edges that it does not cross: a saw of thin teeth gets thin columns. Then fewer cells while they are more
    // than four to an edge, or while the edges would be filed more than sixteen times each, on average.
    const w = maxX - minX + 2 * grow, h = maxY - minY + 2 * grow;
    let sumW = 0, sumH = 0;
    for (let e = 0; e < n; e++) { sumW += Math.abs(to[e].x - from[e].x); sumH += Math.abs(to[e].y - from[e].y); }
    const fit = (span: number, mean: number): number => Math.max(1, Math.min(4096, Math.ceil(span / Math.max(mean, span / 4096, 1e-12))));
    let cols = this.usable ? fit(w, sumW / n) : 1, rows = this.usable ? fit(h, sumH / n) : 1;
    const shrink = (): void => { if (cols >= rows) cols = Math.ceil(cols / 2); else rows = Math.ceil(rows / 2); };
    const sizeCells = (): void => {
      this.nRows = rows; this.nCols = cols;
      this.rowH = Math.max(h / rows, 1e-12);
      this.colW = Math.max(w / cols, 1e-12);
    };
    const each = (e: number, file: (cell: number) => void): void => {
      const r0 = this.row(Math.min(from[e].y, to[e].y) - grow), r1 = this.row(Math.max(from[e].y, to[e].y) + grow);
      const c0 = this.col(Math.min(from[e].x, to[e].x) - grow), c1 = this.col(Math.max(from[e].x, to[e].x) + grow);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) file(r * this.nCols + c);
    };
    const entries = (): number => {
      let total = 0;
      for (let e = 0; e < n; e++) {
        const r = this.row(Math.max(from[e].y, to[e].y) + grow) - this.row(Math.min(from[e].y, to[e].y) - grow) + 1;
        const c = this.col(Math.max(from[e].x, to[e].x) + grow) - this.col(Math.min(from[e].x, to[e].x) - grow) + 1;
        total += r * c;
      }
      return total;
    };
    while (cols * rows > 4 * n + 64) shrink();
    sizeCells();
    while ((cols > 1 || rows > 1) && entries() > 16 * n + 4096) { shrink(); sizeCells(); }
    const cells = this.nRows * this.nCols;
    const start = new Int32Array(cells + 1);
    if (this.usable) for (let e = 0; e < n; e++) each(e, (k) => { start[k + 1]++; });
    const size = (k: number): number => start[k + 1];
    this.alongRow = new Int32Array(this.nRows * (this.nCols + 1));
    this.alongCol = new Int32Array(this.nCols * (this.nRows + 1));
    for (let r = 0; r < this.nRows; r++) {
      for (let c = 0; c < this.nCols; c++) {
        this.alongRow[r * (this.nCols + 1) + c + 1] = this.alongRow[r * (this.nCols + 1) + c] + size(r * this.nCols + c);
        this.alongCol[c * (this.nRows + 1) + r + 1] = this.alongCol[c * (this.nRows + 1) + r] + size(r * this.nCols + c);
      }
    }
    for (let k = 0; k < cells; k++) start[k + 1] += start[k];
    const items = new Int32Array(start[cells]);
    const next = start.slice(0, cells);
    if (this.usable) for (let e = 0; e < n; e++) each(e, (k) => { items[next[k]++] = e; });
    this.start = start;
    this.items = items;
    this.seen = new Int32Array(n);
  }

  /** The row of height `y`, clamped: never decreasing in `y`, so a point of an edge's grown box lies in a cell it is filed in. */
  private row(y: number): number {
    const r = Math.floor((y - this.minY) / this.rowH);
    return r < 0 ? 0 : r >= this.nRows ? this.nRows - 1 : r;
  }

  private col(x: number): number {
    const c = Math.floor((x - this.minX) / this.colW);
    return c < 0 ? 0 : c >= this.nCols ? this.nCols - 1 : c;
  }

  /** Inside the rings (even-odd) and further than `tolerance` (at most `reach`) from every edge: the plain test's answer. */
  strictlyInside(p: Point2D, tolerance: number): boolean {
    const { from, to, start, items, nCols, nRows } = this;
    const r = this.row(p.y), c = this.col(p.x);
    const own = r * nCols + c;
    for (let k = start[own], end = start[own + 1]; k < end; k++) {
      const e = items[k];
      if (segmentDistance(p, from[e], to[e]) <= tolerance) return false;
    }
    // The way out of the face past the fewest filed edges.
    const row = r * (nCols + 1), col = c * (nRows + 1);
    const right = this.alongRow[row + nCols] - this.alongRow[row + c];
    const left = this.alongRow[row + c + 1];
    const up = this.alongCol[col + nRows] - this.alongCol[col + r];
    const down = this.alongCol[col + r + 1];
    const least = Math.min(right, left, up, down);
    const dir = least === right ? 1 : least === left ? -1 : least === up ? 2 : -2;
    const stamp = ++this.stamp;
    let inside = false;
    const steps = dir === 1 ? nCols - c : dir === -1 ? c + 1 : dir === 2 ? nRows - r : r + 1;
    // `least` entries lie along the ray: once they are all read, the cells left are empty.
    let unread = least;
    for (let i = 0; i < steps && unread > 0; i++) {
      const cell = dir === 1 ? own + i : dir === -1 ? own - i : dir === 2 ? own + i * nCols : own - i * nCols;
      unread -= start[cell + 1] - start[cell];
      for (let k = start[cell], end = start[cell + 1]; k < end; k++) {
        const e = items[k];
        if (this.seen[e] === stamp) continue;
        this.seen[e] = stamp;
        if (crossesToward(dir, p, from[e], to[e])) inside = !inside;
      }
    }
    return inside;
  }
}
