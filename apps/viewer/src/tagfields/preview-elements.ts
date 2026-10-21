/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The elements of the loaded models the configurator previews a tag kind on: their GlobalId and the name to pick them by. */

import { iterateEffectiveEntityIds } from '@ifc-lite/mutations';
import { useViewerStore } from '@/store';
import type { TagKind } from './tag-fields';

const CLASSES: Record<TagKind, readonly string[]> = {
  door: ['IFCDOOR', 'IFCDOORSTANDARDCASE'],
  window: ['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'],
  room: ['IFCSPACE'],
  wall: ['IFCWALL', 'IFCWALLSTANDARDCASE'],
  other: ['IFCSLAB', 'IFCCOLUMN', 'IFCBEAM', 'IFCSTAIR', 'IFCCOVERING', 'IFCFURNISHINGELEMENT'],
};

export interface PreviewElement {
  guid: string;
  name: string;
}

/** The first `limit` elements of `kind` across the loaded models, in model order. */
export function previewElements(kind: TagKind, limit = 200): PreviewElement[] {
  const s = useViewerStore.getState();
  const out: PreviewElement[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store) continue;
    for (const { expressId } of iterateEffectiveEntityIds(store, s.mutationViews.get(modelId) ?? null, CLASSES[kind])) {
      const guid = store.entities.getGlobalId(expressId);
      if (!guid) continue;
      out.push({ guid, name: store.entities.getName(expressId) || guid });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
