/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { depthAt } from './paint-order.js';
import type { PaintedSurface } from './surface-fills.js';

/**
 * The points of a grid (`step` metres) over the drawing where the triangle painted last is not the colour of the nearest triangle there
 * (by more than `tolerance` metres): what a viewer sees wrong in the painter's order (#646).
 */
export function misPainted(painted: readonly PaintedSurface[], step: number, tolerance: number): { points: number; wrong: number; samples: string[] } {
  const CELL = 0.5;
  const cells = new Map<string, number[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  painted.forEach((t, n) => {
    const xs = t.corners.map((p) => p.x);
    const ys = t.corners.map((p) => p.y);
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
      for (let j = Math.floor(Math.min(...ys) / CELL); j <= Math.floor(Math.max(...ys) / CELL); j++) {
        const list = cells.get(key(i, j)) ?? [];
        list.push(n);
        cells.set(key(i, j), list);
      }
  });
  const inside = (t: PaintedSurface, p: { x: number; y: number }) => t.corners.every((a, k) => {
    const b = t.corners[(k + 1) % 3];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0;
  });
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of painted.flatMap((t) => t.corners)) [x0, x1, y0, y1] = [Math.min(x0, p.x), Math.max(x1, p.x), Math.min(y0, p.y), Math.max(y1, p.y)];
  let points = 0;
  let wrong = 0;
  const samples: string[] = [];
  for (let x = x0 + step / 2; x < x1; x += step)
    for (let y = y0 + step / 2; y < y1; y += step) {
      const p = { x, y };
      let top = -1;
      let near = -1;
      for (const n of cells.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? []) {
        if (!inside(painted[n], p)) continue;
        top = Math.max(top, n);
        if (near < 0 || depthAt(painted[n], p) < depthAt(painted[near], p)) near = n;
      }
      if (top < 0) continue;
      points++;
      if (painted[top].colour !== painted[near].colour && depthAt(painted[top], p) - depthAt(painted[near], p) > tolerance) {
        wrong++;
        if (samples.length < 400) samples.push(`${x.toFixed(2)},${y.toFixed(2)} top#${top} d=${depthAt(painted[top], p).toFixed(3)} rng=${Math.min(...painted[top].depths).toFixed(2)}-${Math.max(...painted[top].depths).toFixed(2)} ent=${painted[top].fill.entityId} ${painted[top].fill.ifcType} | near#${near} d=${depthAt(painted[near], p).toFixed(3)} rng=${Math.min(...painted[near].depths).toFixed(2)}-${Math.max(...painted[near].depths).toFixed(2)} ent=${painted[near].fill.entityId} ${painted[near].fill.ifcType}`);
      }
    }
  return { points, wrong, samples };
}
