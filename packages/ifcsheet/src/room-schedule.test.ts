/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The room and area rule and the schedule built on it (#42), without a model. */

import { QuantityType, type QuantitySet } from '@ifc-lite/data';
import { describe, expect, it } from 'vitest';
import { ROOM_SCHEDULE_EN, roomSchedule, roomScheduleCsv, roomScheduleLines, roomScheduleText, type RoomRecord } from './room-schedule.js';
import { meshFootprintArea, pickArea, roomArea, spaceRole } from './room-areas.js';

const qto = (name: string, set: string, value: number, type: QuantityType = QuantityType.Area): QuantitySet => ({ name: set, quantities: [{ name, value, type }] }) as QuantitySet;

describe('which space is a room', () => {
  it('leaves out an external space, a GFA one and one that holds spaces; everything else counts', () => {
    expect(spaceRole('EXTERNAL', false)).toBe('external');
    expect(spaceRole('.EXTERNAL.', false)).toBe('external');
    expect(spaceRole('GFA', false)).toBe('gfa');
    expect(spaceRole('INTERNAL', true)).toBe('parent');
    for (const kind of ['', 'INTERNAL', 'NOTDEFINED', 'SPACE', 'PARKING', 'USERDEFINED']) expect(spaceRole(kind, false)).toBe('room');
  });
});

describe('a room\'s area', () => {
  it('takes NetFloorArea, else GrossFloorArea, the standard set first, scaled to square metres', () => {
    expect(pickArea([qto('NetFloorArea', 'BaseQuantities', 9), qto('NetFloorArea', 'Qto_SpaceBaseQuantities', 10)], 'Qto_SpaceBaseQuantities', ['NetFloorArea'], 1)).toBe(10);
    expect(roomArea([qto('GrossFloorArea', 'Qto_SpaceBaseQuantities', 12)], 1)).toEqual({ area: 12, source: 'quantity' });
    // Square millimetres to square metres.
    const mm = roomArea([qto('NetFloorArea', 'BaseQuantities', 10e6), qto('GrossFloorArea', 'BaseQuantities', 12e6)], 1e-6);
    expect(mm.source).toBe('quantity');
    expect(mm.area).toBeCloseTo(10, 9);
    // A length is not an area.
    expect(roomArea([qto('NetFloorArea', 'BaseQuantities', 10, QuantityType.Length)], 1)).toEqual({ area: null, source: null });
  });

  it('falls back on the footprint of the geometry only when the model states nothing, and says so', () => {
    expect(roomArea([qto('NetFloorArea', 'BaseQuantities', 10)], 1, () => 99)).toEqual({ area: 10, source: 'quantity' });
    expect(roomArea([], 1, () => 8)).toEqual({ area: 8, source: 'geometry' });
    expect(roomArea([qto('NetFloorArea', 'BaseQuantities', 0)], 1, () => 8)).toEqual({ area: 8, source: 'geometry' });
    expect(roomArea([], 1, () => null)).toEqual({ area: null, source: null });
    expect(roomArea([], 1)).toEqual({ area: null, source: null });
  });

  it('measures a box\'s footprint from its triangles: 4 x 2.5 m is 10 m², however tall', () => {
    // A closed box, x 0..4, z 0..2.5, y 0..3 (Y up).
    const p = [0, 0, 0, 4, 0, 0, 4, 0, 2.5, 0, 0, 2.5, 0, 3, 0, 4, 3, 0, 4, 3, 2.5, 0, 3, 2.5];
    const q = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
    expect(meshFootprintArea([{ positions: p, indices: q }])).toBeCloseTo(10, 9);
    expect(meshFootprintArea([])).toBe(0);
  });
});

const room = (id: string, number: string, name: string, level: number | null, area: number | null, source: RoomRecord['source'] = 'quantity'): RoomRecord => ({ id, number, name, level, area, source: area === null ? null : source });
const LEVELS = [{ name: 'Attic', elevation: 2.7 }, { name: 'Ground', elevation: 0 }];

describe('the room and area schedule', () => {
  const rooms = [room('a', '10', 'Gallery', 0, 70), room('b', '2', 'Bath', 1, 5), room('c', '1', 'Hall', 1, 7.5), room('d', '', 'Shed', null, 3), room('e', '3', 'Store', 1, null), room('f', '11', 'Loft', 0, 4, 'geometry')];
  const schedule = roomSchedule(LEVELS, rooms);

  it('orders the levels low to high, the rooms by number as a person counts (2 before 10), the rooms on no level last', () => {
    expect(schedule.levels.map((l) => l.name)).toEqual(['Ground', 'Attic', '']);
    expect(schedule.levels[0].rooms.map((r) => r.name)).toEqual(['Hall', 'Bath', 'Store']);
    expect(schedule.levels[1].rooms.map((r) => r.name)).toEqual(['Gallery', 'Loft']);
  });

  it('totals each level and the building over the areas that are known; a room with none is listed and not counted', () => {
    expect(schedule.levels.map((l) => l.total)).toEqual([12.5, 74, 3]);
    expect(schedule.total).toBe(89.5);
    expect(schedule.rooms).toBe(6);
    expect(schedule.withoutArea).toBe(1);
    expect(schedule.fromGeometry).toBe(1);
    expect(roomSchedule(LEVELS, []).total).toBeNull();
    expect(roomSchedule(LEVELS, [room('x', '', 'No area', 0, null)]).levels[0].total).toBeNull();
  });

  it('prints each level\'s rooms then its total, the building\'s last', () => {
    const lines = roomScheduleLines(schedule, ROOM_SCHEDULE_EN);
    expect(lines.map((l) => l.kind)).toEqual(['room', 'room', 'room', 'levelTotal', 'room', 'room', 'levelTotal', 'room', 'levelTotal', 'total']);
    expect(lines[3].name).toBe('Total Ground');
    expect(lines[lines.length - 1]).toMatchObject({ kind: 'total', area: 89.5, name: 'Total building (Au)' });
  });

  it('writes the text with the language\'s decimal separator and the Romanian headings', () => {
    expect(roomScheduleText(schedule, 'en')).toMatch(/Total building \(Au\)\s+89\.50/);
    const ro = roomScheduleText(schedule, 'ro');
    expect(ro).toContain('Arie utilă m²');
    expect(ro).toContain('Total clădire (Au)');
    expect(ro).toContain('89,50');
    expect(ro).toContain('Fără nivel');
  });

  it('writes CSV in plain numbers with where each area comes from, and guards model text against formulas', () => {
    const csv = roomScheduleCsv(roomSchedule(LEVELS, [room('a', '1', '=HYPERLINK("x")', 1, 7.5), room('b', '2', 'Loft, big', 1, 4, 'geometry')]));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('No.,Room,Level,Useful area m²,Source');
    expect(lines[1]).toBe('1,"\'=HYPERLINK(""x"")",Ground,7.5,model quantity');
    expect(lines[2]).toBe('2,"Loft, big",Ground,4,geometry');
    expect(lines[lines.length - 1]).toBe(',Total building (Au),,11.5,');
  });
});
