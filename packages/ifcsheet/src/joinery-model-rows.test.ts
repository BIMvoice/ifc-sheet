/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { MAX_MODEL_ROWS, modelRowId, modelRowLabel, modelRowText, modelRowsOf, readModelRows } from './joinery-model-rows.js';
import { readJoineryOverrides } from './joinery-overrides.js';
import { orderedRows, readScheduleContent } from './schedule-content.js';

const U = { id: modelRowId('property', 'Pset_WindowCommon', 'ThermalTransmittance'), source: 'property' as const, psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' };
const occ = (v?: string) => ({ modelValues: v === undefined ? undefined : { [U.id]: v } });

describe('model rows of a joinery schedule (#446)', () => {
  it('names a row by the list\'s column key', () => expect(U.id).toBe('property:Pset_WindowCommon:ThermalTransmittance'));

  it('reads what was saved, drops what is damaged and a repeat, and bounds the count', () => {
    const many = Array.from({ length: MAX_MODEL_ROWS + 5 }, (_, i) => ({ source: 'quantity', psetName: 'Q', propertyName: `N${i}` }));
    expect(readModelRows([U, { ...U, id: 'ignored' }, { source: 'attribute', psetName: 'x', propertyName: 'y' }, { source: 'property', psetName: '', propertyName: 'y' }, 7, null])).toEqual([U]);
    expect(readModelRows(many)).toHaveLength(MAX_MODEL_ROWS);
    expect(readModelRows([])).toBeUndefined();
    expect(readModelRows('x')).toBeUndefined();
  });

  it('is kept in the schedule\'s content and lists among its rows, after the built-in ones', () => {
    const content = readScheduleContent({ properties: [U], rows: { hidden: [U.id] } });
    expect(content?.properties).toEqual([U]);
    const rows = orderedRows(content, ['t1']);
    expect(rows.map((r) => r.id).slice(-2)).toEqual([U.id, 'text:t1']);
    expect(rows.find((r) => r.id === U.id)?.shown).toBe(false);
  });

  it('prints the shared value, a dash for none, and "varies" when the elements differ or only some state it', () => {
    expect(modelRowText({ occurrences: [occ('1.4'), occ('1.4')] }, U.id)).toBe('1.4');
    expect(modelRowText({ occurrences: [occ('1.4'), occ('2.4')] }, U.id)).toBe('varies');
    expect(modelRowText({ occurrences: [occ('1.4'), occ()] }, U.id, 'diferă')).toBe('diferă');
    expect(modelRowText({ occurrences: [occ(), occ()] }, U.id)).toBe('—');
    expect(modelRowText({ occurrences: [] }, U.id)).toBe('—');
  });

  it('labels a row by its name, with the set where two rows share it', () => {
    const other = { ...U, id: modelRowId('property', 'Other', 'ThermalTransmittance'), psetName: 'Other' };
    expect(modelRowLabel(U, [U])).toBe('ThermalTransmittance');
    expect(modelRowLabel(U, [U, other])).toBe('Pset_WindowCommon.ThermalTransmittance');
  });

  it('collects the rows of several schedules once each', () => expect(modelRowsOf([{ properties: [U] }, undefined, { properties: [U] }])).toEqual([U]));

  it('lets a cell of a model row be typed over, and keeps it through a save even for a long set and property name', () => {
    const long = modelRowId('property', 'P'.repeat(120), 'N'.repeat(120));
    const read = readJoineryOverrides([{ type: 'T', row: U.id, value: '1.6', about: 'W2' }, { type: 'T', row: long, value: 'x', about: '' }, { type: 'T', row: 'name', value: 'n', about: '' }, { type: 'T', row: 'size', value: 'n', about: '' }, { type: 'T', row: 'nonsense', value: 'n', about: '' }]);
    expect(read?.map((o) => o.row)).toEqual([U.id, long, 'name', 'size']);
  });
});
