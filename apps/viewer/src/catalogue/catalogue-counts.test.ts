/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE_KINDS, emptyCatalogue } from './catalogue-file.js';
import { kindCount, kindCounts } from './catalogue-counts.js';

describe('catalogue counts', () => {
  const c = {
    ...emptyCatalogue(),
    hatchPatterns: '*ONE, a\n0, 0,0, 0,2\n*TWO, b\n90, 0,0, 0,2\n',
    annotationTypes: [{ id: 'a', name: 'A', tool: 'tag' as const }],
    symbols: [],
  };

  it('counts a hatch file by its patterns, not its lines', () => {
    assert.equal(kindCount(c, 'hatchPatterns'), 2);
  });

  it('counts every kind, in the order the kinds are listed', () => {
    const counts = kindCounts(c);
    assert.equal(counts.length, CATALOGUE_KINDS.length);
    assert.deepEqual(Object.fromEntries(CATALOGUE_KINDS.map((k, i) => [k, counts[i]])), {
      layers: 0, textStyles: 0, dimStyles: 0, hatchPatterns: 2, materials: 0, annotationTypes: 1, symbols: 0, legends: 0, cadLayers: 0,
    });
  });
});
