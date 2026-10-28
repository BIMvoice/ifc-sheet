/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { elevationDepth, elevationPlaneOffset, type Extent3 } from './set-defaults.js';
import type { ElevationDirection } from './document.js';

// A box that is not at the origin and not square, so a swapped axis or a sign slip shows.
const BOX: Extent3 = { min: { x: 2, y: 0, z: -3 }, max: { x: 14, y: 9, z: 5 } };

describe('where an elevation stands (#218)', () => {
  it.each<ElevationDirection>(['north', 'south', 'east', 'west'])('%s: the plane is outside the box on its side, so no element of the box is cut', (direction) => {
    const at = elevationPlaneOffset(direction, BOX);
    const outside = { north: at < BOX.min.z, south: at > BOX.max.z, east: at > BOX.max.x, west: at < BOX.min.x }[direction];
    expect(outside).toBe(true);
  });

  it.each<ElevationDirection>(['north', 'south', 'east', 'west'])('%s: the depth reaches the far side of the box from the plane', (direction) => {
    const at = elevationPlaneOffset(direction, BOX);
    const farSide = { north: BOX.max.z, south: BOX.min.z, east: BOX.min.x, west: BOX.max.x }[direction];
    expect(elevationDepth(direction, BOX)).toBeGreaterThanOrEqual(Math.abs(at - farSide));
  });
});
