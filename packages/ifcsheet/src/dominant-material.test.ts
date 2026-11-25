/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #850: an element of several materials cut in one piece is drawn by its dominant material. The rule, case by case; that the app and the
 * headless sheets hatch a real layered wall by it is `dominant-material.fixture.test.ts` and the viewer's `material-dominant.parity.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { dominantMaterialOf, pieceMaterialOf, soleMaterialOf, type MaterialMakeup } from './dominant-material.js';

const layers = (...l: [string | null, number, boolean?][]): MaterialMakeup => ({ kind: 'layers', layers: l.map(([name, thickness, ventilated]) => ({ name, thickness, ...(ventilated ? { ventilated } : {}) })) });

describe('the dominant material of an element of several materials (#850)', () => {
  it('a layer set: the thickest layer, wherever it lies', () => {
    expect(dominantMaterialOf(layers(['Plaster', 0.015], ['Brick', 0.24], ['Insulation', 0.12]))).toBe('Brick');
    expect(dominantMaterialOf(layers(['Plaster', 0.015], ['Insulation', 0.12], ['Brick', 0.24]))).toBe('Brick');
  });

  it('a layer set: of two equally thick layers, the first in file order', () => {
    expect(dominantMaterialOf(layers(['Plaster', 0.01], ['Brick', 0.2], ['Concrete', 0.2]))).toBe('Brick');
  });

  it('a layer set: an air gap or a layer with no material is never dominant, however thick', () => {
    expect(dominantMaterialOf(layers(['Brick', 0.115], ['Air', 0.3, true], ['Concrete', 0.2]))).toBe('Concrete');
    expect(dominantMaterialOf(layers(['Brick', 0.115], [null, 0.3], ['  ', 0.3]))).toBe('Brick');
    expect(dominantMaterialOf(layers(['Air', 0.05, true], [null, 0.1]))).toBeNull();
  });

  it('a constituent set: the greatest fraction when fractions are given, else the first', () => {
    const constituents = (...c: [string | null, number?][]): MaterialMakeup => ({ kind: 'constituents', constituents: c.map(([name, fraction]) => ({ name, ...(fraction !== undefined ? { fraction } : {}) })) });
    expect(dominantMaterialOf(constituents(['Timber', 0.2], ['Steel', 0.7], ['Glass', 0.1]))).toBe('Steel');
    expect(dominantMaterialOf(constituents(['Timber', 0.4], ['Steel', 0.4]))).toBe('Timber');
    expect(dominantMaterialOf(constituents(['Timber'], ['Steel']))).toBe('Timber');
    expect(dominantMaterialOf(constituents([null, 0.9], ['Steel', 0.1]))).toBe('Steel');
  });

  it('a material list: the first material', () => {
    expect(dominantMaterialOf({ kind: 'list', names: ['Concrete', 'Steel'] })).toBe('Concrete');
  });
});

describe('what an element cut in one piece is named by', () => {
  const brickWall = layers(['Plaster', 0.015], ['Brick', 0.24]);

  it('one material, by every naming but none: unchanged by the rule', () => {
    const one = layers(['Brick', 0.115], ['Brick', 0.115]);
    expect(soleMaterialOf(one)).toBe('Brick');
    expect(pieceMaterialOf(one, 'sole')).toBe('Brick');
    expect(pieceMaterialOf(one, 'dominant')).toBe('Brick');
    expect(pieceMaterialOf({ kind: 'material', name: 'Concrete' }, 'dominant')).toBe('Concrete');
    expect(pieceMaterialOf(one, 'none')).toBeNull();
  });

  it('several materials: none when only one material may name it, the dominant one when asked', () => {
    expect(soleMaterialOf(brickWall)).toBeNull();
    expect(pieceMaterialOf(brickWall, 'sole')).toBeNull();
    expect(pieceMaterialOf(brickWall, 'dominant')).toBe('Brick');
    expect(pieceMaterialOf(null, 'dominant')).toBeNull();
  });
});
