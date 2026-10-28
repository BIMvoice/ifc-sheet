/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The per-pass memos behind a drawing's doors and windows (#154) must not
 * outlive what they were read from: a collab room refresh swaps in a new data
 * store under the same model id, and an edit that retypes an element changes
 * the overlay. Either way the next draw reads the types afresh.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { defaultDoorSpec, type JoinerySpec } from '@ifc-lite/create';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { DEFAULT_JOINERY_MAPPING } from './symbol-mapping';
import { drawnJoinery } from './mapped-joinery';
import { invalidateJoineryReads, joineryOfElement } from './element-spec';

const MODEL = 'm154-memo';
const TYPE_A = '1kTvXnbbzCWw8lcMd1dR4o';
const TYPE_B = '1kTvXnbbzCWw8lcMd1dR4p';

/** Doors #100 and #101; types #10 (A) and #11 (B); `rels` lists [door, type] pairs, one IfcRelDefinesByType each. */
function fixture(rels: Array<[number, number]>, withSpec: boolean): string {
  const guid = (n: number) => `0${String(n).padStart(21, '0')}`;
  const lines = [
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#2);",
    '#2=IFCUNITASSIGNMENT((#3));',
    '#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
  ];
  for (const [typeId, name, g, specId] of [[10, 'Door type A', TYPE_A, 'specA'], [11, 'Door type B', TYPE_B, 'specB']] as const) {
    if (withSpec) {
      lines.push(`#${typeId + 100}=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('{"id":"${specId}"}'),$);`);
      lines.push(`#${typeId + 200}=IFCPROPERTYSET('${guid(typeId + 200)}',$,'Pset_IfcLiteJoinery',$,(#${typeId + 100}));`);
    }
    lines.push(`#${typeId}=IFCDOORTYPE('${g}',$,'${name}',$,$,${withSpec ? `(#${typeId + 200})` : '$'},$,$,$,.DOOR.,.SINGLE_SWING_LEFT.,$,$);`);
  }
  for (const id of [100, 101]) lines.push(`#${id}=IFCDOOR('${guid(id)}',$,'Door ${id}',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);`);
  rels.forEach(([door, type], i) => lines.push(`#${500 + i}=IFCRELDEFINESBYTYPE('${guid(500 + i)}',$,$,$,(#${door}),#${type});`));
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

async function load(rels: Array<[number, number]>, withSpec: boolean): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(fixture(rels, withSpec));
  return new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
}

function show(dataStore: IfcDataStore, view: MutablePropertyView | null = null): void {
  useViewerStore.setState({
    models: new Map([[MODEL, { ifcDataStore: dataStore }]]) as unknown as ReturnType<typeof useViewerStore.getState>['models'],
    mutationViews: new Map(view ? [[MODEL, view]] : []),
  });
}

/** Retype the occurrences of relationship `relId` the way an edit does: rewrite its relating type. */
function retype(view: MutablePropertyView, relId: number, type: number): void {
  view.setPositionalAttribute(relId, 5, type);
}

const entry = (id: string): JoinerySpec => ({ ...defaultDoorSpec(id), id, mark: id });

describe('joinery memos follow the data store and the overlay (#154)', () => {
  beforeEach(() => {
    invalidateJoineryReads();
    useProjectStore.setState({
      joineryTypes: [entry('mapA'), entry('mapB')],
      joineryMapping: { ...DEFAULT_JOINERY_MAPPING, byName: false, byDimensions: false, types: { [TYPE_A]: 'mapA', [TYPE_B]: 'mapB' } },
      symbolFlips: {},
    });
  });

  it('a collab refresh that swaps the data store under one model id draws a door with the new store\'s type', async () => {
    show(await load([[101, 10]], false));
    assert.equal(drawnJoinery(MODEL, 101)?.entry?.id, 'mapA', 'door 101 is type A before the refresh');
    // The refreshed store numbers its ids from 1 again: door 100 is type B, door 101 is untyped.
    show(await load([[100, 11]], false));
    assert.equal(drawnJoinery(MODEL, 100)?.entry?.id, 'mapB', 'door 100, first drawn after the refresh, is type B');
  });

  it('the same for the model\'s own configured type', async () => {
    show(await load([[101, 10]], true));
    assert.equal(joineryOfElement(MODEL, 101)?.spec.id, 'specA');
    show(await load([[100, 11]], true));
    assert.equal(joineryOfElement(MODEL, 100)?.spec.id, 'specB');
  });

  it('an edit that retypes a mapped door is drawn with the new type on the next pass', async () => {
    const dataStore = await load([[100, 10], [101, 10]], false);
    const view = new MutablePropertyView(null, MODEL);
    show(dataStore, view);
    assert.equal(drawnJoinery(MODEL, 100)?.entry?.id, 'mapA');
    retype(view, 501, 11);
    // Door 101 is first drawn after the edit, so only a rebuilt index can know its new type.
    assert.equal(drawnJoinery(MODEL, 101)?.entry?.id, 'mapB');
  });

  it('an edit that retypes a configured door is read with the new type on the next pass', async () => {
    const dataStore = await load([[100, 10], [101, 10]], true);
    const view = new MutablePropertyView(null, MODEL);
    show(dataStore, view);
    assert.equal(joineryOfElement(MODEL, 100)?.spec.id, 'specA');
    retype(view, 501, 11);
    assert.equal(joineryOfElement(MODEL, 101)?.spec.id, 'specB', 'door 101, first read after the edit, has the new type');
  });
});
