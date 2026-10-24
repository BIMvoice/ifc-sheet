/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { sheetLevel, sheetNumber } from './sheet-number.js';
import * as names from './names.js';

describe('the sheet number formatter (#269)', () => {
  it('writes the decimal the language writes it', () => {
    expect(sheetNumber('ro', 120)).toBe('120,00');
    expect(sheetNumber('en', 120)).toBe('120.00');
    expect(sheetNumber('ro', 0.4, 2)).toBe('0,40');
    expect(sheetNumber('ro', 12.3456, 1)).toBe('12,3');
  });

  it('groups thousands as the site balance does, and not where asked not to', () => {
    expect(sheetNumber('ro', 1234.5)).toBe('1.234,50');
    expect(sheetNumber('en', 1234.5)).toBe('1,234.50');
    expect(sheetNumber('ro', 1234.5, 2, { group: false })).toBe('1234,50');
    expect(sheetNumber('en', 1234.5, 2, { group: false })).toBe('1234.50');
  });

  it('trims trailing zeros when asked (a scale bar)', () => {
    expect(sheetNumber('ro', 2.5, 2, { trim: true })).toBe('2,5');
    expect(sheetNumber('en', 5, 2, { trim: true })).toBe('5');
  });

  it('never prints a negative zero', () => {
    expect(sheetNumber('ro', -0.001)).toBe('0,00');
    expect(sheetNumber('en', -0.001)).toBe('0.00');
  });

  it('writes a level with its sign, ±0 at zero whichever way the value fell', () => {
    expect(sheetLevel('ro', 2.7)).toBe('+2,70');
    expect(sheetLevel('en', 2.7)).toBe('+2.70');
    expect(sheetLevel('ro', -1.5)).toBe('-1,50');
    expect(sheetLevel('ro', -1.5, { minus: '−' })).toBe('−1,50');
    expect(sheetLevel('ro', 0)).toBe('±0,00');
    expect(sheetLevel('ro', -0.004)).toBe('±0,00');
    expect(sheetLevel('en', 0.004)).toBe('±0.00');
    expect(sheetLevel('en', 0.006)).toBe('+0.01');
  });

  it('falls back to English for a locale that is not one', () => {
    expect(sheetNumber('not a locale', 1.5)).toBe('1.50');
    expect(sheetNumber('', 1.5)).toBe('1.50');
  });

  it('is the same function the names entry gives the web app', () => {
    expect(names.sheetNumber).toBe(sheetNumber);
    expect(names.sheetLevel).toBe(sheetLevel);
  });
});
