/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useViewerStore } from '@/store';
import { ELEVATION_INSET_M } from '@/project/view-plane';
import { bodyElevationOffset } from './body.js';

/** An element 1 x 1 x 1 whose local box is carried to (x, 0, z) by its placement. */
const element = (x: number, z: number) => ({
  localBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  localToWorld: [1, 0, 0, x, 0, 1, 0, 0, 0, 0, 1, z, 0, 0, 0, 1],
});

function load(meshes: ReturnType<typeof element>[], shifted: { minZ: number; maxZ: number }): void {
  useViewerStore.setState({
    models: new Map(),
    geometryResult: {
      meshes,
      coordinateInfo: { shiftedBounds: { min: { x: 0, y: 0, z: shifted.minZ }, max: { x: 60, y: 1, z: shifted.maxZ } } },
    } as never,
  });
}

describe('a new elevation stands at the building, not at the model box', () => {
  beforeEach(() => load([], { minZ: 0, maxZ: 1 }));

  it('ignores a stray element far from the building', () => {
    // A building 0..8 along z with a survey marker 50 m north of it.
    load([element(0, 0), element(1, 7), element(40, 50)], { minZ: 0, maxZ: 51 });
    const north = bodyElevationOffset('north') as number;
    const south = bodyElevationOffset('south') as number;
    assert.ok(Math.abs(north - (0 + ELEVATION_INSET_M)) < 1e-9);
    assert.ok(Math.abs(south - (8 - ELEVATION_INSET_M)) < 1e-9);
  });

  it('has no offset when no model is loaded', () => {
    useViewerStore.setState({ models: new Map(), geometryResult: null });
    assert.equal(bodyElevationOffset('north'), undefined);
  });
});
