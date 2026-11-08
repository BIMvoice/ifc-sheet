/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A terrain the model contains in a storey is not the building (#683): Bonsai puts its 20 x 20 m ground box in the
 * storey, and it set the extent, was cut in every section as a block and was drawn in every elevation. A hand-written
 * model: a 4 m wall, and a terrain box 20 x 20 x 3 m with its top 200 mm under the storey, both contained in the storey.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import { openModel, type OpenedModel } from './headless.js';
import { storeyElementIds } from './storey-elements.js';

const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition[DesignTransferView]'),'2;1');
FILE_NAME('terrain.ifc','2026-11-08T00:00:00',('IfcSheet'),('IfcSheet'),'hand-written','hand-written','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('3terrainProject00000001',$,'Terrain',$,$,$,$,(#14),#9);
#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#6=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#9=IFCUNITASSIGNMENT((#2,#6));
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCDIRECTION((0.,0.,1.));
#12=IFCDIRECTION((1.,0.,0.));
#13=IFCAXIS2PLACEMENT3D(#10,#11,#12);
#14=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#13,$);
#15=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#14,$,.MODEL_VIEW.,$);
#22=IFCLOCALPLACEMENT($,#13);
#23=IFCLOCALPLACEMENT(#22,#13);
#24=IFCLOCALPLACEMENT(#23,#13);
#30=IFCSITE('3terrainSite0000000001',$,'Site',$,$,#22,$,$,.ELEMENT.,$,$,$,$,$);
#31=IFCBUILDING('3terrainBuilding000001',$,'Building',$,$,#23,$,$,.ELEMENT.,$,$,$);
#32=IFCBUILDINGSTOREY('3terrainLevel000000001',$,'Level 0',$,$,#24,$,$,.ELEMENT.,0.);
#34=IFCRELAGGREGATES('3terrainAggProject001',$,$,$,#1,(#30));
#35=IFCRELAGGREGATES('3terrainAggSite000001',$,$,$,#30,(#31));
#36=IFCRELAGGREGATES('3terrainAggBuilding01',$,$,$,#31,(#32));
#40=IFCDIRECTION((1.,0.));
#41=IFCCARTESIANPOINT((2.,0.15));
#42=IFCAXIS2PLACEMENT2D(#41,#40);
#43=IFCRECTANGLEPROFILEDEF(.AREA.,'Wall',#42,4.,0.3);
#44=IFCEXTRUDEDAREASOLID(#43,#13,#11,3.);
#45=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#44));
#46=IFCPRODUCTDEFINITIONSHAPE($,$,(#45));
#47=IFCLOCALPLACEMENT(#24,#13);
#48=IFCWALL('3terrainWall0000000001',$,'Wall',$,$,#47,#46,$,.STANDARD.);
#50=IFCCARTESIANPOINT((0.,0.));
#51=IFCAXIS2PLACEMENT2D(#50,#40);
#52=IFCRECTANGLEPROFILEDEF(.AREA.,'Ground',#51,20.,20.);
#53=IFCEXTRUDEDAREASOLID(#52,#13,#11,3.);
#54=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#53));
#55=IFCPRODUCTDEFINITIONSHAPE($,$,(#54));
#56=IFCCARTESIANPOINT((0.,0.,-3.2));
#57=IFCAXIS2PLACEMENT3D(#56,#11,#12);
#58=IFCLOCALPLACEMENT(#24,#57);
#59=IFCGEOGRAPHICELEMENT('3terrainPlane00000001',$,'Plane',$,$,#58,#55,$,.TERRAIN.);
#91=IFCRELCONTAINEDINSPATIALSTRUCTURE('3terrainContain00001',$,$,$,(#48,#59),#32);
ENDSEC;
END-ISO-10303-21;
`;

const WALL = 48;
const TERRAIN = 59;

describe('storeyElementIds leaves a terrain out of the building (#683)', () => {
  const types = new Map<number, IfcTypeEnum>([[10, IfcTypeEnum.IfcWall], [11, IfcTypeEnum.IfcGeographicElement], [12, IfcTypeEnum.IfcGeographicElement]]);
  // The terrain (11) is contained in the storey, a tree (12) hangs under the wall through an aggregate.
  const hierarchy = { byStorey: new Map([[1, [10, 11]]]), elementToStorey: new Map([[10, 1], [11, 1], [12, 1]]) };

  it('takes the wall and neither geographic element', () => {
    expect(storeyElementIds(hierarchy, [1], (id) => types.get(id)!)).toEqual([10]);
  });
});

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the terrain test: ${missing}`);

describe.skipIf(missing !== null)('a terrain contained in a storey does not frame or cut the building (#683)', () => {
  let model: OpenedModel;
  beforeAll(async () => { model = await openModel(new TextEncoder().encode(IFC)); }, 120_000);

  it('the terrain is a mesh of the model but not of the building', () => {
    expect((model.meshes ?? []).map((m) => m.expressId)).toContain(TERRAIN);
    expect(model.buildingMeshes.map((m) => m.expressId)).toEqual([WALL]);
  });

  it('the extent is the wall\'s, 4 m, not the terrain\'s 20 m', () => {
    const e = model.extent!;
    expect(e.max.x - e.min.x).toBeCloseTo(4, 1);
    expect(e.max.z - e.min.z).toBeLessThan(1);
  });
});
