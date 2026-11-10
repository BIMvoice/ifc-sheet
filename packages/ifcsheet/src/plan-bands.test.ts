/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #623: the projection bands of a plan, from the one function the app's hook and the engine's sheets share
 * (`planProjectionBands`). The app against the engine on real models is
 * `apps/viewer/src/project/plan-multilevel.parity.test.tsx`; these are the rules it computes by.
 */

import { describe, expect, it } from 'vitest';
import { planProjectionBands, storeyFloorsOf, type PlanBandsInput } from './plan-projection.js';

/** Two storeys, floors at 0 and 3 m, the model from -1 to 6 m, a cut at 1.2 m. */
const base: PlanBandsInput = {
  depth: null, projectionOn: true, floors: [0, 3], position: 1.2, axisMin: -1, axisMax: 6,
  down: true, custom: false, flipped: false, reflected: false,
};
const bands = (over: Partial<PlanBandsInput>) => {
  const { projectionBelowDepth: below, projectionAboveDepth: above, clipProjectionBands: clip, projectionDepth } = planProjectionBands({ ...base, ...over });
  return { below, above, clip, projectionDepth };
};

describe('planProjectionBands (#623)', () => {
  it('scopes an automatic plan to its storey from two floors up: the floor below, the next floor above', () => {
    expect(bands({})).toEqual({ below: 2.2, above: 1.8, clip: false, projectionDepth: 3.5 });
  });

  it('leaves the bands over the whole extent with one floor or with none', () => {
    for (const over of [{ floors: [0] }, { floors: null }]) {
      const b = bands(over);
      expect(b.above + b.below, JSON.stringify(over)).toBeGreaterThan(5);
    }
  });

  it('swaps the two sides for a plane that looks up, so the storey keeps its own floor and ceiling', () => {
    const up = bands({ reflected: true });
    expect(up.below).toBeCloseTo(1.8, 9);
    // the reflected plan sees only above its cut
    expect(up.above).toBe(1e-3);
    const flipped = bands({ flipped: true });
    expect(flipped.below).toBeCloseTo(1.8, 9);
    expect(flipped.above).toBeCloseTo(2.2, 9);
  });

  it('a bounded depth is the floor side exactly and keeps the storey\'s ceiling side; 0 shows the cut only', () => {
    expect(bands({ depth: 1.2 })).toMatchObject({ below: 1.2, above: 1.8, clip: true });
    expect(bands({ depth: 0, projectionOn: false })).toMatchObject({ below: 0, above: 0, clip: true });
  });

  it('a section or custom plane projects its automatic depth and nothing above', () => {
    expect(bands({ down: false, automaticDepth: 7 })).toMatchObject({ below: 7, above: 1e-3 });
  });
});

describe('storeyFloorsOf', () => {
  const mesh = (expressId: number, y: number) => ({ expressId, positions: new Float32Array([0, y, 0, 1, y + 1, 1]), indices: new Uint32Array(0) });
  const meshes = [mesh(1, 0), mesh(2, 3), mesh(3, 3.5)];
  const hierarchy = (buildings: number) => ({ byBuilding: new Map(Array.from({ length: buildings }, (_, i) => [i, i])), elementToStorey: new Map([[1, 10], [2, 11], [3, 11]]) });

  it('reads the floor of each storey from its lowest element', () => {
    expect(storeyFloorsOf(meshes as never, hierarchy(1))).toEqual([0, 3]);
  });
  it('is null for no hierarchy and for more than one building', () => {
    expect(storeyFloorsOf(meshes as never, null)).toBeNull();
    expect(storeyFloorsOf(meshes as never, hierarchy(2))).toBeNull();
  });
});
