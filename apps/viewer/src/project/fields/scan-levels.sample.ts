/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `scanLevels` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  scanLevels: [{ id: 'level-0', name: 'Parter', elevation: -0.35 }, { id: 'level-1', name: 'Etaj 1', elevation: 2.95 }],
} satisfies Required<Pick<ProjectDocument, 'scanLevels'>>;
