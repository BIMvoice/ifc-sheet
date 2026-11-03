/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room's footprint on a plan, from its space geometry. The code is the engine's (`@bimvoice/ifcsheet/footprint`), shared with the
 * room fills of a coloured plan; this module keeps the app's name for it and the room as a command reads it.
 */

import type { Rect } from '@/labels/label-geometry';
import type { RoomFootprint } from '@bimvoice/ifcsheet/footprint';

export { footprintOf, ringArea, roomFootprints, type Footprint, type RoomFootprint, type SpaceMesh } from '@bimvoice/ifcsheet/footprint';

/**
 * A room of the view in front, as a command reads it. On a section or an elevation (`cut-rooms.ts`) the ring is the room's
 * cut outline, so the room's floor area is carried (`floorArea`, null when nothing gives one) and the cut outlines near it that a tag keeps clear of (`keepClear`, and the lines the drawing shows there that it keeps clear of if it can, `preferClear`).
 */
export type RoomOfPlan = RoomFootprint & { guid: string; floorArea?: number | null; keepClear?: readonly (readonly { x: number; y: number }[])[]; preferClear?: readonly Rect[] };
