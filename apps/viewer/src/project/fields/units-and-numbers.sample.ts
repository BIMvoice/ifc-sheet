/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `unitsAndNumbers` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  unitsAndNumbers: { lengthUnit: 'cm', decimals: { length: 1, area: 3, volume: 3, level: 3 }, separator: 'comma', group: false },
} satisfies Required<Pick<ProjectDocument, 'unitsAndNumbers'>>;
