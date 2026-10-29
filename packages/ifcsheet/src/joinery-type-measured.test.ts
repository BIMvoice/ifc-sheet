/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #448 with #485: a window whose IFC states no size keeps the size measured from its geometry, marked as measured, once its type is configured.
 * The configured entry holds the kind's default size (the model gave none), which the schedule must not print in place of the measurement.
 */

import { describe, expect, it } from 'vitest';
import { defaultWindowSpec } from '@ifc-lite/create';
import { openModel } from './headless.js';
import { joineryScheduleData } from './joinery-schedule.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { meshesByExpressId } from './element-size.js';

const mm = (m: number): number => Math.round(m * 1000);

/** A Bonsai-style IFC4 file: `windows` windows on the storey "Level 0", each a rectangle profile extruded; `stated` sizes the second one's Overall slots. */
function bonsaiIfc(windows: { stated?: [number, number] }[]): string {
  const rows = [
    `#1=IFCPROJECT('0Zr1xa$W9EkOxMp4Oi0001',$,'P',$,$,$,$,(#9),#8);`,
    `#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`,
    `#8=IFCUNITASSIGNMENT((#2));`,
    `#9=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#10,$);`,
    `#10=IFCAXIS2PLACEMENT3D(#11,$,$);`,
    `#11=IFCCARTESIANPOINT((0.,0.,0.));`,
    `#12=IFCLOCALPLACEMENT($,#10);`,
    `#13=IFCSITE('0Zr1xa$W9EkOxMp4Oi0002',$,'Site',$,$,#12,$,$,.ELEMENT.,$,$,$,$,$);`,
    `#14=IFCBUILDING('0Zr1xa$W9EkOxMp4Oi0003',$,'Building',$,$,#12,$,$,.ELEMENT.,$,$,$);`,
    `#15=IFCBUILDINGSTOREY('0Zr1xa$W9EkOxMp4Oi0004',$,'Level 0',$,$,#12,$,$,.ELEMENT.,0.);`,
    `#16=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0005',$,$,$,#1,(#13));`,
    `#17=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0006',$,$,$,#13,(#14));`,
    `#18=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0007',$,$,$,#14,(#15));`,
    // The shared body: a 1.2 x 0.1 rectangle, extruded 1.5 up.
    `#20=IFCCARTESIANPOINT((0.,0.));`,
    `#21=IFCAXIS2PLACEMENT2D(#20,$);`,
    `#22=IFCRECTANGLEPROFILEDEF(.AREA.,$,#21,1.2,0.1);`,
    `#23=IFCDIRECTION((0.,0.,1.));`,
    `#24=IFCEXTRUDEDAREASOLID(#22,#10,#23,1.5);`,
    `#25=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#24));`,
    `#26=IFCPRODUCTDEFINITIONSHAPE($,$,(#25));`,
  ];
  const ids: number[] = [];
  windows.forEach((w, i) => {
    const base = 100 + i * 10;
    const turn = i === 0 ? '0.8660254037844387,0.5' : '1.,0.';
    const stated = w.stated ? `${w.stated[1]},${w.stated[0]}` : '$,$';
    rows.push(
      `#${base}=IFCCARTESIANPOINT((${2 + i * 3}.,1.,0.));`,
      `#${base + 1}=IFCDIRECTION((${turn},0.));`,
      `#${base + 2}=IFCAXIS2PLACEMENT3D(#${base},$,#${base + 1});`,
      `#${base + 3}=IFCLOCALPLACEMENT(#12,#${base + 2});`,
      `#${base + 4}=IFCWINDOW('0Zr1xa$W9EkOxMp4Oi${String(10 + i).padStart(4, '0')}',$,'Window ${i + 1}',$,$,#${base + 3},#26,$,${stated},.WINDOW.,.NOTDEFINED.,$);`,
    );
    ids.push(base + 4);
  });
  rows.push(`#90=IFCRELCONTAINEDINSPATIALSTRUCTURE('0Zr1xa$W9EkOxMp4Oi0008',$,$,$,(${ids.map((i) => `#${i}`).join(',')}),#15);`);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME('bonsai.ifc','2026-10-27T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${rows.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

const GLOBAL_ID = '0Zr1xa$W9EkOxMp4Oi0010';
const configured = { ...defaultWindowSpec('Fenster'), id: 'type-T1' };
const mapped = { joineryTypes: [configured], joineryMapping: { ...DEFAULT_JOINERY_MAPPING, elements: { [GLOBAL_ID]: 'type-T1' } } };

async function rowsOf(windows: Parameters<typeof bonsaiIfc>[0], geometry = true) {
  const model = await openModel(new TextEncoder().encode(bonsaiIfc(windows)), geometry ? undefined : { geometry: false });
  return joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null, ...(geometry ? { meshesOf: meshesByExpressId(model.meshes) } : {}) }], mapped, 'window').entries;
}

describe('a configured type whose window states no size (#448, #485)', () => {
  it('prints the measured size, marked, not the entry\'s default 1200 x 1500 of the catalogue', async () => {
    const [row] = await rowsOf([{}]);
    expect(row.spec?.id).toBe('type-T1');
    expect(row.measuredWidth).toBe(true);
    expect(row.measuredHeight).toBe(true);
    expect(row.measured).toBe(true);
    expect(Math.abs(mm(row.width) - 1200)).toBeLessThanOrEqual(1);
    expect(Math.abs(mm(row.height) - 1500)).toBeLessThanOrEqual(1);
  });

  it('keeps the measurement when the entry\'s own size differs from the body', async () => {
    mapped.joineryTypes[0] = { ...configured, width: 0.9, height: 2.1 };
    try {
      const [row] = await rowsOf([{}]);
      expect([mm(row.width), mm(row.height)]).toEqual([1200, 1500]);
      expect(row.measured).toBe(true);
    } finally { mapped.joineryTypes[0] = configured; }
  });

  it('is not marked, and keeps the entry\'s size, when the IFC states the size or there is no geometry', async () => {
    const [stated] = await rowsOf([{ stated: [1.0, 1.4] }]);
    expect(stated.measured).toBeUndefined();
    const [bare] = await rowsOf([{}], false);
    expect(bare.measured).toBeUndefined();
    expect(bare.width).toBe(configured.width);
  });
});
