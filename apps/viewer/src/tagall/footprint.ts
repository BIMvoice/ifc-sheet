/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room's footprint on a plan, from its space geometry. The code is the engine's (`@bimvoice/ifcsheet/footprint`), shared with the
 * room fills of a coloured plan; this module keeps the app's name for it and the room as a command reads it.
 */

import type { OutsideScene } from './room-outside';
import type { LeaderRect as Rect } from '@bimvoice/ifcsheet';
import type { RoomFootprint } from '@bimvoice/ifcsheet/footprint';

export { footprintOf, ringArea, roomFootprints, type Footprint, type RoomFootprint, type SpaceMesh } from '@bimvoice/ifcsheet/footprint';

/**
 * A room of the view in front, as a command reads it. On a section or an elevation (`cut-rooms.ts`) the ring is the room's
 * cut outline, so the room's floor area is carried (`floorArea`, null when nothing gives one) and the lines the drawing shows near it, which its tag keeps clear of if it can (`preferClear`) and the drawing's lines and bounds, for a tag that goes outside the room (`outside`).
 */
export type RoomOfPlan = RoomFootprint & { guid: string; floorArea?: number | null; preferClear?: readonly Rect[]; outside?: OutsideScene };
