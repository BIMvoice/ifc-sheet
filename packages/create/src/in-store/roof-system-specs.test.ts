/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `readRoofSystems` reads many roofs' specs in one pass (#154) and answers,
 * roof by roof, what `readRoofSystem` answers: a later Spec wins, an
 * unparseable one leaves none, a set that is not the roof system's is ignored,
 * and one relationship can carry several roofs.
 */

import { describe, expect, it } from 'vitest';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { readRoofSystem } from './roof-system-store.js';
import { readRoofSystems } from './roof-system-specs.js';

const spec = (name: string) => `{"name":"${name}","outline":[[0,0],[4,0],[4,3]],"eaveHeight":3,"rules":[]}`;
const guid = (n: number) => `0${String(n).padStart(21, '0')}`;

function fixture(): string {
  const lines = [
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,$);",
    // #10: one Spec. #11: two relationships, the later one wins. #12: an unparseable Spec.
    // #13: only another property set. #14: no property set. #15 and #16 share one relationship.
    ...[10, 11, 12, 13, 14, 15, 16].map((id) => `#${id}=IFCROOF('${guid(id)}',$,'Roof ${id}',$,$,$,$,$,.GABLE_ROOF.);`),
    `#100=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('${spec('ten')}'),$);`,
    "#101=IFCPROPERTYSET('" + guid(101) + "',$,'Pset_IfcLiteRoofSystem',$,(#100));",
    `#102=IFCRELDEFINESBYPROPERTIES('${guid(102)}',$,$,$,(#10),#101);`,
    `#110=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('${spec('eleven-first')}'),$);`,
    "#111=IFCPROPERTYSET('" + guid(111) + "',$,'Pset_IfcLiteRoofSystem',$,(#110));",
    `#112=IFCRELDEFINESBYPROPERTIES('${guid(112)}',$,$,$,(#11),#111);`,
    `#113=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('${spec('eleven-later')}'),$);`,
    "#114=IFCPROPERTYSET('" + guid(114) + "',$,'Pset_IfcLiteRoofSystem',$,(#113));",
    `#115=IFCRELDEFINESBYPROPERTIES('${guid(115)}',$,$,$,(#11),#114);`,
    "#120=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('not json'),$);",
    "#121=IFCPROPERTYSET('" + guid(121) + "',$,'Pset_IfcLiteRoofSystem',$,(#120));",
    `#122=IFCRELDEFINESBYPROPERTIES('${guid(122)}',$,$,$,(#12),#121);`,
    `#130=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('${spec('other set')}'),$);`,
    "#131=IFCPROPERTYSET('" + guid(131) + "',$,'Pset_RoofCommon',$,(#130));",
    `#132=IFCRELDEFINESBYPROPERTIES('${guid(132)}',$,$,$,(#13,#10),#131);`,
    `#150=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('${spec('shared')}'),$);`,
    "#151=IFCPROPERTYSET('" + guid(151) + "',$,'Pset_IfcLiteRoofSystem',$,(#150));",
    `#152=IFCRELDEFINESBYPROPERTIES('${guid(152)}',$,$,$,(#15,#16),#151);`,
  ];
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

async function load(): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(fixture());
  return new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
}

const ROOFS = [10, 11, 12, 13, 14, 15, 16];

describe('readRoofSystems (#154)', () => {
  it('answers roof by roof what readRoofSystem answers', async () => {
    const store = await load();
    const specs = readRoofSystems(store, ROOFS);
    for (const id of ROOFS) expect(specs.get(id) ?? null, `roof #${id}`).toEqual(readRoofSystem(store, id));
    expect([...specs.keys()].sort()).toEqual([10, 11, 15, 16]);
    expect(specs.get(11)?.name).toBe('eleven-later');
    expect(specs.get(16)?.name).toBe('shared');
  });

  it('reads only the roofs asked for', async () => {
    const store = await load();
    expect([...readRoofSystems(store, [11, 14]).keys()]).toEqual([11]);
    expect(readRoofSystems(store, []).size).toBe(0);
  });
});
