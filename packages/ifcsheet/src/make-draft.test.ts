/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { makeDraft } from './make-draft.js';
import type { EntityShape } from './draft-types.js';

const line = { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } as unknown as EntityShape;

describe('makeDraft (#707)', () => {
  it('defaults the params to an empty record, not shared between calls', () => {
    const a = makeDraft(line, { id: 'a', viewId: 'v', layerId: 'L' });
    const b = makeDraft(line, { id: 'b', viewId: 'v', layerId: 'L' });
    expect(a.params).toEqual({});
    expect(a.params).not.toBe(b.params);
  });
});
