/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Go to" for the rooms whose area is estimated (#42): the plan of the room's level opens and zooms to the room. The room is
 * found among the rooms Au is made from (`collectRoomRecords`), so it is the one the finding named.
 */

import { activateDocumentTab } from '@/project/open-view';
import { useProjectStore } from '@/project/project-store';
import { resolvePlanLevel } from '@/project/view-defaults';
import { collectRoomRecords } from '@/urban/urban-models';
import { requestFocus } from './focus';

/** Opens the plan of the level of the room `guid` and zooms to it. False when the room, its level or a plan of it is not there. */
export function goToRoom(guid: string): boolean {
  const { levels, views } = useProjectStore.getState();
  const room = collectRoomRecords(levels).rooms.find((r) => r.id === guid);
  const level = room?.level != null ? levels[room.level] : undefined;
  if (!level) return false;
  const plan = views.find((v) => v.kind === 'plan' && !('reflected' in v && v.reflected) && resolvePlanLevel(v, levels)?.storeyGlobalIds[0] === level.storeyGlobalIds[0]);
  if (!plan || activateDocumentTab(plan.id) === 'missing') return false;
  requestFocus(plan.id, [guid]);
  return true;
}
