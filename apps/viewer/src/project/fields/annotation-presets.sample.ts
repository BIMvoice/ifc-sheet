/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A preset that is not the default switches: door tags and room names, no dimensions: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  annotationPresets: [{ id: 'preset-1', name: 'Doors and rooms', on: { tagall: true, dimall: false, levelall: false }, tagParts: { doors: true, windows: false, rooms: true } }],
} satisfies Required<Pick<ProjectDocument, 'annotationPresets'>>;
