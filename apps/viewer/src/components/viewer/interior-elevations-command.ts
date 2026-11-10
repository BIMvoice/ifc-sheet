/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one "Interior elevations" action behind every entry point (a room's
 * context menu in 3D, its row in the model tree, the command palette): make
 * the room's elevations, hang them on a new sheet, show the sheet, say so.
 */

import { toast } from '@/components/ui/toast';
import { resolve } from '@/i18n/registry';
import { useViewerStore } from '@/store';
import { createInteriorElevations } from '@/project/interior-elevation-actions';
import { activateDocumentTab } from '@/project/open-view';

/** Run it on the room drawn with render id `renderId`; `null`: no room was given. Returns the sheet made, or `null` when none was. */
export function runInteriorElevations(renderId: number | null): string | null {
  if (renderId === null) {
    toast.info(resolve('entityContextMenu.interiorElevationsSelectRoom'));
    return null;
  }
  const made = createInteriorElevations(renderId);
  if ('error' in made) {
    toast.info(resolve(made.error === 'noRoom' ? 'entityContextMenu.interiorElevationsNoRoom' : 'entityContextMenu.interiorElevationsNoFaces'));
    return null;
  }
  activateDocumentTab(made.sheetId);
  toast.success(resolve('entityContextMenu.interiorElevationsMade', { count: made.count, sheet: made.sheetNumber }));
  return made.sheetId;
}

/** The selected room's render id, when exactly one room (IfcSpace) is selected. */
export function selectedRoom(): number | null {
  const s = useViewerStore.getState();
  const ids = new Set(s.selectedEntityIds);
  if (s.selectedEntityId !== null && s.selectedEntityId !== undefined) ids.add(s.selectedEntityId);
  if (ids.size !== 1) return null;
  const [id] = ids;
  const ref = s.resolveGlobalIdFromModels(id);
  const store = ref ? s.models.get(ref.modelId)?.ifcDataStore : undefined;
  return ref && store?.entities.getTypeName(ref.expressId) === 'IfcSpace' ? id : null;
}
