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

test('a shrink that leaves new budget headroom is not a new failure (advisory notes)', () => {
  const base = normalise('note:  a/big.ts: 500 lines, budget 500 (0 lines of headroom); lower the budget');
  const head = normalise('note:  a/big.ts: 499 lines, budget 500 (1 lines of headroom); lower the budget to the measured count');
  assert.deepEqual(newLines(head, base), []);
  assert.deepEqual(newLines(head, []), [], 'a note is advisory even when the base printed none');
});

test('a file over its budget that shrinks, still over, is not a new failure', () => {
  const base = normalise('  apps/x/Panel.tsx: 2050 lines, budget 2048');
  assert.deepEqual(newLines(normalise('  apps/x/Panel.tsx: 2049 lines, budget 2048'), base), []);
  assert.deepEqual(newLines(normalise('  apps/x/Panel.tsx: 2050 lines, budget 2048'), base), []);
});

test('a file that grows further, or a new file over the limit, still fails', () => {
  const base = normalise('  apps/x/Panel.tsx: 2050 lines, budget 2048');
  assert.equal(newLines(normalise('  apps/x/Panel.tsx: 2051 lines, budget 2048'), base).length, 1);
  assert.equal(newLines(normalise('  apps/x/new-god-file.ts: 412 lines'), base).length, 1);
});
