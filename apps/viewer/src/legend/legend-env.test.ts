/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The app's placed colour legend lists what the paper shows (#493): a value whose only rooms the view hides is dropped, by the same
 * rule the headless legend applies (`shownRooms`, `sheet-graphic.ts`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ViewGraphics } from '@bimvoice/ifcsheet';
import type { SchemeResult } from '@bimvoice/ifcsheet/colour-fills';
import type { ProjectView } from '@/project/types';
import { legendColours } from './legend-env.js';

const view = { id: 'v1', name: 'Ground', kind: 'plan' } as ProjectView;
/** Two rooms: 1 is a kitchen, 2 a bath. */
const scheme: SchemeResult = {
  fills: [
    { entityId: 1, key: 'kitchen', colour: '#ff0000', polygon: { outer: [], holes: [] } },
    { entityId: 2, key: 'bath', colour: '#0000ff', polygon: { outer: [], holes: [] } },
  ] as unknown as SchemeResult['fills'],
  elementColours: new Map(),
  entries: [{ key: 'kitchen', label: 'Kitchen', colour: '#ff0000', count: 1 }, { key: 'bath', label: 'Bath', colour: '#0000ff', count: 1 }],
};
const globalIdOf = (id: number) => `room-${id}`;
const names = (graphics: ViewGraphics | undefined) => legendColours([view], () => scheme, () => graphics, globalIdOf).map((e) => e.name);

describe('the values a placed colour legend lists (#493)', () => {
  it('lists every value when the view hides no room', () => {
    assert.deepEqual(names(undefined), ['Kitchen', 'Bath']);
  });

  it('drops a value whose only room the view hides, as the headless legend does', () => {
    assert.deepEqual(names({ hiddenElements: ['room-2'] } as ViewGraphics), ['Kitchen']);
  });
});
