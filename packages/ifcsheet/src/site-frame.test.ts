/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What the engine reads of a model's frame (#479): a map conversion gives a point its Easting and Northing, none leaves local X and Y. */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { IfcParser } from '@ifc-lite/parser';
import { describe, expect, it } from 'vitest';
import { worldToDrawing } from './drawing-frame.js';
import { liveSymbolContext, siteFrameOf, COORDINATE_LABELS } from './site-frame.js';

const E0 = 588_123.45, N0 = 326_456.78, ROTATION = (12 * Math.PI) / 180;
const f = (v: number) => v.toFixed(12);

/** A project with a metre map conversion into Stereo 70 turned 12 degrees, or none. */
function step(withMap: boolean): string {
  const map = withMap ? `#31=IFCPROJECTEDCRS('EPSG:3844','Stereo 70',$,$,$,$,#30);
#32=IFCMAPCONVERSION(#20,#31,${f(E0)},${f(N0)},85.5,${f(Math.cos(ROTATION))},${f(Math.sin(ROTATION))},1.);` : '';
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('site.ifc','2026-10-30T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0Site000000000000000a1',$,'Site',$,$,$,$,(#20),#5);
#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#2));
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#11,$);
#30=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
${map}
ENDSEC;
END-ISO-10303-21;
`;
}

const open = async (withMap: boolean, coordinateInfo?: object) => ({
  dataStore: await new IfcParser().parseColumnar(new TextEncoder().encode(step(withMap)).buffer as ArrayBuffer, { disableWorkerScan: true }),
  coordinateInfo: coordinateInfo as never,
});

const PLAN: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };

describe('the frame of an opened model', () => {
  it('a map conversion gives a drawing point the Easting and Northing of its IFC (x, y), the render frame\'s shift taken back', async () => {
    const shift = { originShift: { x: 5, y: 0, z: -3 }, wasmRtcOffset: { x: 100, y: 200, z: 0 }, shiftedBounds: { min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 5, z: 10 } } };
    const frame = siteFrameOf(await open(true, shift));
    expect(frame.mapPoint).toBeDefined();
    // The IFC project point (x, y), as the drawing generator cuts it: viewer (x - shift.x, z = -y - shift.z).
    const [x, y] = [12.5, -7.25];
    const offset = frame.frameOffset;
    const p = worldToDrawing(PLAN, { x: x - offset.x, y: 1.2, z: -y - offset.z });
    const got = frame.mapPoint!(PLAN, p);
    // The map conversion is anchored at the IFC origin: E = E0 + x cos t - y sin t, N = N0 + x sin t + y cos t.
    expect(got.e).toBeCloseTo(E0 + x * Math.cos(ROTATION) - y * Math.sin(ROTATION), 2);
    expect(got.n).toBeCloseTo(N0 + x * Math.sin(ROTATION) + y * Math.cos(ROTATION), 2);
  });

  it('a coordinate point on it is labelled E and N; with no map conversion, the local X and Y', async () => {
    const mapped = siteFrameOf(await open(true));
    const local = siteFrameOf(await open(false));
    expect(local.mapPoint).toBeUndefined();
    const at = { x: 3, y: 4 };
    expect(liveSymbolContext(mapped, PLAN, 'down', 100, 'en', COORDINATE_LABELS).coordinates!(at).map((l) => l[0])).toEqual(['E', 'N']);
    expect(liveSymbolContext(local, PLAN, 'down', 100, 'en', COORDINATE_LABELS).coordinates!(at).join('|')).toMatch(/\(local\)/);
  });
});
