/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #863: two models of one building open together, each with its own storeys. A storey of each at one height is one
 * level, and the level is the same whichever model is read first: its name does not depend on the order.
 */

import { describe, expect, it } from 'vitest';
import { levelsFromStoreys, type StoreyInput } from './view-defaults.js';

const architecture: StoreyInput[] = [
  { name: 'Level 0', elevation: 0, globalId: 'arch-0' },
  { name: 'Level 1', elevation: 3.5, globalId: 'arch-1' },
  { name: 'Roof', elevation: 7, globalId: 'arch-2' },
];
const structure: StoreyInput[] = [
  { name: 'Floor 0', elevation: 0.004, globalId: 'str-0' },
  { name: 'Floor 1', elevation: 3.5, globalId: 'str-1' },
  { name: 'Foundation', elevation: -0.8, globalId: 'str-f' },
];

const named = (storeys: StoreyInput[]) => levelsFromStoreys(storeys).map((l) => ({ name: l.name, elevation: l.elevation, ids: [...l.storeyGlobalIds].sort() }));

describe('levels of two models (#863)', () => {
  it('makes one level of the storeys at one height', () => {
    expect(named([...architecture, ...structure]).map((l) => l.ids)).toEqual([['arch-2'], ['arch-1', 'str-1'], ['arch-0', 'str-0'], ['str-f']]);
  });

  it('names each level the same whichever model comes first', () => {
    expect(named([...structure, ...architecture])).toEqual(named([...architecture, ...structure]));
    expect(named([...architecture, ...structure]).map((l) => l.name)).toEqual(['Roof', 'Floor 1', 'Floor 0', 'Foundation']);
  });
});
