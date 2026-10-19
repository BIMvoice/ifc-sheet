/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room finishes on synthetic input (#77): the relation order and the
 * per-surface fallback, the PredefinedType mapping, areas from the Qto, a room
 * with no finishes, the lines and the CSV.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QuantityType, type QuantitySet } from '@ifc-lite/data';
import { coveringArea, finishLines, roomFinishes, surfaceOf, type CoveringInput, type RoomInput } from './room-finishes.js';
import { layoutRoomFinishes, roomFinishesCsv } from './room-finishes-layout.js';

const LABELS = { title: 'Room finishes', number: 'No.', room: 'Room', level: 'Level', floor: 'Floor', wall: 'Wall', ceiling: 'Ceiling', area: 'Area m²' };
const cov = (id: number, name: string, predefinedType: string, area: number | null = null): CoveringInput => ({ id, name, predefinedType, area });
const room = (over: Partial<RoomInput>): RoomInput => ({ number: '1', name: 'Room', level: 'L1', elevation: 0, covers: [], boundary: [], contained: [], properties: {}, ...over });
const qset = (name: string, quantities: [string, number, QuantityType?][]): QuantitySet => ({
  name, quantities: quantities.map(([n, value, type]) => ({ name: n, value, type: type ?? QuantityType.Area })),
}) as QuantitySet;

describe('surfaceOf', () => {
  it('maps FLOORING to floor, CLADDING and the wall-side types to wall, CEILING to ceiling, the rest to none', () => {
    assert.deepEqual(['FLOORING', 'floorING', 'CLADDING', 'SKIRTINGBOARD', 'MOLDING', 'CEILING'].map(surfaceOf), ['floor', 'floor', 'wall', 'wall', 'wall', 'ceiling']);
    for (const t of ['ROOFING', 'INSULATION', 'MEMBRANE', 'SLEEVING', 'WRAPPING', 'COPING', 'USERDEFINED', 'NOTDEFINED', '']) assert.equal(surfaceOf(t), null, t);
  });
});

describe('coveringArea', () => {
  it('takes NetArea of Qto_CoveringBaseQuantities, else GrossArea, else nothing, scaled to m²', () => {
    assert.equal(coveringArea([qset('Qto_CoveringBaseQuantities', [['GrossArea', 12], ['NetArea', 10]])], 1), 10);
    assert.equal(coveringArea([qset('Qto_CoveringBaseQuantities', [['GrossArea', 12]])], 1e-6), 12e-6);
    assert.equal(coveringArea([qset('Qto_CoveringBaseQuantities', [['Width', 3, QuantityType.Length]])], 1), null);
    assert.equal(coveringArea([qset('Qto_Other', [['NetArea', 5]])], 1), null);
    assert.equal(coveringArea([], 1), null);
  });
});

describe('roomFinishes', () => {
  it('prefers IfcRelCoversSpaces, then space boundaries, then containment, one surface at a time', () => {
    const [r] = roomFinishes([room({
      covers: [cov(1, 'Parquet', 'FLOORING', 20)],
      boundary: [cov(2, 'Tile', 'FLOORING', 5), cov(3, 'Plaster', 'CLADDING', 40)],
      contained: [cov(4, 'Rug', 'FLOORING', 2), cov(5, 'Panel', 'CLADDING', 9), cov(6, 'Tiles', 'CEILING', 18)],
    })]);
    assert.deepEqual(r.finishes.floor.map((f) => [f.name, f.source]), [['Parquet', 'coversSpaces']]);
    assert.deepEqual(r.finishes.wall.map((f) => [f.name, f.source]), [['Plaster', 'spaceBoundary']]);
    assert.deepEqual(r.finishes.ceiling.map((f) => [f.name, f.source]), [['Tiles', 'containment']]);
  });

  it('falls back to the room properties, name only, when no covering gives the surface', () => {
    const [r] = roomFinishes([room({ contained: [cov(1, 'Panel', 'CLADDING', 9)], properties: { floor: ' Sealed concrete ', wall: 'Ignored', ceiling: '' } })]);
    assert.deepEqual(r.finishes.floor, [{ name: 'Sealed concrete', area: null, source: 'property' }]);
    assert.deepEqual(r.finishes.wall.map((f) => f.name), ['Panel']);
    assert.deepEqual(r.finishes.ceiling, []);
  });

  it('counts a covering once, leaves the area empty when the model gives none, ignores other covering types', () => {
    const [r] = roomFinishes([room({ covers: [cov(1, 'Parquet', 'FLOORING', 20), cov(1, 'Parquet', 'FLOORING', 20), cov(2, 'Screed', 'FLOORING'), cov(3, 'Roof felt', 'ROOFING', 99), cov(4, 'Foil', 'MEMBRANE', 99)] })]);
    assert.deepEqual(r.finishes.floor.map((f) => [f.name, f.area]), [['Parquet', 20], ['Screed', null]]);
    assert.deepEqual([r.finishes.wall, r.finishes.ceiling], [[], []]);
  });

  it('orders rooms by storey elevation, then number as a number, and keeps a room with no finishes', () => {
    const rooms = roomFinishes([
      room({ number: '10', name: 'C', level: 'L2', elevation: 3 }),
      room({ number: '9', name: 'B', level: 'L1', elevation: 0 }),
      room({ number: '101', name: 'D', level: 'L1', elevation: 0 }),
      room({ number: '2', name: 'A', level: '', elevation: null }),
    ]);
    assert.deepEqual(rooms.map((r) => r.name), ['B', 'D', 'C', 'A']);
    assert.deepEqual(rooms[0].finishes, { floor: [], wall: [], ceiling: [] });
  });
});

describe('finishLines and the table', () => {
  const rooms = roomFinishes([
    room({ number: '101', name: 'Living', covers: [cov(1, 'Parquet', 'FLOORING', 24.5), cov(2, 'Paint', 'CLADDING', 52), cov(3, 'Veneer', 'CLADDING', 4.25)] }),
    room({ number: '102', name: 'Store', elevation: 0 }),
  ]);

  it('gives a room a line per finish, the number and name on the first only, and an empty room one empty line', () => {
    const lines = finishLines(rooms);
    assert.deepEqual(lines.map((l) => [l.number, l.first, l.floor?.name ?? null, l.wall?.name ?? null, l.ceiling?.name ?? null]), [
      ['101', true, 'Parquet', 'Paint', null],
      ['101', false, null, 'Veneer', null],
      ['102', true, null, null, null],
    ]);
  });

  it('prints the figures in the layout and writes unformatted numbers, a blank where the model gives none, to the CSV', () => {
    const texts = layoutRoomFinishes(rooms, LABELS).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    for (const t of ['Room finishes', 'Parquet', '24.50', '52.00', '4.25', 'Store']) assert.ok(texts.includes(t), t);
    assert.deepEqual(roomFinishesCsv(rooms, LABELS).split('\n'), [
      'No.,Room,Level,Floor,Area m²,Wall,Area m²,Ceiling,Area m²',
      '101,Living,L1,Parquet,24.5,Paint,52,,',
      '101,Living,L1,,,Veneer,4.25,,',
      '102,Store,L1,,,,,,',
    ]);
  });

  it('guards a model text that would run as a spreadsheet formula', () => {
    const csv = roomFinishesCsv(roomFinishes([room({ covers: [cov(1, '=HYPERLINK("x")', 'FLOORING', 1)] })]), LABELS);
    assert.ok(!csv.split('\n')[1].includes(',=HYPERLINK'), csv);
  });
});
