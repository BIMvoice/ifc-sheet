/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectDocument } from '../types';

/** A value of `dxfUnderlays` that is not its default: the round trip test (`../project-roundtrip.test.ts`) puts every field's sample in one project. */
export const sample = {
  dxfUnderlays: [{
    id: 'dxf-underlay-1', viewId: 'view-1', name: 'survey.dxf',
    layers: [
      { name: 'WALLS', colour: '#ff0000', visible: true, runs: [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: -3 }]] },
      { name: 'FURNITURE', colour: '#00aa00', visible: false, runs: [[{ x: 1, y: -1 }, { x: 2, y: -1 }]] },
    ],
    at: { x: 1.5, y: -2 }, scale: 0.5, rotation: 0.1, opacity: 0.4, locked: true, printOnSheets: ['sheet-1'],
  }],
} satisfies Required<Pick<ProjectDocument, 'dxfUnderlays'>>;
