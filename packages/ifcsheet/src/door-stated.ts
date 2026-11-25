/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a model states of a door that tells the door from its pieces (`door-loose-pieces.ts`): the element it is a part of
 * (IfcRelAggregates, IfcRelNests) and whether it states OverallWidth or OverallHeight. The engine (`planOpeningSymbols`) and the app
 * (`project/view-symbols.ts`) both read it here.
 */

import { RelationshipType } from '@ifc-lite/data';
import { getAttributeNamesForSchema, type IfcDataStore } from '@ifc-lite/parser';
import type { DoorStated } from './door-loose-pieces.js';

const readsByStore = new WeakMap<object, Map<number, DoorStated>>();

/** The reader of what `store` states of each door, by express id; each door is read once. */
export function doorStatedOf(store: IfcDataStore): (id: number) => DoorStated {
  let held = readsByStore.get(store);
  if (!held) readsByStore.set(store, (held = new Map()));
  const memo = held;
  return (id) => {
    const known = memo.get(id);
    if (known) return known;
    const graph = store.relationships;
    const partOf = graph?.getRelated(id, RelationshipType.Aggregates, 'inverse')[0] ?? graph?.getRelated(id, RelationshipType.Nests, 'inverse')[0];
    const entity = store.getEntity(id);
    const names = entity ? getAttributeNamesForSchema(entity.type, store.schemaVersion) : [];
    const stated = (name: string) => {
      const slot = names.indexOf(name);
      const value = slot < 0 ? undefined : entity?.attributes[slot];
      return value !== undefined && value !== null && value !== '$';
    };
    const read: DoorStated = { ...(partOf !== undefined ? { partOf } : {}), statesSize: stated('OverallWidth') || stated('OverallHeight') };
    memo.set(id, read);
    return read;
  };
}
