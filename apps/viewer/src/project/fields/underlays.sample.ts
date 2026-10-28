/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `underlays` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  underlays: [{
    id: 'underlay-1', viewId: 'view-1', name: 'scan.pdf', kind: 'pdf', page: 2,
    href: 'data:image/png;base64,iVBORw0KGgo=', widthPx: 1200, heightPx: 800,
    at: { x: 1.5, y: -2 }, mPerPx: 0.0125, rotation: 0.1, opacity: 0.4, locked: true, printOnSheets: ['sheet-1'],
  }],
} satisfies Required<Pick<ProjectDocument, 'underlays'>>;
