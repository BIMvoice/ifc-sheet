/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's extent the drawing set is laid out on (`wallExtent`), for the sheets that draw the set: a plan's
 * frame is fitted to the part of its drawing inside the room the layout made for it (`boundsInRoom`), as the
 * engine's sheet is, so a survey marker the framing left out of the extent is clipped, not framed. The Wall
 * publishes it as it measures it; `null` before (a sheet then frames the whole drawing).
 */

import { create } from 'zustand';
import type { ModelExtent } from '@bimvoice/ifcsheet';

export const useSetExtent = create<{ extent: ModelExtent | null }>(() => ({ extent: null }));

/** Record the extent the set is laid out on (the Wall's), or `null` when there is none. */
export function publishSetExtent(extent: ModelExtent | null): void {
  if (useSetExtent.getState().extent !== extent) useSetExtent.setState({ extent });
}
