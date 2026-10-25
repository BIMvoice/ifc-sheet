/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `revisions` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  revisions: [{ id: 'rev-a', code: 'A', date: '2026-09-01', description: 'Prima emitere: ș ț ă', by: 'PC' }, { id: 'rev-b', code: 'B', date: '2026-10-12', description: 'Pereți noi', by: 'IC' }],
} satisfies Required<Pick<ProjectDocument, 'revisions'>>;
