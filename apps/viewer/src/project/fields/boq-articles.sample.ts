/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `boqArticles` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  // The bill of quantities' mapping table (#75), every field of an article set and every dimension of its filter. The codes are EXAMPLES, not a norm.
  boqArticles: [{
    id: 'boq1', code: 'EXAMPLE-ZID-01', description: 'EXEMPLU: zidărie, tip T240', unit: 'm3', typeName: 'T240', material: 'Beton', quantity: 'NetVolume', factor: 1.1, waste: 5,
    filter: { levels: ['Parter'], classes: ['IfcWall'], predefined: ['SOLIDWALL'], properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', op: 'equals', value: 'true' }] },
  }, { id: 'boq2', code: 'EXAMPLE-UȘI-01', description: 'EXEMPLU: uși', unit: 'buc', quantity: 'Count', factor: 1, filter: { classes: ['IfcDoor'] } }],
} satisfies Required<Pick<ProjectDocument, 'boqArticles'>>;
