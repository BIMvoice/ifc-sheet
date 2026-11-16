/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A preset with one group: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  labelPresets: [{ id: 'lp-1', name: 'Precast walls', groups: [{ labelType: 'Wall mark', filters: [{ by: 'class', value: 'IfcWall' }, { by: 'property', set: 'Pset_Precast', name: 'Mark', value: 'P1' }] }] }],
} satisfies Required<Pick<ProjectDocument, 'labelPresets'>>;
