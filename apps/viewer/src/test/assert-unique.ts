/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';

/** The values listed more than once, each once, in the order they first repeat. */
export function duplicatesOf(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated];
}

/**
 * Fails naming the repeats. A merge of two PRs that both append to a registry can keep both lines without a conflict
 * (a clean merge put the Germany pack into `standard-pack.ts` twice, #563), so each registry asserts this.
 */
export function assertUnique(registry: string, values: readonly string[]): void {
  assert.deepEqual(duplicatesOf(values), [], `${registry}: an id is listed more than once`);
}
