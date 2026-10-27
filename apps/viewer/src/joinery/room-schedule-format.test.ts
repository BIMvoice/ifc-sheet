/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room and area schedule writes its areas through the project's "Units and numbers" setting (#88), as every other
 * figure on a sheet does, not by the language alone.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roomSchedule, ROOM_SCHEDULE_EN, type RoomRecord } from '@bimvoice/ifcsheet';
import { sheetFormat } from '@bimvoice/ifcsheet/names';
import { roomScheduleCells, type RoomScheduleLabels } from '@bimvoice/ifcsheet';

const ROOM: RoomRecord = { id: 'a', number: '1', name: 'Flur', level: 0, area: 1234.5678, source: 'quantity', perimeter: 14.16 };
const SCHEDULE = roomSchedule([{ name: 'EG', elevation: 0 }], [ROOM]);
const labels = (locale: RoomScheduleLabels['locale']): RoomScheduleLabels => ({ ...ROOM_SCHEDULE_EN, locale, title: 'Rooms', notes: [] });
const areas = (locale: RoomScheduleLabels['locale']) => roomScheduleCells(SCHEDULE, labels(locale)).map((r) => r.cells[2]).filter(Boolean);

describe('the room schedule follows the project\'s units and numbers (#88)', () => {
  it('the language alone, as before', () => {
    assert.deepEqual(areas('en'), ['1,234.57', '1,234.57', '1,234.57']);
    assert.deepEqual(areas('ro'), ['1.234,57', '1.234,57', '1.234,57']);
  });
  it('the separator, the area decimals and the grouping the project sets', () => {
    assert.equal(areas(sheetFormat('en', { separator: 'comma' }))[0], '1.234,57');
    assert.equal(areas(sheetFormat('en', { decimals: { area: 1 } }))[0], '1,234.6');
    assert.equal(areas(sheetFormat('en', { group: false }))[0], '1234.57');
    assert.equal(areas(sheetFormat('ro', { separator: 'point', group: false, decimals: { area: 0 } }))[0], '1235');
  });
  it('a decimals setting for lengths leaves areas alone', () => {
    assert.equal(areas(sheetFormat('en', { decimals: { length: 4 } }))[0], '1,234.57');
  });
});
