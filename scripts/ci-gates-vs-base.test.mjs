// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLines, normalise } from './ci-gates-vs-base.mjs';

const summary = (added, raised, lowered, deleted) =>
  `+ check-module-size: scripts/module-size-allowlist.txt vs merge-base origin/main (0123abc): +${added} added, ^${raised} raised, v${lowered} lowered, -${deleted} deleted`;

test('a head that only lowers or deletes budgets is not a new failure', () => {
  assert.deepEqual(newLines(normalise(summary(0, 0, 2, 0)), []), []);
  assert.deepEqual(newLines(normalise(summary(0, 0, 0, 3)), []), []);
});

test('a head that adds or raises a budget is', () => {
  assert.equal(newLines(normalise(summary(1, 0, 2, 0)), []).length, 1);
  assert.equal(newLines(normalise(summary(0, 1, 0, 0)), []).length, 1);
});

test('any other new line still counts, and lines the base printed do not', () => {
  assert.deepEqual(newLines(['a', 'b'], ['a']), ['b']);
});
