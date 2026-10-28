/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #42: the room and area schedule of AC20-FZK-Haus. The figures are the NetFloorArea of the seven rooms in the IFC
 * text (see `urban-fzk.test.ts` for the hand sum): the schedule's building total IS the urban sheet's Au, because
 * both read the rooms through `collectRoomRecords` and the engine's area rule; the label of a room says the same
 * figure; a model update moves all of them; and the command line (the engine's `readRooms`) lists the same rooms.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QuantityType } from '@ifc-lite/data';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { roomSchedule, roomScheduleCsv, roomScheduleLines, roomScheduleText, ROOM_SCHEDULE_EN, type RoomSchedule } from '@bimvoice/ifcsheet';
import { readRooms } from '@bimvoice/ifcsheet/headless';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { configureMutationView } from '@/utils/configureMutationView';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { collectRoomRecords, collectUrbanAreas } from '@/urban/urban-models';
import { urbanIndicators } from '@/urban/indicators';
import { labelElementByGlobalId } from '@/labels/label-element';
import { refreshParametricLabels } from '@/labels/label-sync';
import { planTagAll, modelArea } from '@/tagall/plan';
import { TAGALL_TYPES } from '@/tagall/types';
import { layoutRoomSchedule, roomScheduleCells, type RoomScheduleLabels } from './room-schedule-layout';

const FZK = resolve(import.meta.dirname, '../../src/test/__fixtures__/AC20-FZK-Haus.ifc');
const NET = [['1', 'Flur', 11.185458], ['2', 'Buero', 12.59545], ['3', 'Bad', 12.127619], ['4', 'Schlafzimmer', 21.410325], ['5', 'Wohnen', 25.2088935], ['6', 'Küche', 16.30545], ['7', 'Galerie', 74.5092415823]] as const;
const AU_BY_HAND = NET.reduce((a, r) => a + r[2], 0);
const GROUND_BY_HAND = AU_BY_HAND - 74.5092415823;
const TOL = 1e-6;

const LABELS: RoomScheduleLabels = { ...ROOM_SCHEDULE_EN, locale: 'en', title: 'Rooms', notes: [] };
const schedule = (): RoomSchedule => {
  const levels = useProjectStore.getState().levels;
  return roomSchedule(levels, collectRoomRecords(levels).rooms);
};
const roomExpressId = (store: { entities: { expressId: ArrayLike<number>; getTypeName(id: number): string | undefined; getName(id: number): string } }, name: string): number => {
  for (let i = 0; i < store.entities.expressId.length; i++) {
    const id = store.entities.expressId[i];
    if (id && store.entities.getTypeName(id)?.toUpperCase() === 'IFCSPACE' && store.entities.getName(id) === name) return id;
  }
  throw new Error(`no space named ${name}`);
};

describe('the room and area schedule of AC20-FZK-Haus (#42)', () => {
  beforeEach(() => useViewerStore.setState({ models: new Map(), mutationViews: new Map() }));

  it('lists the seven rooms by level with the model\'s areas, a total per level and for the building', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const s = schedule();
    assert.deepEqual(s.levels.map((l) => l.name), ['Erdgeschoss', 'Dachgeschoss']);
    assert.deepEqual(s.levels.flatMap((l) => l.rooms.map((r) => [r.number, r.name])), NET.map((r) => [r[0], r[1]]).sort((a, b) => (a[0] === '7' ? 1 : b[0] === '7' ? -1 : 0)));
    for (const room of s.levels.flatMap((l) => l.rooms)) {
      const expected = NET.find((r) => r[1] === room.name)![2];
      assert.ok(room.area !== null && Math.abs(room.area - expected) < TOL, `${room.name}: ${room.area} vs ${expected}`);
      assert.equal(room.source, 'quantity');
    }
    assert.ok(Math.abs(s.levels[0].total! - GROUND_BY_HAND) < TOL);
    assert.ok(Math.abs(s.levels[1].total! - 74.5092415823) < TOL);
    assert.ok(Math.abs(s.total! - AU_BY_HAND) < TOL);
    assert.equal(s.fromGeometry, 0);
  });

  it('totals equal the urban sheet\'s Au, in all and level by level', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const urban = urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 });
    const s = schedule();
    assert.ok(urban.au !== null && s.total !== null);
    assert.equal(s.total, urban.au, 'the building total is Au, to the last digit');
    for (const level of s.levels) {
      assert.equal(level.total, urban.storeys.find((r) => r.name === level.name)?.usefulArea, `the total of ${level.name}`);
    }
  });

  it('prints the table: level rows, rooms, totals, the building last; in Romanian with the decimal comma', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const s = schedule();
    const en = roomScheduleCells(s, LABELS).map((r) => r.cells.join('|'));
    assert.equal(en[0], '|Erdgeschoss||');
    assert.ok(en.includes('4|Schlafzimmer|21.41 m²|19.00'));
    assert.ok(en.includes('|Total Erdgeschoss|98.83 m²|'));
    assert.equal(en[en.length - 1], '|Total building (Au)|173.34 m²|');
    const ro = roomScheduleCells(s, { ...LABELS, locale: 'ro' }).map((r) => r.cells.join('|'));
    assert.ok(ro.includes('4|Schlafzimmer|21,41 m²|19,00'));
    assert.equal(ro[ro.length - 1], '|Total building (Au)|173,34 m²|');
    // The command line's text and CSV are the same rows.
    assert.ok(roomScheduleText(s, 'ro').includes('Total Dachgeschoss'));
    assert.equal(roomScheduleCsv(s).split('\n').length, roomScheduleLines(s, ROOM_SCHEDULE_EN).length + 1);
  });

  it('a label says the same area as the schedule, for every room', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    for (const room of collectRoomRecords(useProjectStore.getState().levels).rooms) {
      const labelled = modelArea(labelElementByGlobalId, room.id);
      assert.ok(labelled !== undefined && room.area !== null && Math.abs(labelled - room.area) < TOL, `${room.name}: label ${labelled}, schedule ${room.area}`);
    }
  });

  it('the command line lists the same rooms with the same areas (the engine\'s readRooms over the same parsed model)', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const model = [...useViewerStore.getState().models.values()][0];
    const app = collectRoomRecords(useProjectStore.getState().levels).rooms;
    const engine = readRooms(model.ifcDataStore!, model.geometryResult?.meshes ?? []);
    const key = (r: { id: string; number: string; name: string; area: number | null; source: string | null }) => `${r.id}|${r.number}|${r.name}|${r.area}|${r.source}`;
    assert.deepEqual(engine.rooms.map(key).sort(), app.map(key).sort());
    assert.deepEqual(engine.leftOut, collectRoomRecords(useProjectStore.getState().levels).leftOut);
    const engineSchedule = roomSchedule(engine.levels, engine.rooms);
    assert.equal(engineSchedule.total, schedule().total);
    assert.deepEqual(engineSchedule.levels.map((l) => [l.name, l.total, l.rooms.map((r) => r.name)]), schedule().levels.map((l) => [l.name, l.total, l.rooms.map((r) => r.name)]));
  });

  it('a model update moves the schedule, Au and the label of the room together', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const model = [...useViewerStore.getState().models.values()][0];
    const store = model.ifcDataStore!;
    const rooms = collectRoomRecords(useProjectStore.getState().levels).rooms;
    const bedroom = rooms.find((r) => r.name === 'Schlafzimmer')!;
    // Its label, drawn as TAGALL draws it, before the update.
    const [markType, roomType] = TAGALL_TYPES;
    const ring = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }];
    const placement = { viewId: 'v', layerId: '0', textHeight: 0.25, textStyle: 'standard', dimStyle: 'standard', paperUnit: 0.1, locale: 'en' };
    const { drafts } = planTagAll({ elements: [], targets: [], rooms: [{ renderId: 1, guid: bedroom.id, ring, at: 'cut' }], existing: [], placement, types: { mark: markType, room: roomType }, read: labelElementByGlobalId });
    useProjectStore.setState({ drafts, annotationTypes: TAGALL_TYPES.map((x) => structuredClone(x)) });
    const labelText = () => { const d = useProjectStore.getState().drafts[0]; return d.shape.type === 'text' ? d.shape.text : ''; };
    assert.equal(labelText(), '4\nSchlafzimmer\n21.41 m²');
    const before = schedule().total!;
    // The update: the model's quantity for the room changes to 30 m².
    const view = new MutablePropertyView(store.properties ?? null, 'fzk');
    configureMutationView(view, store);
    view.setQuantity(roomExpressId(store, '4'), 'BaseQuantities', 'NetFloorArea', 30, QuantityType.Area);
    useViewerStore.setState({ mutationViews: new Map([['fzk', view]]), mutationVersion: useViewerStore.getState().mutationVersion + 1 });
    refreshParametricLabels('en');
    assert.equal(labelText(), '4\nSchlafzimmer\n30.00 m²', 'the label follows the model');
    const after = schedule();
    assert.ok(Math.abs(after.total! - (before - 21.410325 + 30)) < TOL, 'the schedule follows the model');
    assert.equal(after.total, urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 }).au, 'and so does Au');
  });

  it('a room the model gives no area takes its geometry\'s footprint, in the schedule, in Au and on the command line, and says so', async (t) => {
    if (!urbanWasm(t)) return;
    // The same model with the quantity names changed: nothing states an area any more.
    const bytes = new TextEncoder().encode(readFileSync(FZK, 'latin1').replace(/'NetFloorArea'/g, "'XNetFloorArea'").replace(/'GrossFloorArea'/g, "'XGrossFloorArea'"));
    await loadUrbanModel('fzk', bytes);
    const s = schedule();
    assert.equal(s.fromGeometry, 7);
    assert.equal(s.withoutArea, 0);
    for (const room of s.levels.flatMap((l) => l.rooms)) {
      const expected = NET.find((r) => r[1] === room.name)![2];
      assert.equal(room.source, 'geometry');
      // The footprint of the space body is within 3.1 % of the stated net area on the plain rooms (the model's figure leaves out the finishes), and equal on the kitchen; the gallery's body reaches under the roof slopes, where the stated area stops, so its footprint is larger (107.16 against 74.51): the footprint is an approximation, which is why it is marked.
      if (room.name === 'Galerie') assert.ok(room.area !== null && room.area > expected, 'the gallery body is wider than its stated area');
      else assert.ok(room.area !== null && Math.abs(room.area - expected) / expected < 0.032, `${room.name}: footprint ${room.area} vs stated ${expected}`);
    }
    // The footprints add up to the figure the rooms' bodies give (pinned: 101.39 on the ground floor, 107.16 in the attic).
    assert.ok(Math.abs(s.total! - 208.5456) < 0.05, `${s.total}`);
    assert.equal(s.total, urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 }).au, 'Au takes the same footprints');
    const model = [...useViewerStore.getState().models.values()][0];
    assert.equal(roomSchedule(...(([r]) => [r.levels, r.rooms] as const)([readRooms(model.ifcDataStore!, model.geometryResult?.meshes ?? [])])).total, s.total);
    // Marked on paper: a `*` after each area taken from the geometry.
    assert.ok(roomScheduleCells(s, LABELS).filter((r) => r.cells[0] !== '' ).every((r) => r.cells[2].endsWith(' m² *')));
  });

  it('is paged to the paper: a page holds the rows that fit, each with the header, and every row is on a page', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const s = schedule();
    const whole = layoutRoomSchedule(s, LABELS);
    const pages = layoutRoomSchedule(s, LABELS, { maxHeight: 60, page: 0 }).pages ?? 1;
    assert.ok(pages > 1, 'a short sheet takes several pages');
    const texts = (page: number) => layoutRoomSchedule(s, { ...LABELS, notes: [] }, { maxHeight: 60, page, continued: 'continued' }).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    const all = Array.from({ length: pages }, (_, i) => texts(i));
    for (const page of all) assert.ok(page.includes('No.') && page.includes('Room'), 'the header repeats');
    for (const room of NET) assert.equal(all.filter((p) => p.includes(room[1])).length, 1, `${room[1]} is on exactly one page`);
    assert.ok(whole.height > 0 && layoutRoomSchedule(s, LABELS, { maxHeight: 60, page: 1 }).height <= 60);
  });
});
