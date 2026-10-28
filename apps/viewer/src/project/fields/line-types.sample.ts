/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A project's own line type: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  lineTypes: [{ id: 'lt-centre', name: 'Centre', dash: [6, 2, 0, 2] }],
} satisfies Required<Pick<ProjectDocument, 'lineTypes'>>;
