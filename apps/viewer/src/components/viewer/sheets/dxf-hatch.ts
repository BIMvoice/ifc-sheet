/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The solid fills of a sheet in DXF (#92): a colour scheme's room and element fills and the swatches of its legend become HATCH
 * entities. A closed loop is clipped to the viewport as a polygon, not as a line: a fill cut by the frame must stay a closed
 * shape, where a line clipper would leave an open run. The clipper is the engine's (`@bimvoice/ifcsheet/clip`), the one the
 * headless sheets use.
 */

import { clipPolygon } from '@bimvoice/ifcsheet/clip';

type P = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

/** `loop` clipped to `r`; fewer than three points left means nothing of it shows. */
export const clipLoop = (loop: readonly P[], r: Rect): P[] => clipPolygon(loop, { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 });
