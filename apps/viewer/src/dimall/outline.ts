/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The outline of a building from the cut outlines of its walls: the union of
 * the walls (and of door and window openings, which fill the gaps between wall
 * pieces) taken on the grid of the shapes' own edge coordinates, traced as a
 * rectilinear loop. Pure, in a frame where the main walls are axis-aligned;
 * `mainDirection` finds that frame.
 */

import type { Pt } from '@/drafting/types';

/** Edge coordinates closer than this (metres) are one coordinate. */
export const GRID_TOL = 0.005;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function boxOf(ring: readonly Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ring) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

export const unionBox = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
export const ringOfBox = (b: Box): Pt[] => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];

/**
 * The direction the main walls run in, as an angle in (-45, 45] degrees from
 * the x axis: the length-weighted mean of the wall edges' directions taken
 * modulo a right angle. Within 0.05 degrees of the axes it is exactly 0.
 */
export function mainDirection(rings: readonly (readonly Pt[])[]): number {
  let sx = 0, sy = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-9) continue;
      const t = Math.atan2(b.y - a.y, b.x - a.x) * 4;
      sx += len * Math.cos(t);
      sy += len * Math.sin(t);
    }
  }
  if (Math.hypot(sx, sy) < 1e-9) return 0;
  const angle = Math.atan2(sy, sx) / 4;
  return Math.abs(angle) < (0.05 * Math.PI) / 180 ? 0 : angle;
}

export function rotate(p: Pt, angle: number): Pt {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function pointInRing(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The distinct coordinates of `values`, ascending, those within GRID_TOL merged to their mean. */
export function gridLines(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const lines: number[] = [];
  let group: number[] = [];
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > GRID_TOL) {
      lines.push(group.reduce((s, x) => s + x, 0) / group.length);
      group = [];
    }
    group.push(v);
  }
  if (group.length) lines.push(group.reduce((s, x) => s + x, 0) / group.length);
  return lines;
}

const area2 = (loop: readonly Pt[]): number => loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p.x * q.y - q.x * p.y; }, 0);

/** Drop the vertices a straight run passes through. */
function straightened(loop: Pt[]): Pt[] {
  const keep = loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
  });
  return keep.length >= 3 ? keep : loop;
}

/** The first index of the ascending `lines` that is greater than `v`. */
function firstAbove(lines: readonly number[], v: number): number {
  let lo = 0, hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] > v) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * For each cell of the grid (`i * (ys.length - 1) + j`), the shapes, by index, whose box overlaps the cell: a point inside
 * a cell can lie only in a shape whose box overlaps it. A cell no box reaches has none.
 */
function shapesByCell(boxes: readonly Box[], xs: readonly number[], ys: readonly number[]): (number[] | undefined)[] {
  const nx = xs.length - 1, ny = ys.length - 1;
  const cells: (number[] | undefined)[] = new Array(nx * ny);
  boxes.forEach((b, k) => {
    // The cells with a right edge past the box's left and a left edge before its right.
    const i0 = Math.max(0, firstAbove(xs, b.x0) - 1), i1 = Math.min(nx - 1, firstAbove(xs, b.x1) - 1);
    const j0 = Math.max(0, firstAbove(ys, b.y0) - 1), j1 = Math.min(ny - 1, firstAbove(ys, b.y1) - 1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (cells[i * ny + j] ??= []).push(k);
  });
  return cells;
}

/**
 * Which cells of the grid `xs` x `ys` the shapes fill (`filled[i][j]` is the cell between `xs[i]`, `xs[i + 1]` and `ys[j]`, `ys[j + 1]`).
 * Each cell is tested against the shapes whose box reaches it, not against every shape of the plan: a school's plan has some 600
 * grid lines a side and as many shapes, and testing every cell against every shape held the page for 18 s.
 */
export function filledCells(shapes: readonly (readonly Pt[])[], boxes: readonly Box[], xs: readonly number[], ys: readonly number[]): boolean[][] {
  const nx = xs.length - 1, ny = ys.length - 1;
  const filled: boolean[][] = Array.from({ length: nx }, () => new Array<boolean>(ny).fill(false));
  const near = shapesByCell(boxes, xs, ys);
  // A cell is filled when any of four points a quarter in from its corners lies in a shape: walls cut
  // at a mitre meet along a diagonal through the cell, and each covers one half of it.
  const spots: [number, number][] = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const candidates = near[i * ny + j];
      if (!candidates) continue;
      filled[i][j] = spots.some(([fx, fy]) => {
        const c: Pt = { x: xs[i] + (xs[i + 1] - xs[i]) * fx, y: ys[j] + (ys[j + 1] - ys[j]) * fy };
        return candidates.some((k) => c.x > boxes[k].x0 && c.x < boxes[k].x1 && c.y > boxes[k].y0 && c.y < boxes[k].y1 && pointInRing(c, shapes[k]));
      });
    }
  }
  return filled;
}

/**
 * The outer boundary of the union of `shapes`, counter-clockwise (the outside
 * lies to the right of each edge), or null when they enclose nothing. When the
 * shapes make several separate masses, the biggest one.
 */
export function outlineOf(shapes: readonly (readonly Pt[])[]): Pt[] | null {
  if (shapes.length === 0) return null;
  const xs = gridLines(shapes.flatMap((r) => r.map((p) => p.x)));
  const ys = gridLines(shapes.flatMap((r) => r.map((p) => p.y)));
  const boxes = shapes.map(boxOf);
  const nx = xs.length - 1, ny = ys.length - 1;
  if (nx < 1 || ny < 1) return null;
  const filled = filledCells(shapes, boxes, xs, ys);
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && filled[i][j];
  const id = (i: number, j: number) => i * (ny + 1) + j;
  const out = new Map<number, [number, number][]>();
  const edge = (a: [number, number], b: [number, number]) => {
    const k = id(a[0], a[1]);
    out.set(k, [...(out.get(k) ?? []), b]);
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!filled[i][j]) continue;
      if (!at(i, j - 1)) edge([i, j], [i + 1, j]);
      if (!at(i + 1, j)) edge([i + 1, j], [i + 1, j + 1]);
      if (!at(i, j + 1)) edge([i + 1, j + 1], [i, j + 1]);
      if (!at(i - 1, j)) edge([i, j + 1], [i, j]);
    }
  }
  const loops: Pt[][] = [];
  const keys = [...out.keys()].sort((a, b) => a - b);
  for (const start of keys) {
    while ((out.get(start) ?? []).length) {
      const loop: [number, number][] = [];
      let cur: [number, number] = [Math.floor(start / (ny + 1)), start % (ny + 1)];
      let prev: [number, number] | null = null;
      const first = cur;
      do {
        loop.push(cur);
        const nexts = out.get(id(cur[0], cur[1])) ?? [];
        if (nexts.length === 0) break;
        // At a corner where two edges leave, turn right: a room enclosed by the walls stays a hole of its own, not a detour of the outline.
        let pick = 0;
        if (nexts.length > 1 && prev) {
          const d = [cur[0] - prev[0], cur[1] - prev[1]];
          const turn = (n: [number, number]) => d[0] * (n[1] - cur[1]) - d[1] * (n[0] - cur[0]);
          pick = nexts.reduce((best, n, k) => (turn(n) < turn(nexts[best]) ? k : best), 0);
        }
        const next = nexts[pick];
        nexts.splice(pick, 1);
        prev = cur;
        cur = next;
      } while (cur[0] !== first[0] || cur[1] !== first[1]);
      loops.push(loop.map(([i, j]) => ({ x: xs[i], y: ys[j] })));
    }
  }
  let best: Pt[] | null = null;
  for (const loop of loops) if (area2(loop) > 0 && (!best || area2(loop) > area2(best))) best = loop;
  return best ? straightened(best) : null;
}
