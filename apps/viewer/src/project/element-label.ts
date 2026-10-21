/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Finding the element a tag points at, and its class. Elements are found by
 * GlobalId across the loaded models, so a tag keeps pointing at its element
 * whatever the session's ids. The mark and the name a tag shows are read by
 * `tagfields/element-tag.ts`.
 */

import { useViewerStore } from '@/store';
import { findElementByGlobalId } from './contour-element';

/** The element a GlobalId names, in whichever loaded model holds it. */
export function elementByGlobalId(globalId: string): { modelId: string; expressId: number } | null {
  for (const modelId of useViewerStore.getState().models.keys()) {
    const expressId = findElementByGlobalId(modelId, globalId);
    if (expressId !== null) return { modelId, expressId };
  }
  return null;
}

/** The class of an element as a tag shows it (`Door` for an `IfcDoor`), or null when it is no longer in the model. */
export function elementClassLabel(globalId: string): string | null {
  const at = elementByGlobalId(globalId);
  if (!at) return null;
  const s = useViewerStore.getState();
  const type = s.mutationViews.get(at.modelId)?.getNewEntity(at.expressId)?.type
    ?? s.models.get(at.modelId)?.ifcDataStore?.entities.getTypeName(at.expressId) ?? '';
  return type.replace(/^Ifc/i, '') || '?';
}
