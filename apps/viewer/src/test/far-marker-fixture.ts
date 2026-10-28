/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AC20-FZK-Haus with a survey cube added (#268): a proxy named like the
 * Skolebygg sample's "NUS - 0,0 - Kake", 0.6 x 0.8 x 1 m (small by the 13 m
 * house), contained in the ground storey and placed `west` metres from it.
 * The engine's own test builds the same model (`framing.models.test.ts`).
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FZK_HAUS } from './discipline-plan-fixture';

export const FAR_MARKER_NAME = 'NUS - 0,0 - Kake';
export const FAR_MARKER_GUID = '1cHGmPSXzFhOqVxhbE1HnR';

/** The path of a copy of the FZK-Haus with the marker `west` metres out, in a fresh temporary directory. */
export function fzkWithFarMarker(west: number): string {
  const source = readFileSync(FZK_HAUS, 'utf8');
  const rows = [
    `#900001= IFCCARTESIANPOINT((${-west}.,0.,0.));`,
    '#900002= IFCAXIS2PLACEMENT3D(#900001,$,$);',
    '#900003= IFCLOCALPLACEMENT(#477,#900002);',
    '#900004= IFCCARTESIANPOINT((0.3,0.4));',
    '#900005= IFCAXIS2PLACEMENT2D(#900004,$);',
    '#900006= IFCRECTANGLEPROFILEDEF(.AREA.,$,#900005,0.6,0.8);',
    '#900007= IFCEXTRUDEDAREASOLID(#900006,#900008,#900009,1.);',
    '#900008= IFCAXIS2PLACEMENT3D(#900010,$,$);',
    '#900009= IFCDIRECTION((0.,0.,1.));',
    '#900010= IFCCARTESIANPOINT((0.,0.,0.));',
    "#900011= IFCSHAPEREPRESENTATION(#118,'Body','SweptSolid',(#900007));",
    '#900012= IFCPRODUCTDEFINITIONSHAPE($,$,(#900011));',
    `#900013= IFCBUILDINGELEMENTPROXY('${FAR_MARKER_GUID}',#12,'${FAR_MARKER_NAME}',$,$,#900003,#900012,$,$);`,
    "#900014= IFCRELCONTAINEDINSPATIALSTRUCTURE('2cHGmPSXzFhOqVxhbE1HnR',#12,$,$,(#900013),#479);",
  ];
  const end = source.lastIndexOf('ENDSEC;');
  const path = join(mkdtempSync(join(tmpdir(), 'far-marker-')), 'fzk-with-marker.ifc');
  writeFileSync(path, `${source.slice(0, end)}${rows.join('\n')}\n${source.slice(end)}`);
  return path;
}
