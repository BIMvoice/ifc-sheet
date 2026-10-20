/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room finishes read through the real parser from an IFC2x3-style model
 * (PR #109 review):
 *  - a covering's area comes from `BaseQuantities` when the model has no
 *    `Qto_CoveringBaseQuantities`, and the Qto still wins when both exist;
 *  - a NOTDEFINED IfcCovering takes its IfcCoveringType's PredefinedType;
 *  - a covering IfcRelCoversSpaces gives to two rooms has its area split
 *    equally between them.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { roomFinishes } from './room-finishes.js';
import { collectRoomInputs } from './room-finishes-models.js';

const STEP = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('finishes-ifc2x3.ifc','2026-10-20T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#2,$);
#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#6=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#7=IFCUNITASSIGNMENT((#5,#6));
#8=IFCPROJECT('2FINISH000000000000001',$,'Finishes 2x3',$,$,$,$,(#4),#7);
#9=IFCSITE('2FINISH000000000000002',$,'Site',$,$,#3,$,$,.ELEMENT.,$,$,$,$,$);
#10=IFCBUILDING('2FINISH000000000000003',$,'Building',$,$,#3,$,$,.ELEMENT.,$,$,$);
#11=IFCBUILDINGSTOREY('2FINISH000000000000004',$,'Level 2',$,$,#3,$,$,.ELEMENT.,3.);
#12=IFCRELAGGREGATES('2FINISH000000000000005',$,$,$,#8,(#9));
#13=IFCRELAGGREGATES('2FINISH000000000000006',$,$,$,#9,(#10));
#14=IFCRELAGGREGATES('2FINISH000000000000007',$,$,$,#10,(#11));
#15=IFCSPACE('2FINISH000000000000008',$,'201',$,$,#3,$,'Hall',.ELEMENT.,.INTERNAL.,$);
#16=IFCSPACE('2FINISH000000000000009',$,'202',$,$,#3,$,'Corridor',.ELEMENT.,.INTERNAL.,$);
#17=IFCRELAGGREGATES('2FINISH000000000000010',$,$,$,#11,(#15,#16));
#20=IFCCOVERINGTYPE('2FINISH000000000000011',$,'Tile type',$,$,$,$,$,$,.FLOORING.);
#21=IFCCOVERING('2FINISH000000000000012',$,'Ceramic tile',$,$,#3,$,$,.NOTDEFINED.);
#22=IFCRELDEFINESBYTYPE('2FINISH000000000000013',$,$,$,(#21),#20);
#23=IFCQUANTITYAREA('NetArea',$,$,30.);
#24=IFCELEMENTQUANTITY('2FINISH000000000000014',$,'BaseQuantities',$,$,(#23));
#25=IFCRELDEFINESBYPROPERTIES('2FINISH000000000000015',$,$,$,(#21),#24);
#30=IFCCOVERING('2FINISH000000000000016',$,'Gypsum paint',$,$,#3,$,$,.CLADDING.);
#31=IFCQUANTITYAREA('GrossArea',$,$,40.);
#32=IFCELEMENTQUANTITY('2FINISH000000000000017',$,'BaseQuantities',$,$,(#31));
#33=IFCRELDEFINESBYPROPERTIES('2FINISH000000000000018',$,$,$,(#30),#32);
#40=IFCCOVERING('2FINISH000000000000019',$,'Acoustic panel',$,$,#3,$,$,.CEILING.);
#41=IFCQUANTITYAREA('NetArea',$,$,99.);
#42=IFCELEMENTQUANTITY('2FINISH000000000000020',$,'BaseQuantities',$,$,(#41));
#43=IFCRELDEFINESBYPROPERTIES('2FINISH000000000000021',$,$,$,(#40),#42);
#44=IFCQUANTITYAREA('NetArea',$,$,7.);
#45=IFCELEMENTQUANTITY('2FINISH000000000000022',$,'Qto_CoveringBaseQuantities',$,$,(#44));
#46=IFCRELDEFINESBYPROPERTIES('2FINISH000000000000023',$,$,$,(#40),#45);
#50=IFCCOVERING('2FINISH000000000000024',$,'Untyped board',$,$,#3,$,$,.NOTDEFINED.);
#60=IFCRELCOVERSSPACES('2FINISH000000000000025',$,$,$,#15,(#21,#30,#50));
#61=IFCRELCOVERSSPACES('2FINISH000000000000026',$,$,$,#16,(#21,#40));
ENDSEC;
END-ISO-10303-21;
`;

async function load(): Promise<void> {
  const store = await parseStep(STEP);
  useViewerStore.setState({ models: new Map([['fx', { id: 'fx', name: 'fx', ifcDataStore: store, visible: true } as never]]) });
}

afterEach(() => useViewerStore.setState({ models: new Map() }));

describe('room finishes of an IFC2x3-style model (PR #109 review)', () => {
  it('reads areas from BaseQuantities, the Qto first when both exist', async () => {
    await load();
    const [hall, corridor] = roomFinishes(collectRoomInputs());
    assert.deepEqual(hall.finishes.wall.map((f) => [f.name, f.area]), [['Gypsum paint', 40]]);
    assert.deepEqual(corridor.finishes.ceiling.map((f) => [f.name, f.area]), [['Acoustic panel', 7]]);
  });

  it('takes a NOTDEFINED covering\'s surface from its IfcCoveringType, and leaves out an untyped NOTDEFINED one', async () => {
    await load();
    const [hall] = roomFinishes(collectRoomInputs());
    assert.deepEqual(hall.finishes.floor.map((f) => f.name), ['Ceramic tile']);
    assert.ok(![...hall.finishes.floor, ...hall.finishes.wall, ...hall.finishes.ceiling].some((f) => f.name === 'Untyped board'));
  });

  it('splits a covering shared by two rooms equally between them', async () => {
    await load();
    const rooms = roomFinishes(collectRoomInputs());
    assert.deepEqual(rooms.map((r) => r.number), ['201', '202']);
    for (const r of rooms) assert.deepEqual(r.finishes.floor.map((f) => [f.name, f.area, f.sharedBy]), [['Ceramic tile', 15, 2]], r.number);
    assert.equal(rooms[0].finishes.wall[0].sharedBy, 1);
  });
});
