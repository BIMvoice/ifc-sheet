/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The outline of a building in an elevation. An elevation reads as one when
 * its outer contour is heavier than the lines inside it. The contour is found
 * the way a draughtsman would trace it: everything the building draws is laid
 * on a fine grid, the empty space outside it is flooded from the edge of the
 * drawing, and a line is part of the outline when that outside space touches
 * it. The ground (`IfcSite`) is not part of the building, so the building's
 * foot is an outline too. Pure and deterministic.
 */

import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';

/** Cells across the longer side of the drawing. */
const GRID = 700;
/** Gaps up to this many cells wide in the line work do not let the outside in. */
const CLOSE_CELLS = 1;
/** How far from a line, in cells, the space beside it is looked at. */
const PROBE_CELLS = 3;
/** Share of a line's length that must have outside space beside it. */
const OUTSIDE_SHARE = 0.5;

const isGround = (l: DrawingLine) => l.ifcType.toUpperCase() === 'IFCSITE';
const drawn = (l: DrawingLine) => l.visibility !== 'hidden' && l.category !== 'hidden' && !isGround(l);

/** The lines of `drawing` that form the outer contour of what it shows, in drawing order. */
export function outlineLines(drawing: Drawing2D): Set<DrawingLine> {
  const lines = drawing.lines.filter(drawn);
  const out = new Set<DrawingLine>();
  if (lines.length === 0) return out;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const { line: { start, end } } of lines) {
    minX = Math.min(minX, start.x, end.x); maxX = Math.max(maxX, start.x, end.x);
    minY = Math.min(minY, start.y, end.y); maxY = Math.max(maxY, start.y, end.y);
  }
  const cell = Math.max(maxX - minX, maxY - minY, 1e-6) / GRID;
  const pad = PROBE_CELLS + 2;
  const nx = Math.ceil((maxX - minX) / cell) + 2 * pad + 1;
  const ny = Math.ceil((maxY - minY) / cell) + 2 * pad + 1;
  const at = (x: number, y: number) => ({ i: Math.round((x - minX) / cell) + pad, j: Math.round((y - minY) / cell) + pad });
  const solid = new Uint8Array(nx * ny);
  for (const { line: { start, end } } of lines) {
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / cell * 2));
    for (let s = 0; s <= steps; s++) {
      const { i, j } = at(start.x + ((end.x - start.x) * s) / steps, start.y + ((end.y - start.y) * s) / steps);
      for (let di = -CLOSE_CELLS; di <= CLOSE_CELLS; di++) for (let dj = -CLOSE_CELLS; dj <= CLOSE_CELLS; dj++) solid[(j + dj) * nx + i + di] = 1;
    }
  }
  const outside = new Uint8Array(nx * ny);
  const stack = [0];
  outside[0] = 1;
  while (stack.length > 0) {
    const k = stack.pop() as number;
    const i = k % nx; const j = (k - i) / nx;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (solid[n] || outside[n]) continue;
      outside[n] = 1;
      stack.push(n);
    }
  }
  for (const l of lines) {
    const { start, end } = l.line;
    const len = Math.hypot(end.x - start.x, end.y - start.y);
    if (len < 1e-9) continue;
    const nxv = -(end.y - start.y) / len; const nyv = (end.x - start.x) / len;
    const samples = Math.max(3, Math.ceil(len / cell / 2));
    let hit = 0;
    for (let s = 0; s < samples; s++) {
      const t = (s + 0.5) / samples;
      const px = start.x + (end.x - start.x) * t; const py = start.y + (end.y - start.y) * t;
      const a = at(px + nxv * cell * PROBE_CELLS, py + nyv * cell * PROBE_CELLS);
      const b = at(px - nxv * cell * PROBE_CELLS, py - nyv * cell * PROBE_CELLS);
      if (outside[a.j * nx + a.i] || outside[b.j * nx + b.i]) hit++;
    }
    if (hit / samples >= OUTSIDE_SHARE) out.add(l);
  }
  return out;
}
