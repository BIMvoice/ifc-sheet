/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useViewerStore } from '@/store';
import { ELEVATION_CLEARANCE_M } from '@/project/view-plane';
import { bodyElevationOffset, mainBodyExtent } from './body.js';

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
    assert.ok(Math.abs(north - (0 - ELEVATION_CLEARANCE_M)) < 1e-9);
    assert.ok(Math.abs(south - (8 + ELEVATION_CLEARANCE_M)) < 1e-9);
  });

  it('has no offset when no model is loaded', () => {
    useViewerStore.setState({ models: new Map(), geometryResult: null });
    assert.equal(bodyElevationOffset('north'), undefined);
  });
});

/** A georeferenced model: the file's coordinates are hundreds of kilometres out, the render frame is shifted back by the RTC offset (IFC Z-up). */
const RTC_IFC = { x: 512_340, y: 5_251_870, z: 118 };
/** The same offset in the render frame's Y-up axes: (x, z, -y). */
const RTC_YUP = { x: RTC_IFC.x, y: RTC_IFC.z, z: -RTC_IFC.y };
/** An element at render-frame (x, 0, z): its placement ends in the PRE-RTC absolute origin (`MeshData.localToWorld`). */
const georeferenced = (x: number, z: number) => ({
  localBounds: { min: [0, 0, 0], max: [1, 1, 1] },
  localToWorld: [1, 0, 0, x + RTC_YUP.x, 0, 1, 0, RTC_YUP.y, 0, 0, 1, z + RTC_YUP.z, 0, 0, 0, 1],
});

function loadGeoreferenced(meshes: ReturnType<typeof georeferenced>[], shifted: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
  useViewerStore.setState({
    models: new Map(),
    geometryResult: {
      meshes,
      coordinateInfo: {
        originShift: { x: 0, y: 0, z: 0 },
        wasmRtcOffset: RTC_IFC,
        shiftedBounds: { min: { x: shifted.minX, y: 0, z: shifted.minZ }, max: { x: shifted.maxX, y: 1, z: shifted.maxZ } },
      },
    } as never,
  });
}

describe('a georeferenced model is sized to its building too', () => {
  it('leaves out a stray element 200 m away and says so', () => {
    // A building 0..8 along z, 0..2 along x, and a survey marker 200 m east of it; the bounds are the render frame's.
    loadGeoreferenced([georeferenced(0, 0), georeferenced(1, 7), georeferenced(200, 3)], { minX: 0, maxX: 201, minZ: 0, maxZ: 8 });
    const whole = { min: { x: 0, y: 0, z: 0 }, max: { x: 201, y: 1, z: 8 } };
    const { bounds, leftOut } = mainBodyExtent(whole);
    assert.equal(leftOut, 1, 'the marker is reported');
    assert.ok(bounds && bounds.max.x < 10, `the body ends at the building, not at the marker (${bounds?.max.x})`);
    assert.ok(bounds && bounds.min.x > -1 && bounds.min.z > -1);
  });

  it('puts a new elevation at the building, not at the survey marker', () => {
    loadGeoreferenced([georeferenced(0, 0), georeferenced(1, 7), georeferenced(40, 50)], { minX: 0, maxX: 41, minZ: 0, maxZ: 51 });
    const north = bodyElevationOffset('north') as number;
    const south = bodyElevationOffset('south') as number;
    assert.ok(Math.abs(north - (0 - ELEVATION_CLEARANCE_M)) < 1e-6, String(north));
    assert.ok(Math.abs(south - (8 + ELEVATION_CLEARANCE_M)) < 1e-6, String(south));
  });
});
