/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `urbanSettings` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  urbanSettings: { terrainLevel: -0.6, zeroElevation: 245.2, cutExcluded: { Subsol: true, Demisol: false } },
} satisfies Required<Pick<ProjectDocument, 'urbanSettings'>>;
