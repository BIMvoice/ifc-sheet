/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #651: a window with no joinery type (a mesh-only one, as Bonsai writes some) has no frame or glazing in an elevation or section, only the
 * projected box of its mesh. Its symbol is made from the box it measures: a plain window the size of that box, one fixed light, so the
 * outline, the frame and the glass lines show as a typed window's do. The width runs along the element's own X, the height up its Y, as
 * `typedElevationSymbol` places them.
 */

import { defaultWindowSpec, type JoinerySpec } from '@ifc-lite/create';

/** The default window sized to the measured box of `world` (flat x, y, z) along `localToWorld`'s X and Y axes; null when the box has no size. */
export function measuredWindowSpec(world: readonly number[], localToWorld: readonly number[]): JoinerySpec | null {
  const m = localToWorld;
  const axes = [[m[0], m[4], m[8]], [m[1], m[5], m[9]]];
  const extent = axes.map((a) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    if (l < 1e-9) return 0;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i + 2 < world.length; i += 3) {
      const d = (world[i] * a[0] + world[i + 1] * a[1] + world[i + 2] * a[2]) / l;
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    return Number.isFinite(lo) ? hi - lo : 0;
  });
  const [width, height] = extent;
  if (width < 0.1 || height < 0.1) return null;
  const base = defaultWindowSpec();
  return { ...base, width, height, columns: [1], rows: [1], panels: [{ col: 0, row: 0, operation: 'fixed' }] };
}
