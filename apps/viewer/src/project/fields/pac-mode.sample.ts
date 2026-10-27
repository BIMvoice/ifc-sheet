/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `pacMode` that is not the default (the full permit project): the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  pacMode: 'rural',
} satisfies Required<Pick<ProjectDocument, 'pacMode'>>;
