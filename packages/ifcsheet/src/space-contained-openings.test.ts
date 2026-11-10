/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557: a door or window contained in an IfcSpace is on the plan of the space's storey. ArchiCAD contains the roof windows of
 * schependomlaan in the room under them, so the hierarchy lists them under the space (`bySpace`) and on no storey of their own:
 * they were left out of the building, had no mesh in the set and no plan drew them.
 *
 * The fixture: Level 0 holds wall A (x 0..6, y 0..0.3, 3 m high) and an IfcSpace aggregated under the storey. The space contains
 * a window (x 1..2.2, 0.9 m to 2.1 m high) and a door (x 3..3.9, 2.1 m high), both through the wall, the cut passes at 1.2 m.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import type { PlanProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { planOpeningSymbols } from './plan-openings.js';
import { storeyElementIds } from './storey-elements.js';
import { resolveViewGraphics } from './view-templates.js';

const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition[DesignTransferView]'),'2;1');
FILE_NAME('space-contained-openings.ifc','2026-11-10T00:00:00',('IfcSheet'),('IfcSheet'),'hand-written','hand-written','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('3spProject000000000001',$,'Space contained',$,$,$,$,(#14),#9);
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
#30=IFCSITE('3spSite00000000000001',$,'Site',$,$,#22,$,$,.ELEMENT.,$,$,$,$,$);
#31=IFCBUILDING('3spBuilding0000000001',$,'Building',$,$,#23,$,$,.ELEMENT.,$,$,$);
#32=IFCBUILDINGSTOREY('3spLevel0000000000001',$,'Level 0',$,$,#24,$,$,.ELEMENT.,0.);
#34=IFCRELAGGREGATES('3spAggProject00000001',$,$,$,#1,(#30));
#35=IFCRELAGGREGATES('3spAggSite0000000001',$,$,$,#30,(#31));
#36=IFCRELAGGREGATES('3spAggBuilding00001',$,$,$,#31,(#32));
#40=IFCDIRECTION((1.,0.));
#41=IFCCARTESIANPOINT((3.,0.15));
#42=IFCAXIS2PLACEMENT2D(#41,#40);
#43=IFCRECTANGLEPROFILEDEF(.AREA.,'A',#42,6.,0.3);
#44=IFCEXTRUDEDAREASOLID(#43,#13,#11,3.);
#45=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#44));
#46=IFCPRODUCTDEFINITIONSHAPE($,$,(#45));
#47=IFCLOCALPLACEMENT(#24,#13);
#48=IFCWALL('3spWallA00000000000001',$,'Wall A',$,$,#47,#46,$,.STANDARD.);
#49=IFCSPACE('3spSpace0000000000001',$,'Room',$,$,#47,$,$,.ELEMENT.,.INTERNAL.,$);
#50=IFCRELAGGREGATES('3spAggStorey00000001',$,$,$,#32,(#49));
#60=IFCCARTESIANPOINT((1.,0.,0.9));
#61=IFCAXIS2PLACEMENT3D(#60,#11,#12);
#62=IFCLOCALPLACEMENT(#24,#61);
#63=IFCCARTESIANPOINT((0.6,0.15));
#64=IFCAXIS2PLACEMENT2D(#63,#40);
#65=IFCRECTANGLEPROFILEDEF(.AREA.,'Window',#64,1.2,0.1);
#66=IFCEXTRUDEDAREASOLID(#65,#13,#11,1.2);
#67=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#66));
#68=IFCPRODUCTDEFINITIONSHAPE($,$,(#67));
#69=IFCWINDOW('3spWindow000000000001',$,'Window',$,$,#62,#68,$,1.2,1.2,.WINDOW.,.SINGLE_PANEL.,$);
#70=IFCCARTESIANPOINT((3.,0.,0.));
#71=IFCAXIS2PLACEMENT3D(#70,#11,#12);
#72=IFCLOCALPLACEMENT(#24,#71);
#73=IFCCARTESIANPOINT((0.45,0.15));
#74=IFCAXIS2PLACEMENT2D(#73,#40);
#75=IFCRECTANGLEPROFILEDEF(.AREA.,'Door',#74,0.9,0.1);
#76=IFCEXTRUDEDAREASOLID(#75,#13,#11,2.1);
#77=IFCSHAPEREPRESENTATION(#15,'Body','SweptSolid',(#76));
#78=IFCPRODUCTDEFINITIONSHAPE($,$,(#77));
#79=IFCDOOR('3spDoor00000000000001',$,'Door',$,$,#72,#78,$,2.1,0.9,.DOOR.,.SINGLE_SWING_LEFT.,$);
#80=IFCRELCONTAINEDINSPATIALSTRUCTURE('3spContainL0000000001',$,$,$,(#48),#32);
#81=IFCRELCONTAINEDINSPATIALSTRUCTURE('3spContainSpace00001',$,$,$,(#69,#79),#49);
ENDSEC;
END-ISO-10303-21;
`;

describe('storeyElementIds takes what a space of the storey contains (#557)', () => {
  const types = new Map<number, IfcTypeEnum>([[10, IfcTypeEnum.IfcWall], [30, IfcTypeEnum.IfcSpace], [31, IfcTypeEnum.IfcWindow], [32, IfcTypeEnum.IfcSpace], [40, IfcTypeEnum.IfcWall]]);
  const hierarchy = {
    byStorey: new Map([[1, [10]], [2, [40]]]),
    bySpace: new Map([[30, [31]], [32, [30]]]),
    elementToStorey: new Map([[10, 1], [30, 1], [40, 2], [32, 2]]),
  };
  const typeOf = (id: number): IfcTypeEnum => types.get(id)!;

  it('lists the window of the space on the space\'s storey, once, and not on another', () => {
    expect(storeyElementIds(hierarchy, [1], typeOf)).toEqual([10, 31]);
    expect(storeyElementIds(hierarchy, [2], typeOf)).toEqual([40]);
  });
});

const WINDOW = 69;
const DOOR = 79;
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the space-contained openings test: ${missing}`);

describe.skipIf(missing !== null)('a window and a door contained in a space are on the storey plan (#557)', () => {
  let model: OpenedModel;
  let symbols: { id: number; kind: string }[];

  beforeAll(async () => {
    model = await openModel(new TextEncoder().encode(IFC));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === 'Level 0')!;
    const plan = (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent)).get(view.id)!;
    const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
    symbols = planOpeningSymbols(model.buildingMeshes, plan.config.plane, { live: { dataStore: model.dataStore, view: null }, project }, resolveViewGraphics(view, set.document.viewTemplates), view.level);
  }, 120_000);

  it('the hierarchy has them under the space and on no storey of their own', () => {
    const h = model.dataStore.spatialHierarchy!;
    expect(h.elementToStorey.has(WINDOW)).toBe(false);
    expect([...h.bySpace.values()].flat().sort((a, b) => a - b)).toEqual([WINDOW, DOOR]);
  });

  it('the building holds their meshes', () => {
    const ids = new Set(model.buildingMeshes.map((m) => m.expressId));
    expect(ids.has(WINDOW)).toBe(true);
    expect(ids.has(DOOR)).toBe(true);
  });

  it('the plan draws a symbol for each', () => {
    expect(symbols.map((s) => `${s.kind}:${s.id}`).sort()).toEqual([`door:${DOOR}`, `window:${WINDOW}`]);
  });
});
