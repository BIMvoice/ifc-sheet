/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #487: an IFC exported from Bonsai carries each drawing as an `IfcAnnotation`
 * with `ObjectType` `DRAWING`, an `EPset_Drawing` property set and the camera's
 * extent as a box body (Bonsai's `drawing/operator.py` selects drawings with
 * `e.ObjectType == "DRAWING"`, `drawing/prop.py` reads `EPset_Drawing`). The
 * extent used to mesh and cut as a large grey block over the plan. Every other
 * `IfcAnnotation` (a grid line, a text box) must still draw.
 *
 * The drawing never meshes, so the model, the plan, the sheet and the
 * streaming loader the app draws its screen from all agree: the set is
 * identical to the same model without the drawing.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GeometryProcessor, type MeshData } from '@ifc-lite/geometry';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, sheetGraphics } from './headless.js';
import { levelsFromStoreys } from './view-defaults.js';
import type { PlanProjectView } from './document.js';

const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm`' : null;
if (missing) console.warn(`[ifcsheet] skipping the Bonsai drawing annotation test: ${missing}`);

const WALL = 107;
const TEXT_BOX = 117;
const DRAWING = 127;

/** A solid `w` x `d` x `h` m box at (`x`, `y`) on the storey as `#<id>`..`#<id+6>`: the placement is `#<id+2>` and the shape `#<id+6>`. */
function box(id: number, x: number, y: number, w: number, d: number, h: number): string[] {
  const n = (i: number): string => `#${id + i}`;
  const r = (v: number): string => (Number.isInteger(v) ? `${v}.` : String(v));
  return [
    `${n(0)}=IFCCARTESIANPOINT((${r(x)},${r(y)},0.))`, `${n(1)}=IFCAXIS2PLACEMENT3D(${n(0)},$,$)`, `${n(2)}=IFCLOCALPLACEMENT(#34,${n(1)})`,
    `${n(3)}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#42,${r(w)},${r(d)})`, `${n(4)}=IFCEXTRUDEDAREASOLID(${n(3)},#9,#7,${r(h)})`,
    `${n(5)}=IFCSHAPEREPRESENTATION(#11,'Body','SweptSolid',(${n(4)}))`, `${n(6)}=IFCPRODUCTDEFINITIONSHAPE($,$,(${n(5)}))`,
  ];
}

/**
 * A metre model: a 5 m wall, a text-box `IfcAnnotation` (ObjectType 'TEXT')
 * and, with `drawing`, a Bonsai drawing: an `IfcAnnotation` with ObjectType
 * 'DRAWING', an `EPset_Drawing` and a 30 m box as its camera body. All of
 * them sit on the storey.
 */
function ifc(drawing: boolean): Uint8Array {
  const contained = [`#${WALL}`, `#${TEXT_BOX}`, ...(drawing ? [`#${DRAWING}`] : [])].join(',');
  const lines = [
    'ISO-10303-21;\nHEADER', "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1')", "FILE_NAME('bonsai.ifc','2026-10-27T00:00:00',(''),(''),'','','')", "FILE_SCHEMA(('IFC4'))", 'ENDSEC;\nDATA',
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Bonsai',$,$,$,$,(#10),#20)",
    '#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)', '#3=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)', '#4=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)', '#5=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)',
    '#20=IFCUNITASSIGNMENT((#2,#3,#4,#5))',
    '#6=IFCCARTESIANPOINT((0.,0.,0.))', '#7=IFCDIRECTION((0.,0.,1.))', '#8=IFCDIRECTION((1.,0.,0.))', '#9=IFCAXIS2PLACEMENT3D(#6,#7,#8)',
    "#10=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#9,$)", "#11=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#10,$,.MODEL_VIEW.,$)",
    '#30=IFCLOCALPLACEMENT($,#9)', "#31=IFCSITE('1YvctVUKr0kugbFTf53O9L',$,'Site',$,$,#30,$,$,.ELEMENT.,$,$,$,$,$)",
    '#32=IFCLOCALPLACEMENT(#30,#9)', "#33=IFCBUILDING('2YvctVUKr0kugbFTf53O9L',$,'Building',$,$,#32,$,$,.ELEMENT.,$,$,$)",
    '#34=IFCLOCALPLACEMENT(#32,#9)', "#35=IFCBUILDINGSTOREY('3YvctVUKr0kugbFTf53O9L',$,'Level 0',$,$,#34,$,$,.ELEMENT.,0.)",
    "#36=IFCRELAGGREGATES('4YvctVUKr0kugbFTf53O9L',$,$,$,#1,(#31))", "#37=IFCRELAGGREGATES('5YvctVUKr0kugbFTf53O9L',$,$,$,#31,(#33))", "#38=IFCRELAGGREGATES('6YvctVUKr0kugbFTf53O9L',$,$,$,#33,(#35))",
    '#41=IFCCARTESIANPOINT((0.,0.))', '#42=IFCAXIS2PLACEMENT2D(#41,$)',
    ...box(100, 2.5, 0.15, 5, 0.3, 3), `#${WALL}=IFCWALL('7YvctVUKr0kugbFTf53O9L',$,'Wall',$,$,#102,#106,$,.STANDARD.)`,
    ...box(110, 6, 1, 0.5, 0.5, 2), `#${TEXT_BOX}=IFCANNOTATION('8YvctVUKr0kugbFTf53O9L',$,'Text',$,'TEXT',#112,#116)`,
    ...(drawing ? [
      ...box(120, 2.5, 0.15, 30, 30, 2), `#${DRAWING}=IFCANNOTATION('9YvctVUKr0kugbFTf53O9L',$,'PLAN_VIEW',$,'DRAWING',#122,#126)`,
      "#130=IFCPROPERTYSINGLEVALUE('TargetView',$,IFCLABEL('PLAN_VIEW'),$)", "#131=IFCPROPERTYSET('AYvctVUKr0kugbFTf53O9L',$,'EPset_Drawing',$,(#130))",
      `#132=IFCRELDEFINESBYPROPERTIES('BYvctVUKr0kugbFTf53O9L',$,$,$,(#${DRAWING}),#131)`,
    ] : []),
    `#140=IFCRELCONTAINEDINSPATIALSTRUCTURE('CYvctVUKr0kugbFTf53O9L',$,$,$,(${contained}),#35)`,
    'ENDSEC;\nEND-ISO-10303-21',
  ];
  return new TextEncoder().encode(lines.join(';\n') + ';\n');
}

const plan = (level: PlanProjectView['level'], cutHeight: number): PlanProjectView => ({ id: 'plan', kind: 'plan', name: level.name, createdAt: 0, level, cutHeight, viewDepth: 0 });

describe.skipIf(missing !== null)('a Bonsai drawing annotation is never drawn (#487)', () => {
  it('meshes the wall and the other annotation and nothing of the drawing', async () => {
    const model = await openModel(ifc(true));
    const ids = new Set(model.meshes.map((m) => m.expressId));
    expect(ids.has(WALL)).toBe(true);
    expect(ids.has(TEXT_BOX)).toBe(true);
    expect(ids.has(DRAWING)).toBe(false);
  }, 120_000);

  it('cuts the plan from the wall and the text box with no block from the drawing', async () => {
    const model = await openModel(ifc(true));
    const levels = levelsFromStoreys(model.storeys);
    const drawings = await generateViewDrawings([plan(levels[0], 1.2)], model.buildingMeshes, levels, model.extent!);
    const d = drawings.get('plan')!;
    const cutBy = new Set(d.cutPolygons.map((p) => p.entityId));
    expect(cutBy.has(WALL)).toBe(true);
    expect(cutBy.has(TEXT_BOX)).toBe(true);
    expect(cutBy.has(DRAWING)).toBe(false);
    expect(d.lines.some((l) => l.entityId === DRAWING)).toBe(false);
    // The extent is the wall and the text box (about 6.5 m), not the 30 m camera box.
    expect(model.extent!.max.x - model.extent!.min.x).toBeLessThan(10);
  }, 120_000);

  it('lays out the same sheets as the model without the drawing', async () => {
    const [withDrawing, without] = await Promise.all([openModel(ifc(true)), openModel(ifc(false))]);
    const sheets = async (m: typeof withDrawing) => JSON.stringify(await sheetGraphics(generateDefaultSet(m)!, m)).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'uuid');
    const [a, b] = [await sheets(withDrawing), await sheets(without)];
    expect(a.length).toBeGreaterThan(1000); // real line work, not two empty sheets
    expect(a).toBe(b);
  }, 240_000);

  it('streams the same meshes the app draws its screen from', async () => {
    const processor = new GeometryProcessor();
    await processor.init();
    const seen: MeshData[] = [];
    try {
      for await (const ev of processor.processStreaming(ifc(true))) if (ev.type === 'batch') seen.push(...ev.meshes);
    } finally {
      processor.dispose();
    }
    const ids = new Set(seen.map((m) => m.expressId));
    expect(ids.has(WALL)).toBe(true);
    expect(ids.has(DRAWING)).toBe(false);
  }, 120_000);
});
