/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ElevationDirection } from './document.js';

/** Where an elevation stands and which way it looks (`ELEVATION_PLANES` in the app's `project/view-plane.ts`). Pure, so the layout and the generator read one table. */
export const ELEVATION_PLANES: Record<ElevationDirection, { axis: 'x' | 'z'; atMax: boolean; flipped: boolean }> = {
  south: { axis: 'z', atMax: true, flipped: false },
  north: { axis: 'z', atMax: false, flipped: true },
  east: { axis: 'x', atMax: true, flipped: false },
  west: { axis: 'x', atMax: false, flipped: true },
};
