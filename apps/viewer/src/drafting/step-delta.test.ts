/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffById, redoDelta, undoDelta } from './step-delta';

type T = { id: string; v: number };
const a: T = { id: 'a', v: 1 };
const b: T = { id: 'b', v: 2 };
const a2: T = { id: 'a', v: 9 };
const c: T = { id: 'c', v: 3 };

describe('step delta', () => {
  it('finds what a step added, removed and changed', () => {
    assert.deepEqual(diffById([a, b], [a2, c]), { added: [c], removed: [b], changed: [{ before: a, after: a2 }] });
  });
  it('undo takes back only the step, keeping later additions', () => {
    const d = diffById([a], [a2, b]);
    assert.deepEqual(undoDelta([a2, b, c], d), [a, c]);
    assert.deepEqual(redoDelta([a, c], d), [a2, c, b]);
  });
  it('leaves an item the person changed again after the step', () => {
    const d = diffById([a], [a2]);
    const later = { id: 'a', v: 5 };
    assert.deepEqual(undoDelta([later], d), [later]);
  });
});
