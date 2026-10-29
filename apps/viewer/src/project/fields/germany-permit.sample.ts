/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** Values of `germanyPermit` and `germanyLand` that are not their default (off, none): the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  germanyPermit: true,
  germanyLand: 'bw',
} satisfies Required<Pick<ProjectDocument, 'germanyPermit' | 'germanyLand'>>;
