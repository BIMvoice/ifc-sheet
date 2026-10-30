/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The reads a schedule takes of one model through `Live` (the store and its edit overlay): attributes, name, property sets, types. Re-exported by `joinery-schedule`. */

import { readRelatedLists } from '@ifc-lite/create';
import { extractPropertiesOnDemand, getAttributeNamesForSchema, type IfcDataStore } from '@ifc-lite/parser';
import { propertyValueText, type PropertyFact } from './schedule-filter.js';
import type { Live } from './joinery-schedule.js';

/** The entity's attributes with the overlay's positional edits applied; null for a deleted or unknown entity. */
export function attributes({ dataStore, view }: Live, id: number): unknown[] | null {
  if (view?.isDeleted(id)) return null;
  const entity = view?.getNewEntity(id) ?? dataStore.getEntity(id);
  if (!entity) return null;
  const attrs = [...entity.attributes] as unknown[];
  for (const [index, value] of view?.getPositionalMutationsForEntity(id) ?? []) attrs[index] = value;
  return attrs;
}

/** The Name the store holds: the entity table's (IfcRoot entities), else the Name slot of the source record. */
export function storedName(dataStore: IfcDataStore, expressId: number): string {
  const indexed = dataStore.entities.getName(expressId);
  if (indexed) return indexed;
  const entity = dataStore.getEntity(expressId);
  const slot = entity ? getAttributeNamesForSchema(entity.type, dataStore.schemaVersion).indexOf('Name') : -1;
  const value = slot < 0 ? undefined : entity?.attributes[slot];
  return typeof value === 'string' ? value : '';
}

/** The element's property sets: the edit overlay's when there is one, else the store's table, else read from the source on demand (a headless open keeps no table). */
export function propertySetsOf({ dataStore, view }: Live, id: number): { name: string; properties: { name: string; value: unknown }[] }[] {
  try {
    if (view) return view.getForEntity(id);
    const table = dataStore.properties?.getForEntity(id) ?? [];
    return table.length > 0 || !(dataStore.source?.length > 0) ? table : extractPropertiesOnDemand(dataStore, id);
  } catch {
    return [];
  }
}

/** The properties of an element whose name is in `names` (lower case), as text; empty and unreadable values are kept as empty text. */
export function readPropertyFacts(live: Live, id: number, names: ReadonlySet<string>): PropertyFact[] {
  const out: PropertyFact[] = [];
  for (const pset of propertySetsOf(live, id)) {
    for (const p of pset.properties) if (names.has(p.name.toLowerCase())) out.push({ pset: pset.name, name: p.name, value: propertyValueText(p.value) ?? '' });
  }
  return out;
}

/** Every typed occurrence's type, by one read of the model's IfcRelDefinesByType. Where an element is in more than one, the first wins. */
export function typeIndex({ dataStore, view }: Live): Map<number, number | null> {
  const index = new Map<number, number | null>();
  for (const rel of readRelatedLists(dataStore, 'IfcRelDefinesByType', view)) {
    for (const id of rel.relatedIds) if (!index.has(id)) index.set(id, rel.relatingId ?? null);
  }
  return index;
}
