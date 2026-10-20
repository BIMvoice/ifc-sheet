/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Welding vertices by position, for edge adjacency. Run on every mesh at every
 * drawing generation, so it works on numbers: each vertex position is
 * quantised once to integers, hashed into an open-addressing table of vertex
 * numbers, and compared against the vertex already there. No string is built
 * and no Map is touched.
 */

/** Positions closer than this (metres, local frame) are one vertex for adjacency. */
export const WELD_QUANTUM = 1e-4;

/**
 * Index buffer in which every vertex that shares a position with an earlier
 * one points at that earlier vertex ("earlier" is in index order). Positions
 * and vertex data are untouched. An index outside `positions` is left as it is.
 */
export function weldIndices(positions: Float32Array, indices: Uint32Array): Uint32Array {
  const vertexCount = Math.floor(positions.length / 3);
  const out = new Uint32Array(indices.length);
  // `rep[v]`: the vertex that stands for v, once v has been seen; -1 before.
  const rep = new Int32Array(vertexCount).fill(-1);
  // Open addressing, at most half full: the slot holds a representative vertex, -1 when empty.
  let capacity = 16;
  while (capacity < Math.min(vertexCount, indices.length) * 2) capacity *= 2;
  const mask = capacity - 1;
  const table = new Int32Array(capacity).fill(-1);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (v >= vertexCount) { out[i] = v; continue; }
    let r = rep[v];
    if (r < 0) {
      const b = v * 3;
      const qx = Math.round(positions[b] / WELD_QUANTUM);
      const qy = Math.round(positions[b + 1] / WELD_QUANTUM);
      const qz = Math.round(positions[b + 2] / WELD_QUANTUM);
      let slot = (Math.imul(qx | 0, 73856093) ^ Math.imul(qy | 0, 19349663) ^ Math.imul(qz | 0, 83492791)) & mask;
      for (;;) {
        const held = table[slot];
        if (held < 0) { table[slot] = v; r = v; break; }
        const hb = held * 3;
        if (Math.round(positions[hb] / WELD_QUANTUM) === qx && Math.round(positions[hb + 1] / WELD_QUANTUM) === qy && Math.round(positions[hb + 2] / WELD_QUANTUM) === qz) { r = held; break; }
        slot = (slot + 1) & mask;
      }
      rep[v] = r;
    }
    out[i] = r;
  }
  return out;
}
