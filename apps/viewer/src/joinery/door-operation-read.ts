/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The swing a door states (`IfcDoor.OperationType`, else its type's: the engine's `doorOperationOf`),
 * by renderer id, read through the mutation overlay and memoised per model until that overlay changes.
 */

import { doorOperationOf, type DoorOperation } from '@bimvoice/ifcsheet';
import { useViewerStore } from '@/store';
import { typeIndex } from '@/lib/commands/modeling/authored-kinds';
import { idOf } from './object-id';

interface ModelMemo { stamp: string; byElement: Map<number, DoorOperation | null>; types?: Map<number, number | null> }
const memo = new Map<string, ModelMemo>();

export function doorOperationOfRenderId(id: number): DoorOperation | null {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(id);
  const dataStore = ref ? s.models.get(ref.modelId)?.ifcDataStore : undefined;
  if (!ref || !dataStore) return null;
  const view = s.mutationViews.get(ref.modelId) ?? null;
  const stamp = `${idOf(dataStore)}|` + (view ? `${view.getMutationCount()}:${view.getNewEntities().length}` : '-');
  let m = memo.get(ref.modelId);
  if (!m || m.stamp !== stamp) {
    m = { stamp, byElement: new Map() };
    memo.set(ref.modelId, m);
  }
  if (m.byElement.has(ref.expressId)) return m.byElement.get(ref.expressId) ?? null;
  let op: DoorOperation | null = null;
  try {
    m.types ??= typeIndex({ dataStore, view });
    op = doorOperationOf({ dataStore, view }, ref.expressId, m.types.get(ref.expressId) ?? null);
  } catch {
    op = null;
  }
  m.byElement.set(ref.expressId, op);
  return op;
}
