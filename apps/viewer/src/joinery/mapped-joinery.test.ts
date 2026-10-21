/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The joinery a plan or elevation draws each door and window with (#154).
 * Every door and window on a drawing asks for its type. Before, each ask read
 * every IfcRelDefinesByType in the model, so a drawing of N doors over M type
 * relationships read N x M relationships, and a large model froze the Wall for
 * minutes. Now the types are read once per model and overlay state, and every
 * answer is the same as reading them one element at a time.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { typeIndex, typeOf, type LiveModel } from '@/lib/commands/modeling/authored-kinds';
import { drawnJoinery, elementFacts } from './mapped-joinery';
import { invalidateJoineryReads, joineryOfElement } from './element-spec';

const DOORS = 30;
const MODEL = 'm154';

/** `DOORS` doors, each typed by its own IfcRelDefinesByType; door 1 is also in a second one, and the last door has no type. */
function fixture(): string {
  const lines = [
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#2);",
    '#2=IFCUNITASSIGNMENT((#3));',
    '#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
    "#10=IFCDOORTYPE('1kTvXnbbzCWw8lcMd1dR4o',$,'Door type A',$,$,$,$,$,$,.DOOR.,.SINGLE_SWING_LEFT.,$,$);",
    "#11=IFCDOORTYPE('1kTvXnbbzCWw8lcMd1dR4p',$,'Door type B',$,$,$,$,$,$,.DOOR.,.SINGLE_SWING_LEFT.,$,$);",
  ];
  const guid = (n: number) => `0${String(n).padStart(21, '0')}`;
  for (let i = 0; i < DOORS; i++) {
    lines.push(`#${100 + i}=IFCDOOR('${guid(100 + i)}',$,'Door ${i}',$,$,$,$,$,2100.,${900 + i},.DOOR.,.SINGLE_SWING_LEFT.,$);`);
  }
  for (let i = 0; i < DOORS - 1; i++) {
    lines.push(`#${500 + i}=IFCRELDEFINESBYTYPE('${guid(500 + i)}',$,$,$,(#${100 + i}),#${i % 2 === 0 ? 10 : 11});`);
  }
  // Door #101 is in a second relationship too: the first one read wins.
  lines.push(`#600=IFCRELDEFINESBYTYPE('${guid(600)}',$,$,$,(#101),#10);`);
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

const RELS = new Set([...Array.from({ length: DOORS - 1 }, (_, i) => 500 + i), 600]);
const doorIds = Array.from({ length: DOORS }, (_, i) => 100 + i);

/** Count every read of a type relationship's record out of the model. */
function countRelReads(store: IfcDataStore): { reads: number } {
  const counter = { reads: 0 };
  const byId = store.entityIndex.byId;
  const get = byId.get.bind(byId);
  byId.get = ((id: number) => {
    if (RELS.has(id)) counter.reads++;
    return get(id);
  }) as typeof byId.get;
  return counter;
}

async function load(): Promise<LiveModel> {
  const bytes = new TextEncoder().encode(fixture());
  return { dataStore: await new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true }), view: null };
}

describe('door and window types on a drawing (#154)', () => {
  let live: LiveModel;
  beforeEach(async () => {
    live = await load();
    useViewerStore.setState({
      models: new Map([[MODEL, { ifcDataStore: live.dataStore }]]) as unknown as ReturnType<typeof useViewerStore.getState>['models'],
      mutationViews: new Map(),
    });
    invalidateJoineryReads();
  });

  it('typeIndex answers what typeOf answers, element by element', () => {
    const index = typeIndex(live);
    for (const id of doorIds) assert.equal(index.get(id) ?? null, typeOf(live, id), `door #${id}`);
    assert.equal(index.get(101), 11, 'the first relationship read wins, as in typeOf');
    assert.equal(index.get(100 + DOORS - 1), undefined, 'an untyped door has no type');
  });

  it('elementFacts finds the same type through an index as through typeOf', () => {
    const index = typeIndex(live);
    for (const id of doorIds) {
      assert.deepEqual(elementFacts(MODEL, id, (_live, el) => index.get(el) ?? null), elementFacts(MODEL, id), `door #${id}`);
    }
  });

  it('drawing every door reads each type relationship a bounded number of times, not once per door', () => {
    const counter = countRelReads(live.dataStore);
    for (const id of doorIds) drawnJoinery(MODEL, id);
    // Two memos (the model's own type, then the mapping's facts) each read the
    // relationships once. Per door it was 2 x DOORS x RELS.size.
    assert.ok(counter.reads <= 2 * RELS.size, `read ${counter.reads} relationship records for ${DOORS} doors over ${RELS.size} relationships`);
    assert.ok(counter.reads > 0, 'the relationships were read at all (the counter sees the reads)');
  });

  it('a type read again after the reads are forgotten is read afresh', () => {
    assert.equal(joineryOfElement(MODEL, 100), null, 'a type with no joinery spec configures nothing');
    const counter = countRelReads(live.dataStore);
    joineryOfElement(MODEL, 102);
    assert.equal(counter.reads, 0, 'within one stamp the index is reused');
    invalidateJoineryReads(MODEL);
    joineryOfElement(MODEL, 102);
    assert.equal(counter.reads, RELS.size, 'after invalidation it is rebuilt once');
  });
});
