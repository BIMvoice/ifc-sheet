/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Which file is the next version of the loaded model: by the IfcProject GlobalId, never by name or hash. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectGuidOfStore, scanIfcProjectGuid, versionOfLoadedModel } from './model-identity.js';

const P = '0lY6P5Ur90TAQnnnI6wtnb';
const ifc = (guid: string, pad = '') => new File([`ISO-10303-21;\nDATA;\n${pad}#1= IFCPROJECTLIBRARY('LIBRARYGUID0000000000',$);\n#2= IFCPROJECT('${guid}',#12,'House',$,$,$,$,$,$);\nENDSEC;`], 'v2.ifc');
const store = (guid: string | null) => ({ entityIndex: { byType: new Map([['IFCPROJECT', guid === null ? [] : [2]]]) }, entities: { getGlobalId: () => guid ?? '' } });
const loaded = (guid: string | null, extra: Record<string, unknown> = {}) => ({ name: 'house.ifc', fileSize: 10, ifcDataStore: store(guid) as never, ...extra });

describe('scanIfcProjectGuid', () => {
  it('reads the IfcProject GlobalId, not the one of an IfcProjectLibrary', async () => {
    assert.equal(await scanIfcProjectGuid(ifc(P)), P);
  });
  it('finds it past the first chunk, and across a chunk boundary', async () => {
    const f = ifc(P, 'x'.repeat(5000));
    const at = (await f.text()).indexOf("IFCPROJECT('");
    // A chunk that ends inside the record, inside the GlobalId, and just after the opening quote.
    for (const chunk of [at + 5, at + 20, at + 12, 64, 997, 1 << 20]) assert.equal(await scanIfcProjectGuid(f, chunk), P, `chunk ${chunk}`);
  });
  it('is null for a file with no IfcProject', async () => {
    assert.equal(await scanIfcProjectGuid(new File(['DATA;\n#1= IFCWALL($);'], 'a.ifc')), null);
  });
});

describe('projectGuidOfStore', () => {
  it('reads the IfcProject of the parsed model, and nothing from a model without one', () => {
    assert.equal(projectGuidOfStore(store(P)), P);
    assert.equal(projectGuidOfStore(store(null)), null);
    assert.equal(projectGuidOfStore(null), null);
  });
});

describe('versionOfLoadedModel', () => {
  it('names the loaded model when the file carries its IfcProject GlobalId', async () => {
    const m = loaded(P);
    assert.equal(await versionOfLoadedModel(ifc(P), [m]), m);
  });
  it('is not a version of a model of another project', async () => {
    assert.equal(await versionOfLoadedModel(ifc('1111111111111111111111'), [loaded(P)]), null);
  });
  it('is not a version of a model with no IfcProject, or of a federation', async () => {
    assert.equal(await versionOfLoadedModel(ifc(P), [loaded(null)]), null);
    assert.equal(await versionOfLoadedModel(ifc(P), [loaded(P), loaded(P)]), null);
    assert.equal(await versionOfLoadedModel(ifc(P), []), null);
  });
  it('is not the file that is already open', async () => {
    const f = ifc(P);
    assert.equal(await versionOfLoadedModel(f, [loaded(P, { name: 'v2.ifc', fileSize: f.size })]), null);
  });
  it('is only asked of an IFC file', async () => {
    assert.equal(await versionOfLoadedModel(new File([await ifc(P).text()], 'v2.ifcx'), [loaded(P)]), null);
  });
});
