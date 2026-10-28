/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `userLevels` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  userLevels: [{ id: 'level-a', name: 'Mezzanine', elevation: 2.4 }, { id: 'level-b', name: 'Roof terrace', elevation: 6.35 }],
} satisfies Required<Pick<ProjectDocument, 'userLevels'>>;
