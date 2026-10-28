/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #42, the next slice: the perimeter column and the Su / Sc / Sd summary of the room schedule, on AC20-FZK-Haus.
 *
 * The hand figures, from the STEP text (see `urban/urban-fzk.test.ts` for Ac and Ad):
 * - Su. The NetFloorArea of the seven rooms: the six on the ground floor sum to 98.8330955 m2, the gallery in the attic is
 *   74.5092415823, so Su of the building is 173.3424370823 m2, which is Au.
 * - Sc and Sd. The walls' outer faces bound a 12.0 x 10.0 m rectangle on both storeys: Sc (= Ac, the level at +-0.00) is 120.00
 *   m2, each level's built area is 120.00 and Sd (= Ad) is 240.00 m2.
 * - Perimeter. Each space has a FootPrint polyline in the file; the length of its segments, by hand: Bad (#21272) is a
 *   3.71 x 3.37 rectangle, 2 x (3.71 + 3.37) = 14.16 m; the others are in `PERIMETER_BY_HAND`.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roomSchedule } from '@bimvoice/ifcsheet';
import { readRooms } from '@bimvoice/ifcsheet/headless';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { collectRoomRecords, collectUrbanAreas } from '@/urban/urban-models';
import { urbanIndicators } from '@/urban/indicators';
import { areaSummary } from '@/urban/area-summary';
import { registerLocale, setLocale, captureTranslation } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { roomScheduleLabelsOf, type RoomScheduleData } from '@/components/viewer/joinery/room-schedule-hooks';
import { layoutRoomSchedule } from './room-schedule-layout';
import { exportCsv, exportXlsx } from './schedule-export';
import { roomScheduleExport } from './room-schedule-export';
import { readScheduleExport, type ExportLabelSet } from '@/components/viewer/wall/schedule-export-read';
import type { ProjectSchedule } from '@/project/types';

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const SU_ATTIC = 74.5092415823;
const SU_BUILDING = 21.410325 + 12.127619 + 12.59545 + 25.2088935 + 11.185458 + 16.30545 + SU_ATTIC;
const SU_GROUND = SU_BUILDING - SU_ATTIC;
/** Footprints come from f32 meshes and a 2D boolean: a millimetre band on a 12 m side is 0.012 m2; allow 0.05 m2 (as `urban-fzk.test.ts`). */
const AREA_TOL = 0.05;
/** Each space's FootPrint polyline in the IFC text, the sum of its segments (m). */
const PERIMETER_BY_HAND: Record<string, number> = {
  Schlafzimmer: 2 * (5.45 + 4.05), Bad: 2 * (3.71 + 3.37), Buero: 2 * (3.71 + 3.5), Wohnen: 3.71 + 7.005 + 3.71 + 7.005,
  Flur: 3.5 + 0.24 + 3.61 + 1.74 + 7.11 + 1.5, 'Küche': 3.71 + 4.395 + 3.71 + 4.395, Galerie: 2 * (11.4 + 9.4),
};
const near = (actual: number | null | undefined, expected: number, tol: number, what: string) => {
  assert.ok(actual !== null && actual !== undefined, `${what} is missing`);
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} by hand`);
};

/** The translator of `locale`, fixed when captured (`captureTranslation`). */
const translator = (locale: 'en' | 'ro'): Parameters<typeof roomScheduleLabelsOf>[0] => { setLocale(locale); return captureTranslation() as unknown as Parameters<typeof roomScheduleLabelsOf>[0]; };
const SCHEDULE: ProjectSchedule = { id: 'sc1', name: 'Tabel de încăperi', kind: 'rooms', createdAt: 1, scale: 100 };

async function load() {
  await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
  const levels = useProjectStore.getState().levels;
  const { rooms, leftOut } = collectRoomRecords(levels);
  const data: RoomScheduleData = { schedule: roomSchedule(levels, rooms), leftOut };
  const urban = urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 });
  return { levels, rooms, data, urban, summary: areaSummary(urban) };
}

beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map() }); registerLocale('ro', ro); setLocale('en'); });
afterEach(() => setLocale('en'));

describe('the Su / Sc / Sd summary of the room schedule (#42)', () => {
  it('Su per level and for the building are the urban sheet\'s figures through the one helper, and the hand sums', async (t) => {
    if (!urbanWasm(t)) return;
    const { data, urban, summary } = await load();
    assert.deepEqual(summary.levels.map((l) => l.name), ['Erdgeschoss', 'Dachgeschoss'], 'low to high, as the room table lists them');
    // The hand sums of the model's NetFloorArea.
    near(summary.levels[0].su, SU_GROUND, 1e-6, 'Su Erdgeschoss');
    near(summary.levels[1].su, SU_ATTIC, 1e-6, 'Su Dachgeschoss');
    near(summary.building.su, SU_BUILDING, 1e-6, 'Su of the building');
    // The same numbers, to the last digit, as the urban sheet (indicators) and as the schedule's own totals (no second sum).
    assert.equal(summary.building.su, urban.au);
    assert.equal(summary.building.su, data.schedule.total);
    for (const level of summary.levels) {
      assert.equal(level.su, urban.storeys.find((s) => s.name === level.name)?.usefulArea, `${level.name} on the urban sheet`);
      assert.equal(level.su, data.schedule.levels.find((l) => l.name === level.name)?.total, `${level.name} in the schedule`);
    }
  });

  it('Sc is Ac on the level at +-0.00 only, Sd is Ad: the sum of every level\'s built area', async (t) => {
    if (!urbanWasm(t)) return;
    const { urban, summary } = await load();
    near(summary.building.sc, 120, AREA_TOL, 'Sc');
    near(summary.building.sd, 240, AREA_TOL, 'Sd');
    assert.equal(summary.building.sc, urban.ac);
    assert.equal(summary.building.sd, urban.ad);
    assert.equal(summary.levels[0].sc, urban.ac, 'the ground level carries Sc');
    assert.equal(summary.levels[1].sc, null, 'the attic does not');
    near(summary.levels[0].sd, 120, AREA_TOL, 'Sd of the ground level');
    near(summary.levels[1].sd, 120, AREA_TOL, 'Sd of the attic');
    assert.ok(Math.abs(summary.levels.reduce((a, l) => a + (l.sd ?? 0), 0) - summary.building.sd!) < 1e-9, 'the levels add up to the building');
  });

  it('lists the rooms on no level as a line of their own, so the lines add up to the building', async (t) => {
    if (!urbanWasm(t)) return;
    await load();
    // The project knows the ground floor only: the gallery in the attic is on no level of it.
    useProjectStore.setState({ levels: useProjectStore.getState().levels.filter((l) => l.name === 'Erdgeschoss') });
    const levels = useProjectStore.getState().levels;
    const urban = urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 });
    const summary = areaSummary(urban);
    assert.deepEqual(summary.levels.map((l) => l.name), ['Erdgeschoss', '']);
    near(summary.levels[0].su, SU_GROUND, 1e-6, 'Su Erdgeschoss');
    near(summary.levels[1].su, SU_ATTIC, 1e-6, 'Su of the rooms on no level');
    assert.equal(summary.building.su, urban.au);
    assert.equal(summary.levels[1].su, roomSchedule(levels, collectRoomRecords(levels).rooms).levels.find((l) => l.name === '')?.total, 'the schedule\'s "no level" total');
    near(summary.levels.reduce((a, l) => a + (l.su ?? 0), 0), SU_BUILDING, 1e-6, 'the lines add up to the building');
  });

  it('prints under the table in Romanian, written the Romanian way', async (t) => {
    if (!urbanWasm(t)) return;
    const { data, summary } = await load();
    const labels = roomScheduleLabelsOf(translator('ro'), 'ro', 'Tabel de încăperi', data, summary);
    const texts = layoutRoomSchedule(data.schedule, labels).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    for (const word of ['Sinteza ariilor (Su, Sc, Sd)', 'Su m²', 'Sc m²', 'Sd m²', 'Total clădire', 'Perimetru m', '14,16', '173,34', '98,83', '74,51']) assert.ok(texts.includes(word), `${word} is on the sheet`);
    assert.ok(texts.some((x) => /^(120|119|240|239)[,.]\d\d$/.test(x)), 'Sc and Sd are printed');
    assert.ok(texts.some((x) => x.includes('Sd = aria desfășurată (Ad)')) || texts.some((x) => x.includes('Aceleași cifre')), 'the definitions are under the summary');
    // Without the footprints measured the table is printed as before, with no summary.
    const bare = layoutRoomSchedule(data.schedule, { ...labels, summary: null }).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    assert.ok(!bare.includes('Sinteza ariilor (Su, Sc, Sd)'));
  });
});

describe('the perimeter column (#42)', () => {
  it('is, for every room, the length of its footprint polyline by hand; Bad is 14.16 m', async (t) => {
    if (!urbanWasm(t)) return;
    const { rooms } = await load();
    assert.equal(rooms.length, 7);
    for (const room of rooms) near(room.perimeter, PERIMETER_BY_HAND[room.name], 0.002, `perimeter of ${room.name}`);
    near(rooms.find((r) => r.name === 'Bad')!.perimeter, 14.16, 1e-6, 'perimeter of Bad');
  });

  it('is the command line\'s, for the same model (one rule for the app and the engine)', async (t) => {
    if (!urbanWasm(t)) return;
    const { rooms } = await load();
    const model = [...useViewerStore.getState().models.values()][0];
    const engine = readRooms(model.ifcDataStore!, model.geometryResult?.meshes ?? []);
    const key = (r: { id: string; perimeter: number | null }) => `${r.id}|${r.perimeter}`;
    assert.deepEqual(engine.rooms.map(key).sort(), rooms.map(key).sort());
  });
});

describe('the XLSX and CSV of the room schedule, through the one writer (#316, #80)', () => {
  it('holds the rooms with area and perimeter as numeric cells, and the summary as a second worksheet', async (t) => {
    if (!urbanWasm(t)) return;
    const { data, summary } = await load();
    const labels = roomScheduleLabelsOf(translator('en'), 'en', 'Rooms', data, summary);
    const file = roomScheduleExport(data.schedule, labels);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await exportXlsx(file, { locale: 'en' })).arrayBuffer());
    assert.equal(wb.worksheets.length, 2);
    const rooms = wb.worksheets[0];
    const rowOf = (ws: typeof rooms, text: string) => { let found = 0; ws.eachRow((row, n) => { if (row.getCell(2).value === text || row.getCell(1).value === text) found = n; }); return found; };
    const bad = rowOf(rooms, 'Bad');
    assert.ok(bad > 0);
    assert.deepEqual([1, 2, 3].map((c) => rooms.getCell(bad, c).value), ['3', 'Bad', 'Erdgeschoss']);
    assert.equal(typeof rooms.getCell(bad, 4).value, 'number');
    assert.equal(typeof rooms.getCell(bad, 5).value, 'number');
    near(rooms.getCell(bad, 4).value as number, 12.127619, 1e-6, 'area of Bad in the file');
    near(rooms.getCell(bad, 5).value as number, 14.16, 1e-6, 'perimeter of Bad in the file');
    const total = rowOf(rooms, 'Total building (Au)');
    near(rooms.getCell(total, 4).value as number, SU_BUILDING, 1e-6, 'the building total in the file');
    assert.equal(rooms.getCell(total, 5).value, null, 'a total has no perimeter');
    // The summary worksheet.
    const sum = wb.worksheets[1];
    const building = rowOf(sum, 'Total building');
    assert.deepEqual([2, 3, 4].map((c) => typeof sum.getCell(building, c).value), ['number', 'number', 'number']);
    near(sum.getCell(building, 2).value as number, SU_BUILDING, 1e-6, 'Su in the file');
    near(sum.getCell(building, 3).value as number, 120, AREA_TOL, 'Sc in the file');
    near(sum.getCell(building, 4).value as number, 240, AREA_TOL, 'Sd in the file');
    // The CSV is the same tables, in plain numbers.
    const csv = exportCsv(file, { delimiter: ',' });
    assert.ok(csv.includes('3,Bad,Erdgeschoss,12.127619,14.16'));
    assert.ok(csv.includes('Su m²,Sc m²,Sd m²'));
  });

  it('is what the card\'s export reads for a rooms schedule, with the summary from the urban indicators', async (t) => {
    if (!urbanWasm(t)) return;
    await load();
    const labelSet = { rooms: (title: string, data: RoomScheduleData, summary: Parameters<typeof roomScheduleLabelsOf>[4]) => roomScheduleLabelsOf(translator('en'), 'en', title, data, summary) } as unknown as ExportLabelSet;
    const file = await readScheduleExport(SCHEDULE, labelSet);
    assert.ok(file);
    assert.equal(file.title, SCHEDULE.name);
    assert.deepEqual(file.tables.map((x) => x.name), ['Room', 'Area summary (Su, Sc, Sd)']);
    assert.equal(file.tables[0].rows.filter((r) => typeof r[3] === 'number').length, 7 + 2 + 1, 'seven rooms, two level totals, the building');
  });
});
