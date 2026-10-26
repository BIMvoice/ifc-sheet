/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { EntityTableBuilder, RelationshipGraphBuilder, RelationshipType, StringTable } from '@ifc-lite/data';
import type { IfcDataStore } from '@ifc-lite/parser';
import { liveEntityConforms, readRelatedLists } from './resolve-relations.js';
import { relateOneToManyInStore } from './relate.js';

/** An IFCX store as the viewer builds it: no STEP records (empty index, empty source), the entity table and relationship graph carry the model. */
function ifcxStore(): IfcDataStore {
  const strings = new StringTable();
  const table = new EntityTableBuilder(3, strings);
  table.add(1, 'IfcMaterial', 'm', 'CONCRETE', '', '');
  table.add(2, 'IfcWall', 'w', 'Wall', '', '');
  table.add(3, 'IfcWindowType', 't', 'WT01', '', '');
  const graph = new RelationshipGraphBuilder();
  graph.addEdge(1, 2, RelationshipType.AssociatesMaterial, 10);
  graph.addEdge(3, 4, RelationshipType.DefinesByType, 11);
  const entities = table.build();
  const records = new Map([[1, { expressId: 1, type: 'IfcMaterial', attributes: ['CONCRETE'] }]]);
  return {
    schemaVersion: 'IFC5',
    source: new Uint8Array(0),
    entityIndex: { byId: new Map(), byType: new Map() },
    entities,
    relationships: graph.build(),
    getEntity: (id: number) => records.get(id) ?? null,
  } as unknown as IfcDataStore;
}

describe('the material and type readers over an IFCX store (#184)', () => {
  it('reads IfcRelAssociatesMaterial and IfcRelDefinesByType from the relationship graph', () => {
    const store = ifcxStore();
    expect(readRelatedLists(store, 'IfcRelAssociatesMaterial')).toEqual([{ relId: 0, relatingId: 1, relatedIds: [2] }]);
    expect(readRelatedLists(store, 'IfcRelDefinesByType')).toEqual([{ relId: 0, relatingId: 3, relatedIds: [4] }]);
  });

  it('tests an IFCX record against the IFC 4.3 class hierarchy it is written in, not the authoring refusal', () => {
    const store = ifcxStore();
    expect(liveEntityConforms(store, 1, 'IfcMaterial')).toBe(true);
    expect(liveEntityConforms(store, 1, 'IfcWall')).toBe(false);
  });

  it('hands out the graph\'s lists as read-only: relId 0, and an edit through them is refused', () => {
    const store = ifcxStore();
    const existing = readRelatedLists(store, 'IfcRelAssociatesMaterial');
    const editor = { removeEntity: () => { throw new Error('edited'); }, setPositionalAttribute: () => { throw new Error('edited'); }, addEntity: () => { throw new Error('edited'); } };
    expect(() => relateOneToManyInStore(editor as never, { relType: 'IfcRelAssociatesMaterial', relatingId: 1, relatedIds: [2], existing, create: () => [] }, 'test'))
      .toThrow(/derived from its relationship graph/);
  });
});
