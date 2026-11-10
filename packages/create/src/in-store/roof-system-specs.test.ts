/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `readRoofSystems` reads many roofs' specs in one pass (#154) and answers,
 * roof by roof, what `readRoofSystem` answers: a later Spec wins, an
 * unparseable one leaves none, a set that is not the roof system's is ignored,
 * and one relationship can carry several roofs.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityExtractor, IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { readRoofSystem } from './roof-system-store.js';
import { readRoofSystems } from './roof-system-specs.js';
import { AnchorEntityReader } from './resolve-anchor.js';

const spec = (name: string) => `{"name":"${name}","outline":[[0,0],[4,0],[4,3]],"eaveHeight":3,"rules":[]}`;
const guid = (n: number) => `0${String(n).padStart(21, '0')}`;

function fixture(extra: string[] = []): string {
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
    ...extra,
  ];
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

async function load(extra: string[] = []): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(fixture(extra));
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

/** Relationships that name no roof: the project, under the roof system's own set, so only RelatedObjects tells them apart. */
const UNRELATED = Array.from({ length: 20 }, (_, k) => 200 + k);
const unrelated = UNRELATED.map((id) => `#${id}=IFCRELDEFINESBYPROPERTIES('${guid(id)}',$,$,$,(#1),#101);`);

describe('readRoofSystems skips the relationships that name no roof (#154)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not parse a relationship that names none of the roofs asked for, and answers the same', async () => {
    const store = await load(unrelated);
    const parsed: number[] = [];
    const extract = EntityExtractor.prototype.extractEntity;
    vi.spyOn(EntityExtractor.prototype, 'extractEntity').mockImplementation(function (this: EntityExtractor, ref) {
      parsed.push(ref.expressId);
      return extract.call(this, ref);
    });
    const specs = readRoofSystems(store, ROOFS);
    expect(parsed.filter((id) => UNRELATED.includes(id))).toEqual([]);
    // #132 names roofs #13 and #10, so it is still read; #102 names #10.
    expect(parsed).toEqual(expect.arrayContaining([102, 112, 115, 122, 132, 152]));
    vi.restoreAllMocks();
    for (const id of ROOFS) expect(specs.get(id) ?? null, `roof #${id}`).toEqual(readRoofSystem(store, id));
    expect([...specs.keys()].sort()).toEqual([10, 11, 15, 16]);
  });

  it('still reads a roof named only as a quoted or encoded reference, a bare integer, a real or an exponent', async () => {
    // refId takes '#14' as a reference (also spelt with encoded digits, `\X\31` is "1"); the parser reads 14, 14., 1.4E1
    // and 140E-1 as the number 14. None is valid IFC, and every one was read before.
    for (const related of ["('#14')", "('#\\X\\31\\X\\34')", '(14)', '(14.)', '(1.4E1)', '(140E-1)']) {
      const store = await load([...unrelated, `#160=IFCRELDEFINESBYPROPERTIES('${guid(160)}',$,$,$,${related},#101);`]);
      expect(readRoofSystems(store, [14]).get(14)?.name, related).toBe('ten');
    }
  });

  it('reads a relationship the session created over a source one', async () => {
    const store = await load(unrelated);
    const view = new MutablePropertyView(null, 'm1');
    view.restoreNewEntity({ expressId: UNRELATED[2], type: 'IfcRelDefinesByProperties', attributes: [guid(901), null, null, null, [14], 101] });
    const specs = readRoofSystems(store, ROOFS, view);
    for (const id of ROOFS) expect(specs.get(id) ?? null, `roof #${id}`).toEqual(readRoofSystem(store, id, view));
    expect(specs.get(14)?.name).toBe('ten');
  });

  it('reads what the mutation view says: a created relationship, a relationship edited to name a roof, a deleted one', async () => {
    const store = await load(unrelated);
    const view = new MutablePropertyView(null, 'm1');
    view.setExpressIdWatermark(1000);
    // Roof #14 gets the "ten" set through a relationship the session created.
    const created = view.createEntity('IfcRelDefinesByProperties', [guid(900), null, null, null, [14], 101]);
    // Roof #12's set is swapped for "ten" by editing an unrelated relationship to name it.
    view.setPositionalAttribute(UNRELATED[0], 4, [12]);
    view.deleteEntity(122);
    // Roof #13 by a named edit of another unrelated relationship.
    view.setAttribute(UNRELATED[1], 'RelatedObjects', '(#13)');
    const specs = readRoofSystems(store, ROOFS, view);
    for (const id of ROOFS) expect(specs.get(id) ?? null, `roof #${id}`).toEqual(readRoofSystem(store, id, view));
    expect(created.expressId).toBeGreaterThan(1000);
    expect(specs.get(14)?.name).toBe('ten');
    expect(specs.get(12)?.name).toBe('ten');
  });
});

describe('AnchorEntityReader.mayReferTo (#154)', () => {
  const ids = new Set([14]);

  it('rules out only a source entity the view leaves alone whose text names none of the ids', async () => {
    const store = await load(unrelated);
    const reader = new AnchorEntityReader(store, new MutablePropertyView(null, 'm1'));
    expect(reader.mayReferTo(UNRELATED[0], ids)).toBe(false);
    expect(reader.mayReferTo(102, new Set([10]))).toBe(true);
    // Not in the source at all: left to `entity`.
    expect(reader.mayReferTo(5000, ids)).toBe(true);
  });

  it('answers true for every edit the view can make to the entity', async () => {
    const store = await load(unrelated);
    const edits: Array<[string, (view: MutablePropertyView, id: number) => void]> = [
      ['positional', (view, id) => view.setPositionalAttribute(id, 5, '#14')],
      ['named', (view, id) => view.setAttribute(id, 'RelatingPropertyDefinition', '#14')],
      ['retyped', (view, id) => view.setEntityType(id, 'IfcRelDefinesByType')],
    ];
    for (const [name, edit] of edits) {
      const view = new MutablePropertyView(null, 'm1');
      edit(view, UNRELATED[3]);
      expect(new AnchorEntityReader(store, view).mayReferTo(UNRELATED[3], ids), name).toBe(true);
    }
  });
});
