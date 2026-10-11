/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `CoordinateHandler` re-bases at the EXPORTED threshold, not at a copy of its
 * value (#4611).
 *
 * `NORMAL_COORD_THRESHOLD_M` is documented as the number the class decides on,
 * and four viewer modules import it on the strength of that sentence. The class
 * itself read a `private readonly THRESHOLD = 10000` declared 34 lines below the
 * export, in `needsShift`, in the "did wasm already shift this" vote and in the
 * centroid-or-size test. The two agreed on 10 000 and on nothing else.
 *
 * Every boundary below is DERIVED from the imported constant, so the file
 * cannot be satisfied by a second copy that happens to hold the same number.
 * Mutation: set `NORMAL_COORD_THRESHOLD_M` to 40_000 and, on origin/main, the
 * "just inside" cases go red (the class keeps flipping at 10 km while the test
 * asks at 40 km); with the private copy gone they stay green at any value.
 */

import { describe, expect, it } from 'vitest';
import { CoordinateHandler, NORMAL_COORD_THRESHOLD_M } from './coordinate-handler.js';
import type { MeshData } from './types.js';

function boundsAt(coord: number) {
  return { min: { x: -coord, y: 0, z: 0 }, max: { x: coord, y: 0, z: 0 } };
}

/** One triangle collapsed to a single point, so bounds are that point exactly. */
function meshAt(x: number, y: number, z: number): MeshData {
  return {
    expressId: 1,
    positions: new Float32Array([x, y, z, x, y, z, x, y, z]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    color: [1, 1, 1, 1],
  };
}

describe('CoordinateHandler decides at NORMAL_COORD_THRESHOLD_M', () => {
  it('does not shift a model that reaches exactly the threshold', () => {
    // The comparison is strict `>`, so the threshold value itself is "normal".
    expect(new CoordinateHandler().needsShift(boundsAt(NORMAL_COORD_THRESHOLD_M))).toBe(false);
  });

  it('does not shift a model just inside the threshold', () => {
    expect(new CoordinateHandler().needsShift(boundsAt(NORMAL_COORD_THRESHOLD_M * 0.5))).toBe(false);
  });

  it('shifts a model just past the threshold', () => {
    expect(new CoordinateHandler().needsShift(boundsAt(NORMAL_COORD_THRESHOLD_M + 1))).toBe(true);
  });

  it('leaves an incremental batch inside the threshold where it is', () => {
    const handler = new CoordinateHandler();
    const inside = NORMAL_COORD_THRESHOLD_M * 0.5;
    handler.processMeshesIncremental([meshAt(inside, 0, 0)]);
    expect(handler.getOriginShift()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('re-bases an incremental batch past the threshold onto its centroid', () => {
    const handler = new CoordinateHandler();
    const outside = NORMAL_COORD_THRESHOLD_M * 2;
    handler.processMeshesIncremental([meshAt(outside, 0, 0)]);
    expect(handler.getOriginShift()).toEqual({ x: outside, y: 0, z: 0 });
  });

  it('counts a vertex at the threshold as small in the "wasm already shifted" vote', () => {
    // The vote is `maxCoord < threshold` -> small. A batch whose vertices sit
    // just inside it must read as already-shifted, so the handler leaves the
    // positions alone even though the batch centroid is far from the origin.
    const handler = new CoordinateHandler();
    const justInside = NORMAL_COORD_THRESHOLD_M - 1;
    const batch = [meshAt(justInside, justInside, justInside)];
    handler.processMeshesIncremental(batch);
    expect(handler.getOriginShift()).toEqual({ x: 0, y: 0, z: 0 });
    expect(batch[0].positions[0]).toBe(justInside);
  });
});
