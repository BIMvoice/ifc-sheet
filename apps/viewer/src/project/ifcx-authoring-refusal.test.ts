/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deletionClosure, liveEntityConforms, liveEntityConformsForRead, readRelatedLists, readRelatedListsForRead } from '@ifc-lite/create';
import { MutablePropertyView, StoreEditor } from '@ifc-lite/mutations';
import { createModellingStoreBackend, createOrdinaryStoreBackend } from '@ifc-lite/sdk';
import type { IfcDataStore } from '@ifc-lite/parser';
import { parseIfcxViewerModel } from '@/hooks/ingest/viewerModelIngest';
import { deletionRefusal, authoringReader } from '@/lib/actions/model-authoring-read';
import { useViewerStore } from '@/store';

/**
 * An IFCX model is read, not authored (#184): its relationships are the graph's, not records, and its entity table
 * holds rows the file does not state (a material, a window type). On main every write on it was refused, because the
 * authoring readers see no record in an IFCX model ("not a live entity", "not deleted by reviewed authoring", no
 * geometric context), and `liveEntityConforms` THROWS the IFC5 refusal for a record an edit created. Reading
 * materials and types must not lift that: the read-only checks (`liveEntityConformsForRead`,
 * `readRelatedListsForRead`) are separate functions, and a writer calling them is the mutation this file catches.
 * The literal messages are main's.
 */

const SAMPLE = fileURLToPath(new URL('../../public/samples/hello-wall.ifcx', import.meta.url));
const REFUSED = 'liveEntityConforms: authoring IFC5 models is not supported; use IFC2X3, IFC4 or IFC4X3';

let ds: IfcDataStore;
let view: MutablePropertyView;
let editor: StoreEditor;
const ids = { storey: 0, wall: 0, material: 0, type: 0 };
let rowsBefore = 0;

const resolve = () => ({ modelId: 'm', store: ds, editor, mutationView: view, ownerHistoryId: null });
const messageOf = (run: () => unknown): string => {
  try { run(); } catch (e) { return (e as Error).message; }
  return 'PROCEEDED';
};
const idOfClass = (name: string): number => [...ds.entities.expressId].find((i) => ds.entities.getTypeName(i) === name)!;

describe('every write on an IFCX model is refused as on main (#184)', () => {
  before(async () => {
    const b = readFileSync(SAMPLE);
    ({ dataStore: ds } = await parseIfcxViewerModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    view = new MutablePropertyView(ds.properties ?? null, 'm');
    editor = new StoreEditor(ds, view);
    Object.assign(ids, { storey: idOfClass('IfcBuildingStorey'), wall: idOfClass('IfcWall'), material: idOfClass('IfcMaterial'), type: idOfClass('IfcWindowType') });
    rowsBefore = ds.entities.count;
    useViewerStore.setState({ models: new Map([['m', { id: 'm', ifcDataStore: ds }]]), mutationViews: new Map([['m', view]]) } as never);
  });
  after(() => { useViewerStore.setState({ models: new Map(), mutationViews: new Map() } as never); });

  const modelling = () => createModellingStoreBackend(resolve);
  const ordinary = () => createOrdinaryStoreBackend(resolve);

  it('the guard throws the IFC5 refusal for a record an edit created, and finds no record in the file\'s own rows', () => {
    assert.equal(liveEntityConforms(ds, ids.wall, 'IfcWall', view), false);
    const created = view.createEntity('IfcWall', []);
    assert.equal(messageOf(() => liveEntityConforms(ds, created.expressId, 'IfcWall', view)), REFUSED);
  });

  it('the lists a writer reads are main\'s: no IfcRel records, so none', () => {
    assert.deepEqual(readRelatedLists(ds, 'IfcRelAssociatesMaterial', view), []);
    assert.deepEqual(readRelatedLists(ds, 'IfcRelDefinesByType', view), []);
  });

  it('the read-only checks answer what the writer\'s refuse: the material is an IfcMaterial, the graph has its lists', () => {
    assert.equal(liveEntityConformsForRead(ds, ids.material, 'IfcMaterial', view), true);
    assert.equal(liveEntityConformsForRead(ds, ids.wall, 'IfcWall', view), true);
    assert.equal(liveEntityConformsForRead(ds, ids.wall, 'IfcMaterial', view), false);
    assert.ok(readRelatedListsForRead(ds, 'IfcRelAssociatesMaterial', view).length > 0);
    assert.ok(readRelatedListsForRead(ds, 'IfcRelAssociatesMaterial', view).every((l) => l.relId === 0));
  });

  it('refuses assigning a material', () => {
    assert.equal(messageOf(() => modelling().assignMaterial('m', ids.material, [ids.wall])), `bim.store.assignMaterial: #${ids.material} is not a live entity`);
  });

  it('refuses assigning a type', () => {
    assert.equal(messageOf(() => modelling().assignType('m', ids.type, [ids.wall])), `bim.store.assignType: #${ids.type} is not a live entity`);
  });

  it('refuses adding an element', () => {
    const wall = { Start: [0, 0, 0], End: [3, 0, 0], Thickness: 0.2, Height: 2.5 } as never;
    assert.equal(messageOf(() => ordinary().addWall('m', ids.storey, wall)), 'resolveSpatialAnchor: no IfcGeometricRepresentationContext (or Body subcontext) found in store');
  });

  it('refuses deleting an element: the viewer\'s refusal stands and the closure is empty', () => {
    const reader = authoringReader(useViewerStore.getState(), 'm');
    assert.match(deletionRefusal(reader!, ids.wall) ?? 'PROCEEDED', /^IfcWall is not deleted by reviewed authoring \(supported: /);
    assert.deepEqual(deletionClosure(ds, [ids.wall], view), { ids: [], refused: [] });
  });

  it('leaves the model as it was: no rows added, no relationship records written', () => {
    assert.equal(ds.entities.count, rowsBefore);
    assert.equal(readRelatedLists(ds, 'IfcRelAssociatesMaterial').length, 0);
  });
});
