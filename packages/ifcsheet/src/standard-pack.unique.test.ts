/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { COMMAND_LINE_STANDARDS, builtInPacks } from './standard-pack.js';

// #563: a clean merge put the Germany pack into the built-in list twice.
const repeated = (values: readonly string[]): string[] => values.filter((v, i) => values.indexOf(v) !== i);

describe('the built-in standard packs', () => {
  const packs = builtInPacks((key) => key);

  it('lists each pack id once', () => {
    expect(repeated(packs.map((p) => p.id)), 'a pack id is listed more than once').toEqual([]);
  });

  it('gives each --standard name its own pack, and every one is a built-in', () => {
    const targets = Object.values(COMMAND_LINE_STANDARDS);
    expect(repeated(targets), 'two --standard names apply one pack').toEqual([]);
    expect(targets.filter((id) => !packs.some((p) => p.id === id))).toEqual([]);
  });
});
