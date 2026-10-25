/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { sheetLevel, sheetNumber } from './sheet-number.js';
import { decimalMarkOf, lengthUnitOf, readUnitsAndNumbers, sheetFormat } from './units-and-numbers.js';
import { readProjectFile } from './project-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

describe('the project\'s units and numbers (#88)', () => {
  it('sets nothing: the plain language comes back, so every figure is as it was', () => {
    expect(sheetFormat('en', undefined)).toBe('en');
    expect(sheetFormat('ro', {})).toBe('ro');
    expect(sheetFormat('ro', { decimals: {} })).toBe('ro');
    expect(sheetNumber(sheetFormat('en', undefined), 1234.5)).toBe('1,234.50');
  });

  it('a comma separator writes the comma in an English project, and a point in a Romanian one', () => {
    const comma = sheetFormat('en', { separator: 'comma' });
    expect(sheetNumber(comma, 120)).toBe('120,00');
    expect(sheetNumber(comma, 1234.5)).toBe('1.234,50');
    expect(sheetLevel(comma, 2.7)).toBe('+2,70');
    expect(decimalMarkOf(comma)).toBe(',');
    const point = sheetFormat('ro', { separator: 'point' });
    expect(sheetNumber(point, 1234.5)).toBe('1,234.50');
    expect(decimalMarkOf(point)).toBe('.');
    // A separator the language already uses changes nothing.
    expect(sheetNumber(sheetFormat('ro', { separator: 'comma' }), 1234.5)).toBe('1.234,50');
  });

  it('decimals apply to the kind of figure that names them, and only that', () => {
    const f = sheetFormat('en', { decimals: { area: 1, volume: 3, level: 3 } });
    expect(sheetNumber(f, 12.3456, 2, { kind: 'area' })).toBe('12.3');
    expect(sheetNumber(f, 12.3456, 2, { kind: 'volume' })).toBe('12.346');
    expect(sheetNumber(f, 12.3456, 2, { kind: 'length' })).toBe('12.35');
    expect(sheetNumber(f, 12.3456)).toBe('12.35');
    expect(sheetLevel(f, 2.7)).toBe('+2.700');
    expect(sheetLevel(f, 0)).toBe('±0.000');
  });

  it('no grouping drops it from a quantity and leaves a dimension as it was', () => {
    const f = sheetFormat('ro', { group: false });
    expect(sheetNumber(f, 1234.5)).toBe('1234,50');
    expect(sheetNumber(f, 1234.5, 2, { group: false })).toBe('1234,50');
  });

  it('reads the length unit over a style\'s', () => {
    expect(lengthUnitOf(sheetFormat('en', { lengthUnit: 'cm' }), 'mm')).toBe('cm');
    expect(lengthUnitOf('en', 'mm')).toBe('mm');
  });

  it('drops what is not a setting', () => {
    expect(readUnitsAndNumbers({ lengthUnit: 'ft', decimals: { area: 9, volume: 2.5, level: 1, nope: 1 }, separator: 'semicolon', group: true })).toEqual({ decimals: { level: 1 } });
    expect(readUnitsAndNumbers('x')).toBeUndefined();
    expect(readUnitsAndNumbers({})).toBeUndefined();
  });

  it('the command line reads the same setting from the project file', () => {
    const file = JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', unitsAndNumbers: { separator: 'comma', lengthUnit: 'cm' } });
    expect(readProjectFile(file).unitsAndNumbers).toEqual({ separator: 'comma', lengthUnit: 'cm' });
    expect(readProjectFile(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P' })).unitsAndNumbers).toBeUndefined();
    const read = readProjectFile(file);
    expect(sheetNumber(sheetFormat('en', read.unitsAndNumbers), 3.5)).toBe('3,50');
  });
});
