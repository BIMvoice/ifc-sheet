/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The rooms' totals sum through `SumTally`, the one rule for a quantity that may be missing (#432). */

import { describe, expect, it, vi } from 'vitest';

const tallied: unknown[] = [];
vi.mock('@ifc-lite/lists', async (importOriginal) => {
  const real = await importOriginal<typeof import('@ifc-lite/lists')>();
  return { ...real, tallyValue: (tally: Parameters<typeof real.tallyValue>[0], value: unknown) => { tallied.push(value); real.tallyValue(tally, value); } };
});

const { roomSchedule } = await import('./room-schedule.js');
type Room = Parameters<typeof roomSchedule>[1][number];

const room = (number: string, level: number | null, area: number | null): Room => ({ number, name: `R${number}`, level, area, source: area === null ? null : 'quantity', perimeter: null }) as Room;
const levels = [{ name: 'Ground', elevation: 0 }, { name: 'First', elevation: 3 }, { name: 'Roof', elevation: 6 }];

describe('the totals of the room schedule', () => {
  it('read each room\'s area through SumTally', () => {
    tallied.length = 0;
    roomSchedule(levels, [room('1', 0, 10), room('2', 0, null)]);
    // Once for the level and once for the building: both go through the tally.
    expect(tallied).toEqual([10, null, 10, null]);
  });

  it('leave a room without area out of a sum, make an all-missing level missing, and keep a declared 0', () => {
    const schedule = roomSchedule(levels, [
      room('1', 0, 10), room('2', 0, null), room('3', 0, 2.5),
      room('4', 1, null), room('5', 1, null),
      room('6', 2, 0),
      room('7', null, Number.NaN),
    ]);
    const total = (name: string) => schedule.levels.find((l) => l.name === name)?.total;
    expect(total('Ground')).toBe(12.5);
    expect(total('First')).toBeNull();
    expect(total('Roof')).toBe(0);
    expect(total('')).toBeNull();
    expect(schedule.total).toBe(12.5);
    expect(schedule.withoutArea).toBe(3);
  });

  it('is missing for a building where no room states an area', () => {
    expect(roomSchedule(levels, [room('1', 0, null)]).total).toBeNull();
  });
});
