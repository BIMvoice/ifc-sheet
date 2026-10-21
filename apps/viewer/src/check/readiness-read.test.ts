/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Counting the models: the two sample IFCs as the viewer parses them, and GlobalIds compared across models. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { IfcDataStore } from '@ifc-lite/parser';
import { parseStep } from '@/test/properties-panel-harness.js';
import { IFC_GUID, readModelFacts } from './readiness-read.js';
import { modelReadiness } from './readiness.js';

const sample = async (path: string) => {
  const store = await parseStep(new Uint8Array(readFileSync(new URL(path, import.meta.url))));
  return { store, storeys: store.spatialHierarchy?.byStorey.size ?? 0 };
};

describe('readModelFacts on the sample models', () => {
  it('building-architecture.ifc: one storey, two rooms; five of 11 elements are on no storey (they are in the building, the site and the project), four have no quantities', async () => {
    const facts = readModelFacts([await sample('../../public/samples/building-architecture.ifc')]);
    assert.deepEqual(facts, { storeys: 1, spaces: 2, elements: 11, elementsWithoutStorey: 5, elementsWithoutMaterial: 0, elementsWithoutQuantities: 4, duplicateGlobalIds: 0, duplicatedEntities: 0 });
    assert.deepEqual(modelReadiness(facts).map((f) => f.kind), ['noStorey', 'noQuantities']);
  });

  it('AC20-FZK-Haus.ifc: two storeys, seven rooms; every element is on a storey; four lack a material', async () => {
    const facts = readModelFacts([await sample('../../src/test/__fixtures__/AC20-FZK-Haus.ifc')]);
    assert.deepEqual(facts, { storeys: 2, spaces: 7, elements: 82, elementsWithoutStorey: 0, elementsWithoutMaterial: 4, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 });
  });
});

/** A store with the few columns the count reads. */
function fakeStore(rows: { id: number; guid: string; geometry?: boolean; type?: string }[], opts: { spaces?: number[]; storey?: number[]; material?: number[]; qto?: number[] } = {}): IfcDataStore {
  return {
    entities: { count: rows.length, expressId: Uint32Array.from(rows.map((r) => r.id)), getGlobalId: (id: number) => rows.find((r) => r.id === id)?.guid ?? '', hasGeometry: (id: number) => rows.find((r) => r.id === id)?.geometry ?? false, getTypeName: (id: number) => rows.find((r) => r.id === id)?.type ?? 'IfcWall' },
    entityIndex: { byType: new Map([['IFCSPACE', opts.spaces ?? []]]) },
    spatialHierarchy: { elementToStorey: new Map((opts.storey ?? []).map((id) => [id, 1])) },
    onDemandMaterialMap: new Map((opts.material ?? []).map((id) => [id, [900]])),
    onDemandQuantityMap: new Map((opts.qto ?? []).map((id) => [id, [901]])),
    quantities: { entityIndex: new Map() },
  } as unknown as IfcDataStore;
}
const G = (n: string) => `1${n.padEnd(21, 'x')}`;

describe('readModelFacts on synthetic stores', () => {
  it('does not count an opening, a site, a spatial zone or a virtual element as an element', () => {
    const store = fakeStore([
      { id: 1, guid: G('1'), geometry: true, type: 'IfcOpeningElement' },
      { id: 2, guid: G('2'), geometry: true, type: 'IfcSite' },
      { id: 3, guid: G('3'), geometry: true, type: 'IfcSpatialZone' },
      { id: 4, guid: G('4'), geometry: true, type: 'IfcVirtualElement' },
      { id: 5, guid: G('5'), geometry: true, type: 'IfcWall' },
    ]);
    const facts = readModelFacts([{ store, storeys: 1 }]);
    assert.deepEqual([facts.elements, facts.elementsWithoutStorey, facts.elementsWithoutMaterial, facts.elementsWithoutQuantities], [1, 1, 1, 1]);
  });

  it('counts an element GlobalId shared inside one model, and across two, with or without geometry', () => {
    const a = fakeStore([{ id: 1, guid: G('a'), geometry: true, type: 'IfcWall' }, { id: 2, guid: G('a'), type: 'IfcSlab' }, { id: 3, guid: G('b'), geometry: true, type: 'IfcDoor' }]);
    const b = fakeStore([{ id: 1, guid: G('b'), geometry: true, type: 'IfcBeam' }, { id: 2, guid: G('c'), geometry: true, type: 'IfcColumn' }]);
    const facts = readModelFacts([{ store: a, storeys: 0 }, { store: b, storeys: 0 }]);
    assert.equal(facts.duplicateGlobalIds, 2);
    assert.equal(facts.duplicatedEntities, 4);
  });

  it('does not count the project, site, building and storeys two discipline models share', () => {
    const spatial = (first: number) => [
      { id: first, guid: G('project'), type: 'IfcProject' },
      { id: first + 1, guid: G('site'), geometry: true, type: 'IfcSite' },
      { id: first + 2, guid: G('building'), type: 'IfcBuilding' },
      { id: first + 3, guid: G('storey'), type: 'IfcBuildingStorey' },
    ];
    const architecture = fakeStore([...spatial(1), { id: 10, guid: G('wall'), geometry: true, type: 'IfcWall' }]);
    const structure = fakeStore([...spatial(101), { id: 110, guid: G('beam'), geometry: true, type: 'IfcBeam' }]);
    const facts = readModelFacts([{ store: architecture, storeys: 1 }, { store: structure, storeys: 1 }]);
    assert.equal(facts.duplicateGlobalIds, 0);
    assert.equal(facts.duplicatedEntities, 0);
  });

  it('does not take a name that is not a GlobalId for one', () => {
    assert.equal(IFC_GUID.test('0xY$LvXaDEswJDk_VU74C_'), true);
    assert.equal(IFC_GUID.test('composite_element_roof'), false);
    const store = fakeStore([{ id: 1, guid: 'concrete' }, { id: 2, guid: 'concrete' }, { id: 3, guid: '' }, { id: 4, guid: '' }]);
    assert.equal(readModelFacts([{ store, storeys: 0 }]).duplicateGlobalIds, 0);
  });

  it('counts only elements with geometry, rooms apart, against storey, material and quantity set', () => {
    const store = fakeStore(
      [{ id: 1, guid: G('1'), geometry: true }, { id: 2, guid: G('2'), geometry: true }, { id: 3, guid: G('3'), geometry: true }, { id: 4, guid: G('4'), geometry: false }, { id: 5, guid: G('5'), geometry: true, type: 'IfcSpace' }],
      { spaces: [5], storey: [1, 2], material: [1], qto: [1, 2] },
    );
    const facts = readModelFacts([{ store, storeys: 1 }]);
    assert.deepEqual([facts.storeys, facts.spaces, facts.elements, facts.elementsWithoutStorey, facts.elementsWithoutMaterial, facts.elementsWithoutQuantities], [1, 1, 3, 1, 2, 1]);
  });

  it('counts an element in a room that is on a storey as on that storey', () => {
    const store = fakeStore([{ id: 1, guid: G('1'), geometry: true }], { storey: [] });
    (store.spatialHierarchy as unknown as { elementToContainer: Map<number, number> }).elementToContainer = new Map([[1, 77]]);
    (store.spatialHierarchy as unknown as { elementToStorey: Map<number, number> }).elementToStorey.set(77, 1);
    assert.equal(readModelFacts([{ store, storeys: 1 }]).elementsWithoutStorey, 0);
  });
});
