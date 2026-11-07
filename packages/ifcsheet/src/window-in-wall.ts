/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A window with no parametric description (a mesh-only window from another tool) is drawn on the rectangle round its own mesh
 * (`opening-symbols.ts`). That mesh is a box: it may reach out past the wall's faces (a quarter of the wall's width, in the Bonsai
 * house, #651), and a box about as deep as it is wide has no long side, so the "width" of its minimum-area rectangle can lie across
 * the wall and the glazing lines with it. Drawn so, the window sticks out of the wall and its glass runs the wrong way.
 *
 * `fitWindowToHostWall` takes the wall's direction from the wall's own footprint, measures the window's extent along and across it,
 * and fits that to the wall as a door is (`fitToHostWall`): its depth the wall's thickness, its width its own measured width (the wall's vertices inside a window box are not jambs). A host wall
 * that is not one thin band leaves the rectangle as it was.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { fitToHostWall } from './opening-in-wall.js';
import type { OpeningRect } from './opening-symbols.js';

/** The thickest band a wall's footprint may be to give the window its direction, in metres (as `fitToHostWall`). */
const MAX_BAND = 1.2;

/** `read` aligned to the wall `wall` (the minimum-area rectangle round the host's footprint, null when it has none) and fitted to `host`. */
export function fitWindowToHostWall(read: OpeningRect, wall: OpeningRect | null, host: readonly MeshData[], plane: SectionPlaneConfig): OpeningRect {
  if (!wall || wall.depth > MAX_BAND || wall.width <= wall.depth) return read;
  const corners = [-1, 1].flatMap((a) => [-1, 1].map((b) => ({
    x: read.c.x + read.u.x * a * read.width / 2 + read.n.x * b * read.depth / 2,
    y: read.c.y + read.u.y * a * read.width / 2 + read.n.y * b * read.depth / 2,
  })));
  const along = corners.map((p) => (p.x - read.c.x) * wall.u.x + (p.y - read.c.y) * wall.u.y);
  const across = corners.map((p) => (p.x - read.c.x) * wall.n.x + (p.y - read.c.y) * wall.n.y);
  const [s0, s1] = [Math.min(...along), Math.max(...along)], [t0, t1] = [Math.min(...across), Math.max(...across)];
  const ds = (s0 + s1) / 2, dt = (t0 + t1) / 2;
  const aligned: OpeningRect = {
    c: { x: read.c.x + wall.u.x * ds + wall.n.x * dt, y: read.c.y + wall.u.y * ds + wall.n.y * dt },
    u: wall.u, n: wall.n, width: s1 - s0, depth: t1 - t0,
  };
  return fitToHostWall(aligned, host, plane, true);
}
