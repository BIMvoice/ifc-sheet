/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** Two typed joinery cells: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  joineryOverrides: [{ type: 'untyped:window:1000×1000', row: 'fire', value: 'EI 30', about: 'W1 Window' }, { type: '0KzM3XjQrPipQpI0RMGVb1', row: 'name', value: 'Attic round', about: 'W9 Attic round window' }],
} satisfies Required<Pick<ProjectDocument, 'joineryOverrides'>>;
