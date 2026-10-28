/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room's footprint on a plan, from its space geometry. The code is the engine's (`@bimvoice/ifcsheet/footprint`), shared with the
 * room fills of a coloured plan; this module keeps the app's name for it and the room as a command reads it.
 */

import type { RoomFootprint } from '@bimvoice/ifcsheet/footprint';

export { footprintOf, ringArea, roomFootprints, type Footprint, type RoomFootprint, type SpaceMesh } from '@bimvoice/ifcsheet/footprint';

/** A room of the plan in front, as a command reads it. */
export type RoomOfPlan = RoomFootprint & { guid: string };
