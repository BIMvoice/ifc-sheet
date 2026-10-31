/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #628: a slab edge exactly on the band edge. The app's cut position is `min + (percent / 100) * (max - min)`, which for
 * a 1.2 m cut over FZK is 1.2000000000000002, so the ground slab, exactly 1.2 m under the intended cut, fell one
 * rounding error outside a 1.2 m band the engine's exact 1.2 keeps it in.
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import { bandEdgeTolerance, bandsWithEdgeTolerance, classifyDepthRange } from './projection-bands.js';
import type { SectionConfig } from './types.js';

/** The app's cut position for a 1.2 m cut over FZK's bounds. */
const NOISY_CUT = 1.2000000000000002;

/** One upward-facing quad at height `y`: a slab top. */
function quad(y: number): MeshData {
  const positions = new Float32Array([-1, y, -1, 1, y, -1, 1, y, 1, -1, y, 1]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  return { expressId: 1, ifcType: 'IfcSlab', modelIndex: 0, positions, normals, indices: new Uint32Array([0, 2, 1, 0, 3, 2]), color: [1, 1, 1, 1] };
}

async function projectionLines(slabY: number, position: number): Promise<number> {
  const config: SectionConfig = {
    plane: { axis: 'y', position, flipped: false },
    projectionDepth: 1.2, projectionBelowDepth: 1.2, projectionAboveDepth: 1e-3,
    clipProjectionBands: true, includeHiddenLines: true, creaseAngle: 30, scale: 100,
  };
  const g = new Drawing2DGenerator();
  await g.initialize();
  const d = await g.generate([quad(slabY)], config, { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: true });
  return d.lines.filter((l) => l.category === 'projection').length;
}

describe('a slab on the band edge (#628)', () => {
  it('keeps a slab exactly 1.2 m under a cut with float noise, and under the exact cut', async () => {
    expect(await projectionLines(0, 1.2)).toBeGreaterThan(0);
    expect(await projectionLines(0, NOISY_CUT)).toBeGreaterThan(0);
  });

  it('keeps a slab just inside the band', async () => {
    expect(await projectionLines(0.001, NOISY_CUT)).toBeGreaterThan(0);
  });

  it('leaves out a slab just outside the band, 1 micrometre past its edge, noisy cut or exact', async () => {
    expect(await projectionLines(-1e-6, NOISY_CUT)).toBe(0);
    expect(await projectionLines(-1e-6, 1.2)).toBe(0);
  });
});

describe('bandEdgeTolerance holds at both ends of the coordinate range', () => {
  const ulp = (x: number) => 2 ** (Math.floor(Math.log2(Math.abs(x))) - 52);
  /** The depth of a point `rise` metres above `position` with the cut `err` off, as the classifier sees it. */
  const kept = (position: number, err: number, outside: number) => {
    const edge = position - 1.2;
    const depth = (edge - outside) - (position + err);
    return classifyDepthRange(depth, depth, { below: 1.2 + bandEdgeTolerance(position), above: 1e-3 }) !== 'cull';
  };

  it('is never below the exact comparison it replaces, and tiny near 0', () => {
    expect(bandEdgeTolerance(0)).toBeGreaterThanOrEqual(1e-9);
    expect(bandEdgeTolerance(1.2)).toBeLessThan(1e-8);
  });

  it('near 0, absorbs a 4-ulp cut error and rejects 1 micrometre outside', () => {
    expect(kept(1.2, 4 * ulp(1.2), 0)).toBe(true);
    expect(kept(1.2, 0, 1e-6)).toBe(false);
  });

  it('at 5e6 m, absorbs a 4-ulp cut error (ulp 9.3e-10) and rejects 1 micrometre outside, under 10 nm', () => {
    expect(bandEdgeTolerance(5e6)).toBeGreaterThan(4 * ulp(5e6));
    expect(bandEdgeTolerance(5e6)).toBeLessThan(1e-8);
    expect(kept(5e6, 4 * ulp(5e6), 0)).toBe(true);
    expect(kept(5e6, 0, 1e-6)).toBe(false);
  });
});

describe('the tolerance is for plans only (#628)', () => {
  const base = { projectionDepth: 5, projectionBelowDepth: 5, projectionAboveDepth: 2 };
  const plane = (axis: 'x' | 'y' | 'z', extra: object = {}) => ({ plane: { axis, position: 1.2000000000000002, flipped: false, ...extra }, ...base });

  it('widens a plain y plan, on both sides', () => {
    const { below, above } = bandsWithEdgeTolerance(plane('y'));
    expect(below).toBeGreaterThan(5);
    expect(above).toBeGreaterThan(2);
  });

  it('leaves a section on x or z, and a picked plane, at exactly the depths it was given', () => {
    for (const config of [plane('x'), plane('z'), plane('y', { customPlane: { normal: { x: 0, y: 1, z: 0 }, distance: 1.2 } })]) {
      expect(bandsWithEdgeTolerance(config)).toEqual({ below: 5, above: 2 });
    }
  });
});
