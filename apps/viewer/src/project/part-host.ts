/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The host class of an IfcBuildingElementPart: models that split walls and
 * slabs into layer parts (IfcRelAggregates) draw the PARTS, so a view's
 * "Walls" graphics must reach the parts of walls too. Resolved through the
 * federation (renderer id → model + expressId), cached per model store.
 */

import { RelationshipType } from '@ifc-lite/data';
import type { IfcDataStore } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';

const PART = 'IFCBUILDINGELEMENTPART';
const cache = new WeakMap<object, Map<number, number | null>>();

/** The model, its data store and the express id of a renderer id, or null. */
function located(renderId: number): { modelId: string; expressId: number; ds: IfcDataStore } | null {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(renderId);
  const ds = ref ? s.models.get(ref.modelId)?.ifcDataStore : null;
  return ref && ds ? { modelId: ref.modelId, expressId: ref.expressId, ds } : null;
}

/** The express id of the element `expressId` is aggregated into (cached per store), or null. */
function hostOf(ds: IfcDataStore, expressId: number): number | null {
  let known = cache.get(ds);
  if (!known) cache.set(ds, (known = new Map()));
  if (!known.has(expressId)) known.set(expressId, ds.relationships.getRelated(expressId, RelationshipType.Aggregates, 'inverse')[0] ?? null);
  return known.get(expressId) ?? null;
}

/** The IFC class of the element a part belongs to, or null (not a part, or no host). */
export function partHostType(renderId: number, ifcType: string | undefined): string | null {
  if (!ifcType || ifcType.toUpperCase() !== PART) return null;
  const at = located(renderId);
  const host = at ? hostOf(at.ds, at.expressId) : null;
  return at && host ? at.ds.entities.getTypeName(host) || null : null;
}

/** The element (model and express id) an IfcBuildingElementPart belongs to, or null when `renderId` is no part or has no host. */
export function partHostRef(renderId: number): { modelId: string; expressId: number } | null {
  const at = located(renderId);
  if (!at || at.ds.entities.getTypeName(at.expressId).toUpperCase() !== PART) return null;
  const host = hostOf(at.ds, at.expressId);
  return host ? { modelId: at.modelId, expressId: host } : null;
}
