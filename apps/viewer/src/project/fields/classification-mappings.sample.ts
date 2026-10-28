/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `classificationMappings` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  // The classification mappings (#89): every field of a mapping and of a rule set. The codes are EXAMPLES, not a Uniclass or OmniClass table.
  classificationMappings: [{
    id: 'class1', system: { name: 'Uniclass', edition: '2015' },
    rules: [
      { by: 'type', match: 'T240', code: 'EXAMPLE-Ss_25', title: 'EXAMPLE: wall systems' },
      { by: 'material', match: 'Beton', code: 'EXAMPLE-Pr_20' },
      { by: 'class', match: 'IfcDoor', code: 'EXAMPLE-Ss_32', title: 'EXAMPLE: door systems' },
    ],
  }],
} satisfies Required<Pick<ProjectDocument, 'classificationMappings'>>;
