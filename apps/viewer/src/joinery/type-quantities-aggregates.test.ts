/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Quantities by type read from parsed models: an aggregate and its parts are
 * counted once (#108 review, item 2), and a model in millimetres comes out in
 * metres (#108 review, nit).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RelationshipType } from '@ifc-lite/data';
import { extractQuantitiesOnDemand } from '@ifc-lite/parser';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { typeQuantities } from '@bimvoice/ifcsheet';
import { collectTypeElements } from './type-quantities-models';

function seed(store: Awaited<ReturnType<typeof parseStep>>): void {
  useViewerStore.setState({ models: new Map([['m', { id: 'm', name: 'm', ifcDataStore: store, visible: true } as never]]) });
}

/**
 * An IfcRoof and an IfcStair that each carry their own Body and a Qto, and
 * aggregate parts (two IfcSlab, one IfcStairFlight) that carry theirs.
 */
const AGGREGATES = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,(#20),#30);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);
#21=IFCAXIS2PLACEMENT3D(#22,$,$);
#22=IFCCARTESIANPOINT((0.,0.,0.));
#30=IFCUNITASSIGNMENT((#31,#32,#33));
#31=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#32=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#33=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#40=IFCBUILDINGSTOREY('2hQBAVPOr5VxhS3Jl0O47h',$,'L0',$,$,#41,$,$,.ELEMENT.,0.);
#41=IFCLOCALPLACEMENT($,#21);
#42=IFCRELAGGREGATES('0kTvXnbbzCWw8lcMd1dR4o',$,$,$,#1,(#40));
#80=IFCPRODUCTDEFINITIONSHAPE($,$,(#81));
#81=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#82));
#82=IFCEXTRUDEDAREASOLID(#83,#21,#88,1.);
#83=IFCRECTANGLEPROFILEDEF(.AREA.,$,#84,1.,1.);
#84=IFCAXIS2PLACEMENT2D(#85,$);
#85=IFCCARTESIANPOINT((0.,0.));
#88=IFCDIRECTION((0.,0.,1.));
#100=IFCROOF('1Roof000000000000000001',$,'Roof',$,$,#41,#80,$,.GABLE_ROOF.);
#101=IFCSLAB('1Slab000000000000000001',$,'Roof slab N',$,$,#41,#80,$,.ROOF.);
#102=IFCSLAB('1Slab000000000000000002',$,'Roof slab S',$,$,#41,#80,$,.ROOF.);
#103=IFCRELAGGREGATES('1Aggr000000000000000001',$,$,$,#100,(#101,#102));
#110=IFCSTAIR('1Stai000000000000000001',$,'Stair',$,$,#41,#80,$,.STRAIGHT_RUN_STAIR.);
#111=IFCSTAIRFLIGHT('1Flig000000000000000001',$,'Flight',$,$,#41,#80,$,$,$,$,$,.STRAIGHT.);
#112=IFCRELAGGREGATES('1Aggr000000000000000002',$,$,$,#110,(#111));
#120=IFCRELCONTAINEDINSPATIALSTRUCTURE('1kTvXnbbzCWw8lcMd1dR4o',$,$,$,(#100,#110),#40);
#200=IFCQUANTITYAREA('GrossArea',$,$,50.,$);
#201=IFCQUANTITYVOLUME('GrossVolume',$,$,10.,$);
#202=IFCELEMENTQUANTITY('1Qto0000000000000000001',$,'Qto_RoofBaseQuantities',$,$,(#200,#201));
#203=IFCRELDEFINESBYPROPERTIES('1Rdp0000000000000000001',$,$,$,(#100),#202);
#210=IFCQUANTITYAREA('NetArea',$,$,25.,$);
#211=IFCQUANTITYVOLUME('NetVolume',$,$,5.,$);
#212=IFCELEMENTQUANTITY('1Qto0000000000000000002',$,'Qto_SlabBaseQuantities',$,$,(#210,#211));
#213=IFCRELDEFINESBYPROPERTIES('1Rdp0000000000000000002',$,$,$,(#101,#102),#212);
#220=IFCQUANTITYVOLUME('GrossVolume',$,$,3.,$);
#221=IFCELEMENTQUANTITY('1Qto0000000000000000003',$,'Qto_StairBaseQuantities',$,$,(#220));
#222=IFCRELDEFINESBYPROPERTIES('1Rdp0000000000000000003',$,$,$,(#110),#221);
#230=IFCQUANTITYVOLUME('NetVolume',$,$,2.,$);
#231=IFCELEMENTQUANTITY('1Qto0000000000000000004',$,'Qto_StairFlightBaseQuantities',$,$,(#230));
#232=IFCRELDEFINESBYPROPERTIES('1Rdp0000000000000000004',$,$,$,(#111),#231);
ENDSEC;
END-ISO-10303-21;
`;

describe('quantities by type from a parsed model', () => {
  it('counts an aggregate once: an IfcRoof or IfcStair with its own Body and Qto gives way to its listed parts', async () => {
    seed(await parseStep(AGGREGATES));
    const elements = collectTypeElements();
    assert.deepEqual(elements.map((e) => e.className).sort(), ['IfcSlab', 'IfcSlab', 'IfcStairFlight']);
    const out = typeQuantities(elements);
    assert.deepEqual(out.classTotals.map((c) => [c.className, c.total.count, c.total.area, c.total.volume]), [
      ['IfcSlab', 2, 50, 10], ['IfcStairFlight', 1, null, 2],
    ]);
    // Neither the roof's 10 m³ nor the stair's 3 m³ is added on top of their parts.
    const volume = out.classTotals.reduce((sum, c) => sum + (c.total.volume ?? 0), 0);
    assert.equal(volume, 12);
  });

  it('reads a model in millimetres in metres: building-architecture.ifc, lengths in mm, areas in m², volumes in m³', async () => {
    const store = await parseStep(new Uint8Array(readFileSync(new URL('../../public/samples/building-architecture.ifc', import.meta.url))));
    seed(store);
    const walls = typeQuantities(collectTypeElements()).rows.filter((r) => r.className === 'IfcWallType');
    assert.ok(walls.length > 0, 'the sample has typed walls');

    // The expectation, independently: the raw Qto figures off the file, the length divided by 1000.
    let length = 0, area = 0, volume = 0, count = 0;
    for (const typeId of store.entityIndex.byType.get('IFCWALLTYPE') ?? []) {
      for (const edge of store.relationships.forward.getEdges(typeId, RelationshipType.DefinesByType)) {
        const q = new Map<string, number>();
        for (const qs of extractQuantitiesOnDemand(store, edge.target)) for (const x of qs.quantities) q.set(x.name, x.value);
        count += 1;
        length += (q.get('Length') ?? 0) / 1000;
        area += q.get('NetSideArea') ?? q.get('GrossSideArea') ?? 0;
        volume += q.get('NetVolume') ?? q.get('GrossVolume') ?? 0;
      }
    }
    const sum = (k: 'length' | 'area' | 'volume') => walls.reduce((s, r) => s + (r.total[k] ?? 0), 0);
    assert.equal(walls.reduce((s, r) => s + r.total.count, 0), count);
    assert.ok(Math.abs(sum('length') - length) < 1e-9, `length ${sum('length')} m vs ${length} m`);
    assert.ok(Math.abs(sum('area') - area) < 1e-9, `area ${sum('area')} vs ${area}`);
    assert.ok(Math.abs(sum('volume') - volume) < 1e-9, `volume ${sum('volume')} vs ${volume}`);
    // A wall is metres long, not thousands: the longest stated wall is 6000 mm.
    for (const r of walls) assert.ok(r.total.length! / r.total.count < 50, `${r.typeName}: ${r.total.length} m over ${r.total.count} walls`);
  });
});
