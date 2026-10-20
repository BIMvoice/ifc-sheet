/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A georeferenced project with nothing in it but its frame, for the site plan
 * tests: an IfcMapConversion into Stereo 70 (EPSG:3844, metres) rotated by
 * 12°, and a 'Model' context whose TrueNorth is 30° counter-clockwise from
 * project +Y (a 'Plan' context states another north, which must lose).
 */

import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';

export const SITE_FIXTURE = {
  eastings: 588_123.45,
  northings: 326_456.78,
  scale: 1,
  /** XAxisAbscissa / XAxisOrdinate: (cos 12°, sin 12°). */
  xAxisAbscissa: Math.cos((12 * Math.PI) / 180),
  xAxisOrdinate: Math.sin((12 * Math.PI) / 180),
  /** TrueNorth of the 'Model' context, degrees counter-clockwise from +Y. */
  trueNorthDeg: 30,
} as const;

const f = (v: number) => v.toFixed(12);

export function siteFixtureStep(schema: 'IFC4' | 'IFC2X3' = 'IFC4'): string {
  const n = (SITE_FIXTURE.trueNorthDeg * Math.PI) / 180;
  const georef = schema === 'IFC4'
    ? `#30=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#31=IFCPROJECTEDCRS('EPSG:3844','Stereo 70',$,$,$,$,#30);
#32=IFCMAPCONVERSION(#20,#31,${f(SITE_FIXTURE.eastings)},${f(SITE_FIXTURE.northings)},85.5,${f(SITE_FIXTURE.xAxisAbscissa)},${f(SITE_FIXTURE.xAxisOrdinate)},${f(SITE_FIXTURE.scale)});`
    : '';
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('site.ifc','2026-10-19T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
#1=IFCPROJECT('0Site000000000000000a1',$,'Site',$,$,$,$,(#20,#22),#5);
#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#2));
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCDIRECTION((${f(-Math.sin(n))},${f(Math.cos(n))}));
#13=IFCDIRECTION((1.,0.));
#22=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Plan',2,1.0E-5,#11,#13);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#11,#12);
${georef}
ENDSEC;
END-ISO-10303-21;
`;
}

export function parseSiteFixture(schema: 'IFC4' | 'IFC2X3' = 'IFC4'): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(siteFixtureStep(schema));
  return new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
}
