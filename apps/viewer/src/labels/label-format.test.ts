/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatSpecText, formatValue, parseFormatSpec } from './label-format.js';

describe('parseFormatSpec', () => {
  it('reads decimals, grouping and unit', () => {
    assert.deepEqual(parseFormatSpec('0.00 m'), { decimals: 2, thousands: false, unit: 'm' });
    assert.deepEqual(parseFormatSpec('#,##0.0 m²'), { decimals: 1, thousands: true, unit: 'm²' });
    assert.deepEqual(parseFormatSpec('0'), { decimals: 0, thousands: false, unit: '' });
  });
  it('takes a text that is no pattern as the unit', () => {
    assert.deepEqual(parseFormatSpec('kg/m'), { decimals: null, thousands: false, unit: 'kg/m' });
    assert.deepEqual(parseFormatSpec(' mm'), { decimals: null, thousands: false, unit: 'mm' });
  });
  it('writes a spec back as it reads', () => {
    for (const text of ['0.00 m', '#,##0.0', '0', 'kg']) assert.equal(formatSpecText(parseFormatSpec(text)), text);
  });
});

describe('formatValue', () => {
  it('rounds to the pattern and appends the unit', () => {
    assert.equal(formatValue(12.3456, parseFormatSpec('0.00 m')), '12.35 m');
    assert.equal(formatValue(7, parseFormatSpec('0.0')), '7.0');
    assert.equal(formatValue(1234567.891, parseFormatSpec('#,##0.0')), '1,234,567.9');
    assert.equal(formatValue(-1234.5, parseFormatSpec('#,##0')), '-1,235');
  });
  it('does not show a negative zero', () => {
    assert.equal(formatValue(-0.001, parseFormatSpec('0.00')), '0.00');
  });
  it('keeps an unformatted number to three decimals', () => {
    assert.equal(formatValue(2.50000001), '2.5');
    assert.equal(formatValue(0.12345), '0.123');
  });
  it('formats a number written as text only when a pattern asks', () => {
    assert.equal(formatValue('12.5', parseFormatSpec('0.00')), '12.50');
    assert.equal(formatValue('12.5'), '12.5');
    assert.equal(formatValue('EI 60', parseFormatSpec('0.00')), 'EI 60');
  });
  it('writes booleans and lists', () => {
    assert.equal(formatValue(true), 'Yes');
    assert.equal(formatValue(false), 'No');
    assert.equal(formatValue([1, 2.5], parseFormatSpec('0.0 m')), '1.0, 2.5 m');
  });
  it('is null where there is nothing to show, so a unit never stands alone', () => {
    for (const v of [null, undefined, '', '  ', NaN, [], {}]) assert.equal(formatValue(v, parseFormatSpec('0.00 m')), null);
  });
  it('reads a typed value object', () => {
    assert.equal(formatValue({ type: 'IfcLabel', value: 'A' }), 'A');
  });
});
