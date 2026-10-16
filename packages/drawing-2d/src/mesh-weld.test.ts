/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect } from 'vitest';
import { weldIndices, WELD_QUANTUM } from './mesh-weld.js';

/** The welding as first written, with a string key per distinct position: the oracle. */
function reference(positions: Float32Array, indices: Uint32Array): Uint32Array {
  const first = new Map<string, number>();
  const rep = new Map<number, number>();
  const out = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    let r = rep.get(idx);
    if (r === undefined) {
      const b = idx * 3;
      const key = `${Math.round(positions[b] / WELD_QUANTUM)},${Math.round(positions[b + 1] / WELD_QUANTUM)},${Math.round(positions[b + 2] / WELD_QUANTUM)}`;
      r = first.get(key);
      if (r === undefined) { first.set(key, idx); r = idx; }
      rep.set(idx, r);
    }
    out[i] = r;
  }
  return out;
}

/** A tessellated surface: a vertex per triangle corner, some with noise below the quantum, some with noise above. */
function soup(cells: number, seed: number): { positions: Float32Array; indices: Uint32Array } {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pos: number[] = [];
  const idx: number[] = [];
  const corner = (x: number, y: number, z: number, jitter: number) => { idx.push(pos.length / 3); pos.push(x + (rnd() - 0.5) * jitter, y + (rnd() - 0.5) * jitter, z + (rnd() - 0.5) * jitter); };
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const j0 = rnd() < 0.5 ? 1e-6 : 3e-4;
      for (const [x, z] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) corner(x * 0.37 - 8, 1.5 + Math.sin(x * 0.3) * Math.cos(z * 0.3), z * 0.37 + 2, j0);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

describe('weldIndices', () => {
  it('welds the same vertices to the same representatives as the string-keyed welding', () => {
    for (const seed of [1, 2, 3]) {
      const { positions, indices } = soup(30, seed);
      expect(Array.from(weldIndices(positions, indices))).toEqual(Array.from(reference(positions, indices)));
    }
  });

  it('welds a repeated corner and leaves a distinct one alone', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.00001, 0, 0, 1, 1, 0]);
    // The fourth vertex sits within the quantum of the first.
    const out = weldIndices(positions, new Uint32Array([0, 1, 2, 3, 1, 4]));
    expect(Array.from(out)).toEqual([0, 1, 2, 0, 1, 4]);
  });

  it('copes with coordinates far beyond a 32-bit cell number and with an empty mesh', () => {
    const far = new Float32Array([4e5, 4e5, 4e5, 4e5, 4e5, 4e5, 4e5 + 1, 4e5, 4e5]);
    expect(Array.from(weldIndices(far, new Uint32Array([0, 1, 2])))).toEqual(Array.from(reference(far, new Uint32Array([0, 1, 2]))));
    expect(weldIndices(new Float32Array(0), new Uint32Array(0)).length).toBe(0);
  });

  it('leaves an index outside the positions as it is', () => {
    expect(Array.from(weldIndices(new Float32Array([0, 0, 0]), new Uint32Array([0, 7])))).toEqual([0, 7]);
  });
});
