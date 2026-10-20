/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet } from '@/project/types';
import { findSheets, fold } from './wall-find.js';

const sheet = (id: string, number: string, name: string, viewIds: string[] = []): ProjectSheet =>
  ({ id, number, name, viewports: viewIds.map((viewId, i) => ({ id: `${id}-${i}`, viewId, x: 0, y: 0, scale: 100 })) }) as unknown as ProjectSheet;

const VIEWS: Record<string, string> = { v1: 'Ground Floor Plan', v2: 'Secțiune A-A', v3: 'South elevation' };
const SHEETS = [
  sheet('s1', 'A-101', 'Floor plans', ['v1']),
  sheet('s2', 'A-201', 'Elevations', ['v3']),
  sheet('s3', 'A-301', 'Secțiuni', ['v2']),
  sheet('s4', 'A-302', 'Detalii', []),
];
const find = (q: string) => findSheets(q, SHEETS, (id) => VIEWS[id]);

describe('fold', () => {
  it('drops case and accents, including the Romanian comma-below letters', () => {
    assert.equal(fold('Secțiune Șarpantă ȚARĂ'), 'sectiune sarpanta tara');
    assert.equal(fold('Ş ţ'), 's t');
  });
});

describe('findSheets', () => {
  it('finds a sheet by its number, whole or partial, in any case', () => {
    assert.deepEqual(find('a-201').map((h) => h.sheetId), ['s2']);
    assert.deepEqual(find('A-30').map((h) => h.sheetId), ['s3', 's4']);
    assert.equal(find('A-201')[0].via, 'number');
  });

  it('finds a sheet by its name', () => {
    assert.deepEqual(find('elev').map((h) => [h.sheetId, h.via]), [['s2', 'name']]);
  });

  it('finds a sheet by the name of a drawing on it, and says which', () => {
    assert.deepEqual(find('ground'), [{ sheetId: 's1', via: 'view', viewName: 'Ground Floor Plan' }]);
  });

  it('ignores accents and case both ways: sectiune finds Secțiune', () => {
    assert.deepEqual(find('sectiune').map((h) => h.sheetId), ['s3'], 'the view and the sheet name are one sheet, once');
    assert.deepEqual(find('SECȚIUNE').map((h) => h.sheetId), ['s3']);
    assert.equal(find('secțiune a')[0].sheetId, 's3');
  });

  it('needs every word, spread across number, name and drawings', () => {
    assert.deepEqual(find('floor plans').map((h) => h.sheetId), ['s1']);
    assert.deepEqual(find('a-101 ground').map((h) => h.sheetId), ['s1']);
    assert.deepEqual(find('a-101 south'), []);
  });

  it('ranks number matches, then name, then drawing; the Wall order within each', () => {
    const sheets = [sheet('x', 'B-1', 'Roof', ['v1']), sheet('y', 'B-2', 'Floor', []), sheet('z', 'floor-3', 'Other', [])];
    assert.deepEqual(findSheets('floor', sheets, (id) => VIEWS[id]).map((h) => [h.sheetId, h.via]), [['z', 'number'], ['y', 'name'], ['x', 'view']]);
  });

  it('finds nothing for an empty or blank query, and for a miss', () => {
    assert.deepEqual(find(''), []);
    assert.deepEqual(find('   '), []);
    assert.deepEqual(find('zzz'), []);
  });
});
