/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Model inspector's live reads over a FILE's entities (charter #6232,
 * M2.5): a wall's kind, type and layer set through its
 * IfcMaterialLayerSetUsage, and the names of materials, which are not
 * IfcRoot entities and so are not in the entity table's name index (the
 * inspector showed "#15046" for FZK-Haus's "Leichtbeton 102890359").
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser } from '@ifc-lite/parser';
import { authoredKindOf, entityName, layerSetOf, materialsOf, relationSnapshot, typeIndex, typeOf, typesOfKind, type LiveModel } from './authored-kinds.js';

const FIXTURE = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#30);
#30=IFCUNITASSIGNMENT((#31));
#31=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCWALLSTANDARDCASE('2XPyKWY018sA1ygZKgQPtU',$,'Wand-Int-ERDG-4',$,$,$,$,$,$);
#11=IFCWALLTYPE('2XPyKWY018sA1ygZKgQPtV',$,'Leichtbeton 240',$,$,$,$,$,$,.STANDARD.);
#12=IFCRELDEFINESBYTYPE('2XPyKWY018sA1ygZKgQPtW',$,$,$,(#10),#11);
#20=IFCMATERIAL('Leichtbeton 102890359',$,$);
#21=IFCMATERIALLAYER(#20,240.,$,$,$,$,$);
#22=IFCMATERIALLAYERSET((#21),'Wall 240',$);
#23=IFCMATERIALLAYERSETUSAGE(#22,.AXIS2.,.POSITIVE.,-120.,$);
#24=IFCRELASSOCIATESMATERIAL('2XPyKWY018sA1ygZKgQPtX',$,$,$,(#10),#23);
ENDSEC;
END-ISO-10303-21;
`;

async function model(): Promise<LiveModel> {
  const bytes = new TextEncoder().encode(FIXTURE);
  return { dataStore: await new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true }), view: null };
}

describe('authored-kinds over file entities (#6232 M2.5)', () => {
  it('reads a file wall\'s kind, type and layers, in metres, with material names', async () => {
    const live = await model();
    assert.equal(authoredKindOf(live, 10), 'wall', 'IfcWallStandardCase is a wall');
    assert.equal(typeOf(live, 10), 11);
    assert.deepEqual(typesOfKind(live, 'wall').map((t) => t.name), ['Leichtbeton 240']);
    const layers = layerSetOf(live, 10);
    assert.equal(layers?.via, 'element');
    assert.deepEqual(layers?.layers.map((l) => [l.materialId, +l.thickness.toFixed(6)]), [[20, 0.24]]);
    assert.equal(entityName(live, 20), 'Leichtbeton 102890359');
    assert.deepEqual(materialsOf(live).map((m) => m.name), ['Leichtbeton 102890359']);
    assert.equal(entityName(live, 10), 'Wand-Int-ERDG-4');
  });
});

/**
 * #154: a drawing's materials ask every cut element for its layer set. Read one
 * element at a time, each ask read every IfcRelAssociatesMaterial and
 * IfcRelDefinesByType in the model. A snapshot reads each kind once and
 * answers the same: the element's own set first, else its type's.
 */
const MANY = 12;
function manyWalls(): string {
  const g = (n: number) => `1${String(n).padStart(21, '0')}`;
  const lines = [
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#30);",
    '#30=IFCUNITASSIGNMENT((#31));',
    '#31=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
    "#20=IFCMATERIAL('Brick',$,$);",
    '#21=IFCMATERIALLAYER(#20,100.,$,$,$,$,$);',
    "#22=IFCMATERIALLAYERSET((#21),'Own',$);",
    '#23=IFCMATERIALLAYER(#20,200.,$,$,$,$,$);',
    "#24=IFCMATERIALLAYERSET((#23),'Typed',$);",
    "#11=IFCWALLTYPE('" + g(11) + "',$,'T',$,$,$,$,$,$,.STANDARD.);",
    "#12=IFCRELASSOCIATESMATERIAL('" + g(12) + "',$,$,$,(#11),#24);",
  ];
  for (let i = 0; i < MANY; i++) {
    const id = 100 + i;
    lines.push(`#${id}=IFCWALL('${g(id)}',$,'W${i}',$,$,$,$,$,.STANDARD.);`);
    // Even walls carry their own set; odd walls only their type's.
    if (i % 2 === 0) lines.push(`#${300 + i}=IFCRELASSOCIATESMATERIAL('${g(300 + i)}',$,$,$,(#${id}),#22);`);
    else lines.push(`#${300 + i}=IFCRELDEFINESBYTYPE('${g(300 + i)}',$,$,$,(#${id}),#11);`);
  }
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

describe('layer sets over many elements (#154)', () => {
  it('a relation snapshot answers what the per-element reads answer, reading each relationship once', async () => {
    const bytes = new TextEncoder().encode(manyWalls());
    const live: LiveModel = { dataStore: await new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true }), view: null };
    const walls = Array.from({ length: MANY }, (_, i) => 100 + i);
    const rels = new Set([12, ...walls.map((_, i) => 300 + i)]);
    let reads = 0;
    const byId = live.dataStore.entityIndex.byId;
    const get = byId.get.bind(byId);
    byId.get = ((id: number) => {
      if (rels.has(id)) reads++;
      return get(id);
    }) as typeof byId.get;

    const expected = walls.map((id) => layerSetOf(live, id));
    const perElement = reads;
    reads = 0;
    const snapshot = relationSnapshot(live);
    assert.deepEqual(walls.map((id) => layerSetOf(live, id, snapshot)), expected);
    assert.deepEqual(expected.map((set) => set?.via), walls.map((_, i) => (i % 2 === 0 ? 'element' : 'type')));
    assert.ok(reads <= rels.size, `the snapshot read ${reads} relationship records (${rels.size} exist; per element it was ${perElement})`);
    assert.ok(perElement > MANY * rels.size / 2, 'the per-element reads are the quadratic case the snapshot removes');
  });

  it('typeIndex agrees with typeOf', async () => {
    const live = await model();
    assert.equal(typeIndex(live).get(10) ?? null, typeOf(live, 10));
  });
});
