/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `comments` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  comments: [{
    id: 'comment-1', sheetId: 'sh1', x: 120.5, y: 80.25, viewportId: 'vp1', viewId: 'v-plan', point: { x: 3.5, y: -2 }, elementGuid: '2O2Fr$t4X7Zf8NOew3FLOH',
    author: 'Ana Ionescu', createdAt: 1760000000000, status: 'done', text: 'Cota lipsă la ușă', replies: [{ id: 'reply-1', author: 'PC', createdAt: 1760000001000, text: 'Adăugată', bcfGuid: '3f2b1c0e-7d4a-4e8b-9c1d-2a3b4c5d6e7f' }],
    // The BCF GUIDs it went out with, kept so the next export updates the same topic (PR #127).
    bcfGuid: '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d', bcfViewpointGuid: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  }],
} satisfies Required<Pick<ProjectDocument, 'comments'>>;
