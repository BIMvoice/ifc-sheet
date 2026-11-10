/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #586: a door or panel that is a part of a curtain wall is on its storey's plan. The curtain wall is contained in the storey
 * (IfcRelContainedInSpatialStructure) and its plate and door are its aggregated parts (IfcRelAggregates), the way Revit
 * exports a curtain wall door: the parts are not in the storey's own list of contained elements. On the ISSUE_068 skolebygg
 * model that left 8 curtain wall doors (and every curtain wall panel) off the plans.
 *
 * The fixture: Level 0 holds wall A (x 0..6, y 0..0.3) and wall B (x 0..0.3, y 0..6), 3 m high, and a curtain wall with no
 * body of its own whose two parts stand at y 3.0..3.1: a glass plate (x 1..3) and a door (x 3..3.9, 2.1 m high).
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { PlanProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { storeyElementIds } from './storey-elements.js';

const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition[DesignTransferView]'),'2;1');
FILE_NAME('curtain-wall-parts.ifc','2026-10-30T00:00:00',('IfcSheet'),('IfcSheet'),'hand-written','hand-written','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('3cwPartsProject0000001',$,'Curtain wall parts',$,$,$,$,(#14),#9);
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
#30=IFCSITE('3cwPartsSite0000000001',$,'Site',$,$,#22,$,$,.ELEMENT.,$,$,$,$,$);
#31=IFCBUILDING('3cwPartsBuilding000001',$,'Building',$,$,#23,$,$,.ELEMENT.,$,$,$);
#32=IFCBUILDINGSTOREY('3cwPartsLevel000000001',$,'Level 0',$,$,#24,$,$,.ELEMENT.,0.);
#34=IFCRELAGGREGATES('3cwPartsAggProject0001',$,$,$,#1,(#30));
#35=IFCRELAGGREGATES('3cwPartsAggSite0000001',$,$,$,#30,(#31));
#36=IFCRELAGGREGATES('3cwPartsAggBuilding001',$,$,$,#31,(#32));
#40=IFCDIRECTION((1.,0.));
#41=IFCCARTESIANPOINT((3.,0.15));
#42=IFCAXIS2PLACEMENT2D(#41,#40);
#43=IFCRECTANGLEPROFILEDEF(.AREA.,'A',#42,6.,0.3);
#44=IFCEXTRUDEDAREASOLID(#43,#13,#11,3.);
#45=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#44));
#46=IFCPRODUCTDEFINITIONSHAPE($,$,(#45));
#47=IFCLOCALPLACEMENT(#24,#13);
#48=IFCWALL('3cwPartsWallA000000001',$,'Wall A',$,$,#47,#46,$,.STANDARD.);
#50=IFCCARTESIANPOINT((0.15,3.));
#51=IFCAXIS2PLACEMENT2D(#50,#40);
#52=IFCRECTANGLEPROFILEDEF(.AREA.,'B',#51,0.3,6.);
#53=IFCEXTRUDEDAREASOLID(#52,#13,#11,3.);
#54=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#53));
#55=IFCPRODUCTDEFINITIONSHAPE($,$,(#54));
#56=IFCLOCALPLACEMENT(#24,#13);
#57=IFCWALL('3cwPartsWallB000000001',$,'Wall B',$,$,#56,#55,$,.STANDARD.);
#60=IFCCARTESIANPOINT((1.,3.,0.));
#61=IFCAXIS2PLACEMENT3D(#60,#11,#12);
#62=IFCLOCALPLACEMENT(#24,#61);
#63=IFCCURTAINWALL('3cwPartsCurtainWall001',$,'Curtain wall',$,$,#62,$,$,.NOTDEFINED.);
#70=IFCCARTESIANPOINT((1.,0.05));
#71=IFCAXIS2PLACEMENT2D(#70,#40);
#72=IFCRECTANGLEPROFILEDEF(.AREA.,'Plate',#71,2.,0.1);
#73=IFCEXTRUDEDAREASOLID(#72,#13,#11,3.);
#74=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#73));
#75=IFCPRODUCTDEFINITIONSHAPE($,$,(#74));
#76=IFCLOCALPLACEMENT(#62,#13);
#77=IFCPLATE('3cwPartsPlate000000001',$,'Glass panel',$,$,#76,#75,$,.CURTAIN_PANEL.);
#80=IFCCARTESIANPOINT((2.,0.,0.));
#81=IFCAXIS2PLACEMENT3D(#80,#11,#12);
#82=IFCLOCALPLACEMENT(#62,#81);
#83=IFCCARTESIANPOINT((0.45,0.05));
#84=IFCAXIS2PLACEMENT2D(#83,#40);
#85=IFCRECTANGLEPROFILEDEF(.AREA.,'Door',#84,0.9,0.1);
#86=IFCEXTRUDEDAREASOLID(#85,#13,#11,2.1);
#87=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#86));
#88=IFCPRODUCTDEFINITIONSHAPE($,$,(#87));
#89=IFCDOOR('3cwPartsDoor0000000001',$,'Curtain wall door',$,$,#82,#88,$,2.1,0.9,.DOOR.,.SINGLE_SWING_LEFT.,$);
#90=IFCRELAGGREGATES('3cwPartsAggCurtain0001',$,$,$,#63,(#77,#89));
#91=IFCRELCONTAINEDINSPATIALSTRUCTURE('3cwPartsContainL000001',$,$,$,(#48,#57,#63),#32);
ENDSEC;
END-ISO-10303-21;
`;

describe('storeyElementIds (#586)', () => {
  // Storey 1 contains a wall (10) and a curtain wall (20) whose part is a door (21); its space (30) and storey 2's wall (40) are mapped too.
  const types = new Map<number, IfcTypeEnum>([[10, IfcTypeEnum.IfcWall], [20, IfcTypeEnum.IfcCurtainWall], [21, IfcTypeEnum.IfcDoor], [30, IfcTypeEnum.IfcSpace], [40, IfcTypeEnum.IfcWall]]);
  const hierarchy = {
    byStorey: new Map([[1, [10, 20]], [2, [40]]]),
    elementToStorey: new Map([[10, 1], [20, 1], [21, 1], [30, 1], [40, 2]]),
  };
  const typeOf = (id: number): IfcTypeEnum => types.get(id)!;

  it('takes what the storeys contain, then the parts aggregated under it, once each', () => {
    expect(storeyElementIds(hierarchy, [1], typeOf)).toEqual([10, 20, 21]);
    expect(storeyElementIds(hierarchy, [1, 2], typeOf)).toEqual([10, 20, 40, 21]);
  });

  it('leaves the storey\'s spaces out, as they always were', () => {
    expect(storeyElementIds(hierarchy, [1], typeOf)).not.toContain(30);
  });
});

const DOOR = 89;
const PLATE = 77;

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the curtain wall parts test: ${missing}`);

const shownIds = (d: Drawing2D): Set<number> => new Set([...d.cutPolygons, ...d.lines].map((e) => e.entityId));

describe.skipIf(missing !== null)('the parts of a curtain wall are on its storey plan (#586)', () => {
  let model: OpenedModel;
  let plan: Drawing2D;

  beforeAll(async () => {
    model = await openModel(new TextEncoder().encode(IFC));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === 'Level 0')!;
    plan = (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent)).get(view.id)!;
  }, 120_000);

  it('the hierarchy has the parts on the storey only through the curtain wall', () => {
    const h = model.dataStore.spatialHierarchy!;
    const storey = [...h.byStorey.keys()][0];
    expect(h.byStorey.get(storey)).not.toContain(DOOR);
    expect(h.elementToStorey.get(DOOR)).toBe(storey);
    expect(h.elementToStorey.get(PLATE)).toBe(storey);
  });

  it('the drawings are cut from the parts too', () => {
    const ids = new Set(model.buildingMeshes.map((m) => m.expressId));
    expect(ids.has(DOOR)).toBe(true);
    expect(ids.has(PLATE)).toBe(true);
  });

  it('the plan cuts the curtain wall door and panel', () => {
    const shown = shownIds(plan);
    expect(shown.has(DOOR)).toBe(true);
    expect(shown.has(PLATE)).toBe(true);
    expect(plan.cutPolygons.some((p) => p.entityId === DOOR && p.ifcType === 'IfcDoor')).toBe(true);
  });
});
