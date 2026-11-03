/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #671: the cut patterns of masonry, concrete and earth follow drawing convention; a brick wall's cut is not the brick elevation. */

import { describe, expect, it } from 'vitest';
import { findPattern } from './hatch-library.js';
import { guessMaterial } from './materials.js';

describe('a cut brick wall (#671)', () => {
  it('guesses the masonry cut hatch (45 degree lines), not the running-bond elevation pattern', () => {
    for (const name of ['Brick', 'Masonry', 'Concrete block', 'Caramida plina', 'AAC']) {
      expect(guessMaterial(name).hatch, name).toBe('BRICKCUT');
    }
    const cut = findPattern('BRICKCUT');
    expect(cut?.families.map((f) => f.angleDeg)).toEqual([45]);
    expect(cut?.families[0].dashes).toEqual([]);
    // The elevation pattern stays, for a brick face.
    expect(findPattern('BRICK')?.families.map((f) => f.angleDeg)).toEqual([0, 90]);
  });

  it('draws earth as diagonal lines, with no horizontal or vertical strokes', () => {
    const angles = findPattern('EARTH')?.families.map((f) => f.angleDeg) ?? [];
    expect(angles.length).toBeGreaterThan(0);
    expect(angles.every((a) => a === 45)).toBe(true);
  });

  it('draws concrete with short dots (a visible dash, not a zero-length one) and triangles, not lines at odd angles', () => {
    const fams = findPattern('CONCRETE')?.families ?? [];
    expect(fams.some((f) => f.dashes.length === 2 && f.dashes[0] > 0 && f.dashes[0] < 0.5)).toBe(true);
    expect(new Set(fams.map((f) => f.angleDeg))).toEqual(new Set([0, 90, 135]));
  });
});
