/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A bounding volume hierarchy over axis-aligned boxes, the broad phase of the
 * shell check (`measured-shells.ts`, #611). Every node's box is the exact
 * union (min and max, no padding) of the boxes below it, so a node whose box
 * fails a closed overlap test against a query box holds no item that passes
 * it: a query returns a superset of the items the brute-force loop would test,
 * and the narrow phase after it decides exactly as before.
 */

/** Min x, y, z, then max x, y, z. */
export type Box = [number, number, number, number, number, number];

/** Six numbers per box: min x, y, z, then max x, y, z. */
export interface Bvh {
  /** Six per node, as the item boxes. */
  box: Float64Array;
  /** The second child of an inner node; -1 on a leaf. The first child is the next node. */
  right: Int32Array;
  /** A leaf's run in `items`; an inner node's run covers its whole subtree. */
  start: Int32Array;
  count: Int32Array;
  /** Item ids, reordered so each node's items are one run. */
  items: Int32Array;
  /** Room for one walk at a time: the tree is balanced, so 64 levels would hold 2^64 items. */
  stack: Int32Array;
}

const LEAF = 4;

/** The hierarchy over `n` boxes, six numbers each in `boxes`. */
export function buildBvh(boxes: Float64Array, n: number): Bvh {
  const items = new Int32Array(n).map((_, i) => i);
  const centre = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) centre[i * 3 + d] = boxes[i * 6 + d] + boxes[i * 6 + d + 3];
  const cap = Math.max(1, 2 * n);
  const box = new Float64Array(cap * 6), right = new Int32Array(cap), start = new Int32Array(cap), count = new Int32Array(cap);
  let nodes = 0;
  const build = (lo: number, hi: number): void => {
    const node = nodes++;
    const b = node * 6;
    box.fill(Infinity, b, b + 3);
    box.fill(-Infinity, b + 3, b + 6);
    let c0 = Infinity, c1 = Infinity, c2 = Infinity, d0 = -Infinity, d1 = -Infinity, d2 = -Infinity;
    for (let k = lo; k < hi; k++) {
      const i = items[k];
      for (let d = 0; d < 3; d++) {
        // A NaN bound opens the node on that axis: no closed test against NaN rejects, so none may reject above it.
        const lo = boxes[i * 6 + d], hi = boxes[i * 6 + d + 3];
        if (!(lo >= box[b + d])) box[b + d] = Number.isNaN(lo) ? -Infinity : lo;
        if (!(hi <= box[b + d + 3])) box[b + d + 3] = Number.isNaN(hi) ? Infinity : hi;
      }
      const x = centre[i * 3], y = centre[i * 3 + 1], z = centre[i * 3 + 2];
      if (x < c0) c0 = x; if (x > d0) d0 = x;
      if (y < c1) c1 = y; if (y > d1) d1 = y;
      if (z < c2) c2 = z; if (z > d2) d2 = z;
    }
    start[node] = lo;
    count[node] = hi - lo;
    if (hi - lo <= LEAF) { right[node] = -1; return; }
    const axis = d0 - c0 >= d1 - c1 && d0 - c0 >= d2 - c2 ? 0 : d1 - c1 >= d2 - c2 ? 1 : 2;
    items.subarray(lo, hi).sort((p, q) => centre[p * 3 + axis] - centre[q * 3 + axis] || p - q);
    const mid = (lo + hi) >> 1;
    build(lo, mid);
    right[node] = nodes;
    build(mid, hi);
  };
  if (n > 0) build(0, n);
  return { box, right, start, count, items, stack: new Int32Array(64) };
}

/** The hierarchy over these boxes, item j being box j. */
export function treeOf(list: readonly Box[]): Bvh {
  const flat = new Float64Array(list.length * 6);
  for (let j = 0; j < list.length; j++) flat.set(list[j], j * 6);
  return buildBvh(flat, list.length);
}

/**
 * Each item whose box shares a point with [lo, hi] (closed on every axis) is a
 * candidate: `visit` is called on it, maybe on more, never on fewer. Stops and
 * answers true as soon as `visit` does. `visit` may walk another tree, not this one.
 */
export function anyOverlap(
  t: Bvh, lo0: number, lo1: number, lo2: number, hi0: number, hi1: number, hi2: number, visit: (item: number) => boolean,
): boolean {
  if (t.items.length === 0) return false;
  const stack = t.stack, bx = t.box;
  let top = 0;
  stack[top++] = 0;
  while (top > 0) {
    const node = stack[--top];
    const b = node * 6;
    if (hi0 < bx[b] || lo0 > bx[b + 3] || hi1 < bx[b + 1] || lo1 > bx[b + 4] || hi2 < bx[b + 2] || lo2 > bx[b + 5]) continue;
    if (t.right[node] < 0) {
      for (let k = t.start[node], end = k + t.count[node]; k < end; k++) if (visit(t.items[k])) return true;
      continue;
    }
    stack[top++] = t.right[node];
    stack[top++] = node + 1;
  }
  return false;
}
