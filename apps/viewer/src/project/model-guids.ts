/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The elements of the loaded models by GlobalId (#32, #33): which GlobalIds the model has (what a view says about the others is an
 * orphan, kept and listed), what an element is called, and which elements are selected. The index is built once per loaded models
 * and edit count, not per call.
 */

import type { GlobalId } from '@bimvoice/ifcsheet';
import { useViewerStore } from '@/store';
import { renderIdGlobalId } from './element-guid';

interface Located { modelId: string; expressId: number }
interface Index { models: unknown; version: number; byGlobalId: Map<GlobalId, Located> }

let cached: Index | null = null;

/** Every GlobalId of the loaded models' parsed elements. */
export function modelGlobalIds(): ReadonlyMap<GlobalId, Located> {
  const s = useViewerStore.getState();
  if (cached && cached.models === s.models && cached.version === s.mutationVersion) return cached.byGlobalId;
  const byGlobalId = new Map<GlobalId, Located>();
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store) continue;
    for (const expressId of store.entityIndex.byId.keys()) {
      const guid = store.entities.getGlobalId(expressId);
      if (guid) byGlobalId.set(guid, { modelId, expressId });
    }
  }
  cached = { models: s.models, version: s.mutationVersion, byGlobalId };
  return byGlobalId;
}

/** What an element is called ("IfcWallStandardCase Wall-001"), or null when the loaded models do not have it. */
export function labelOfGlobalId(globalId: GlobalId): string | null {
  const at = modelGlobalIds().get(globalId);
  const store = at ? useViewerStore.getState().models.get(at.modelId)?.ifcDataStore : undefined;
  if (!at || !store) return null;
  return [store.entities.getTypeName(at.expressId), store.entities.getName(at.expressId)].filter(Boolean).join(' ');
}

/** The selected model elements: their GlobalIds and names (for the elements the drawing shows, the selection is the picked ones). */
export function selectedElements(): { globalId: GlobalId; label: string }[] {
  const s = useViewerStore.getState();
  const ids = new Set(s.selectedEntityIds);
  if (s.selectedEntityId !== null && s.selectedEntityId !== undefined) ids.add(s.selectedEntityId);
  const out: { globalId: GlobalId; label: string }[] = [];
  const seen = new Set<GlobalId>();
  for (const id of ids) {
    const globalId = renderIdGlobalId(id);
    if (!globalId || seen.has(globalId)) continue;
    seen.add(globalId);
    out.push({ globalId, label: labelOfGlobalId(globalId) ?? globalId });
  }
  return out;
}
