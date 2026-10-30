/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, second slice: the column schedules (takeoff, finishes, types, urban, rooms) page their rows to a viewport's height through one
 * engine. The fixtures here are shared with the sheet-level tests (`project/schedule-kinds-fit.test.tsx`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { layoutMaterialTakeoff, type TakeoffLabels } from './material-takeoff-layout';
import { layoutRoomFinishes, type RoomFinishLabels, type RoomFinishes } from '@bimvoice/ifcsheet';
import { layoutTypeQuantities, type TypeQuantityLabels } from './type-quantities-layout';
import { layoutUrban, type UrbanLabels } from '@/urban/urban-layout';
import { ROOM_SCHEDULE_EN, ROOM_SCHEDULE_RO, roomSchedule, type RoomSchedule } from '@bimvoice/ifcsheet';
import { layoutRoomSchedule, type RoomScheduleLabels } from '@bimvoice/ifcsheet';
import type { TakeoffRow } from './material-takeoff';
import type { Totals, TypeQuantities } from './type-quantities';
import type { UrbanIndicators } from '@/urban/indicators';
import type { ScheduleLayout } from './schedule-layout';
import { layoutPagedTable, PAD, textWidth } from '@bimvoice/ifcsheet';

export const TAKEOFF_LABELS: TakeoffLabels = { locale: 'en', title: 'Materials', material: 'Material', elements: 'Elements', volume: 'Volume', area: 'Area', usedIn: 'Used in', total: 'Total' };
export const FINISH_LABELS: RoomFinishLabels = { locale: 'en', title: 'Room finishes', number: 'No.', room: 'Room', level: 'Level', floor: 'Floor', wall: 'Wall', ceiling: 'Ceiling', area: 'Area m²', sharedNote: '* Shared by several rooms' };
export const TYPE_LABELS: TypeQuantityLabels = {
  locale: 'en', title: 'Quantities', type: 'Type', class: 'Class', level: 'Storey', count: 'Count', length: 'Length m', area: 'Area m²', volume: 'Volume m³', noQto: 'No Qto', total: 'Total', noType: '(no type)', noLevel: 'No storey', classification: 'Classification', classificationTitle: 'Title', unclassified: 'No classification',
};
export const URBAN_LABELS: UrbanLabels = {
  locale: 'en', title: 'Urban indicators', level: 'Level', elevation: 'Elevation', built: 'Built', useful: 'Useful', inCut: 'In CUT', yes: 'yes', no: 'no', belowGround: (n) => n, ground: (n) => n, category: 'Category', area: 'Area',
  ac: 'Ac', ad: 'Ad', adCut: 'Ad for CUT', au: 'Au', site: 'Site', pot: 'POT', cut: 'CUT', rules: () => ['Ac is the footprint of the ground storey measured to the outer face of the external walls.'], note: '',
  atLeast: (v) => `>= ${v}`, unmeasured: (count, level) => `${count} unmeasured on ${level}`,
};

export const ROOM_LABELS: RoomScheduleLabels = { ...ROOM_SCHEDULE_EN, locale: 'en', title: 'Room and area schedule', notes: ['Area: the model\'s NetFloorArea, else GrossFloorArea.'] };

/** `n` rooms over three levels, a tenth of them with their area from the geometry. */
export const roomData = (n: number): RoomSchedule => roomSchedule(
  [{ name: 'Ground', elevation: 0 }, { name: 'Level 1', elevation: 3 }, { name: 'Level 2', elevation: 6 }],
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, number: String(i + 1), name: `Room ${i + 1}`, level: i % 3, area: 8 + i, source: i % 10 === 9 ? 'geometry' as const : 'quantity' as const, perimeter: 12 + i })),
);

export const takeoffRows = (n: number): TakeoffRow[] => Array.from({ length: n }, (_, i) => ({ material: `Material ${i}`, elements: 1 + (i % 7), volume: i % 4 === 3 ? null : 1 + i / 4, area: 2 + i, classes: ['IfcSlab', ...(i % 2 ? ['IfcWall'] : [])] }));

export const finishRooms = (n: number): RoomFinishes[] => Array.from({ length: n }, (_, i) => {
  const finish = (name: string, shared = 1) => ({ name, area: 8 + i, source: 'coversSpaces' as const, sharedBy: shared });
  return {
    number: String(i + 1), name: `Room ${i + 1}`, level: i % 2 ? 'Level 1' : 'Ground',
    finishes: { floor: [finish('Oak parquet'), ...(i % 3 === 0 ? [finish('Rug')] : [])], wall: [finish('Plaster', i % 4 === 0 ? 2 : 1)], ceiling: i % 5 ? [finish('Paint')] : [] },
  };
});

const totals = (count: number): Totals => ({ count, noQto: 0, length: count * 2, area: count * 3, volume: count });
export const typeData = (n: number): TypeQuantities => ({
  levels: ['Ground', 'Level 1'],
  rows: Array.from({ length: n }, (_, i) => ({ key: `t${i}`, typeName: `Type ${i}`, className: i % 2 ? 'IfcWall' : 'IfcSlab', total: totals(3), byLevel: { Ground: totals(2), 'Level 1': totals(1) } })),
  classTotals: [{ className: 'IfcWall', total: totals(n) }, { className: 'IfcSlab', total: totals(n) }],
});

export const urbanData = (storeys: number): UrbanIndicators => ({
  storeys: Array.from({ length: storeys }, (_, i) => ({
    name: `Storey ${storeys - i}`, elevation: (storeys - 1 - i) * 3, height: i ? 3 : null, builtArea: 120 + i, usefulArea: 100 + i, belowGround: false, ground: i === storeys - 1, inCut: true, inCutByDefault: true, unmeasured: 0,
  })),
  ac: 120, ad: 120 * storeys, adCut: 120 * storeys, acAtLeast: false, adAtLeast: false, adCutAtLeast: false, au: 100 * storeys,
  auByCategory: Array.from({ length: storeys }, (_, i) => ({ category: `Category ${i}`, area: 10 + i })), siteArea: 600, pot: 20, cut: 1.2, terrainLevel: 0, zero: { elevation: 0, source: 'model' },
} as UrbanIndicators);

/** Every kind, `n` rows' worth, as a layout function of the paging options (what the sheet passes). */
export const KINDS: { kind: string; layout: (n: number, o?: { maxHeight?: number; page?: number }) => ScheduleLayout }[] = [
  { kind: 'takeoff', layout: (n, o) => layoutMaterialTakeoff(takeoffRows(n), TAKEOFF_LABELS, o) },
  { kind: 'finishes', layout: (n, o) => layoutRoomFinishes(finishRooms(n), FINISH_LABELS, o) },
  { kind: 'types', layout: (n, o) => layoutTypeQuantities(typeData(n), TYPE_LABELS, o) },
  { kind: 'urban', layout: (n, o) => layoutUrban(urbanData(n), URBAN_LABELS, o) },
  { kind: 'rooms', layout: (n, o) => layoutRoomSchedule(roomData(n), ROOM_LABELS, o) },
];

const digest = (l: ScheduleLayout) => createHash('sha1').update(JSON.stringify([l.width, l.height, l.prims])).digest('hex').slice(0, 12);
// An A3 landscape drawing area less the margins, about 400 x 270 mm.
const BOX = { w: 400, h: 270 };
const texts = (l: ScheduleLayout) => l.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
/** The lowest y and the rightmost x anything on the page reaches. */
function reach(l: ScheduleLayout): { x: number; y: number } {
  let x = 0, y = 0;
  for (const p of l.prims) {
    if (p.kind === 'line') { x = Math.max(x, p.x1, p.x2); y = Math.max(y, p.y1, p.y2); } else if (p.kind === 'text') y = Math.max(y, p.y);
  }
  return { x, y };
}

/** What each kind's small fixture drew before the shared engine (the old per-kind layouts), as a digest. Every digest moved when the title and the notes were inset by the cells' padding (#42); the rooms' also when the perimeter column was added and when each area cell took its unit (m², #495); nothing else changed. */
const BEFORE: Record<string, string> = { takeoff: '9dbd0ce04a3e', finishes: '276f937907fd', types: 'edf180bf476f', urban: 'dd99a4b04c63', rooms: 'ce814543711c' };
/** A first-column text that exists once per row of the kind's fixture. */
const ROW_TEXT: Record<string, (i: number) => string> = {
  takeoff: (i) => `Material ${i}`, finishes: (i) => `Room ${i + 1}`, types: (i) => `Type ${i}`, urban: (i) => `Category ${i}`, rooms: (i) => `Room ${i + 1}`,
};
/** What a page of the kind may open with: its table's header (the urban figures table has none: it opens with one of its rows). */
const HEADER: Record<string, string[]> = { takeoff: ['Material'], finishes: ['Floor'], types: ['Type'], rooms: ['Room'], urban: ['Level', 'Category', 'Ac', 'Ad', 'Au', 'Site', 'POT', 'CUT', 'Ad for CUT'] };

describe('the column schedules page their rows to a viewport\'s height (#186)', () => {
  for (const { kind, layout } of KINDS) {
    describe(kind, () => {
      it('a small schedule is unchanged: one page, the output it had before, and a roomy box changes nothing', () => {
        const plain = layout(4);
        assert.equal(digest(plain), BEFORE[kind]);
        assert.equal(plain.pages, 1);
        assert.equal(digest(layout(4, { maxHeight: BOX.h })), BEFORE[kind]);
      });

      it('a schedule that overflows A3 continues on further pages, every row on exactly one, each page inside the box', () => {
        const n = 60;
        const first = layout(n, { maxHeight: BOX.h, page: 0 });
        const pages = first.pages!;
        assert.ok(pages > 1, `${n} rows take several pages (${pages})`);
        const seen = new Map<string, number>();
        for (let page = 0; page < pages; page++) {
          const l = layout(n, { maxHeight: BOX.h, page });
          assert.equal(l.pages, pages, 'every page agrees on the count');
          assert.ok(l.height <= BOX.h + 1e-6, `page ${page + 1}: height ${l.height} within ${BOX.h}`);
          assert.ok(reach(l).y <= BOX.h + 1e-6 && reach(l).x <= BOX.w, `page ${page + 1}: everything drawn is inside the box`);
          assert.ok(HEADER[kind].some((h) => texts(l).includes(h)), `page ${page + 1} repeats the header`);
          assert.ok(texts(l).some((t) => t.includes(`(${page + 1}/${pages})`)), `page ${page + 1} says which page it is`);
          for (let i = 0; i < n; i++) if (texts(l).includes(ROW_TEXT[kind](i))) seen.set(ROW_TEXT[kind](i), (seen.get(ROW_TEXT[kind](i)) ?? 0) + 1);
        }
        // Urban's rows are its categories; the others one per row.
        for (let i = 0; i < n; i++) assert.equal(seen.get(ROW_TEXT[kind](i)), 1, `${ROW_TEXT[kind](i)} appears on one page`);
      });

      it('a shorter box needs more pages, a taller one fewer: a resize re-wraps', () => {
        const [short, tall, taller] = [100, 200, 400].map((h) => layout(60, { maxHeight: h }).pages!);
        assert.ok(short >= tall && tall >= taller && short > taller, `${short} >= ${tall} >= ${taller}`);
      });

      it('no page is taller than the box, whatever its height, and a page past the last is the last', () => {
        const min = layout(60).minBox!.height;
        for (let h = min; h <= 320; h += 1) {
          const l = layout(60, { maxHeight: h });
          assert.ok(l.height <= h + 1e-6, `box ${h}: page is ${l.height} tall`);
          const last = layout(60, { maxHeight: h, page: l.pages! - 1 });
          assert.deepEqual(layout(60, { maxHeight: h, page: l.pages! + 5 }).prims, last.prims, `box ${h}: a page past the end shows the last`);
        }
      });

      it('a box one millimetre shorter than the whole table still holds every page, the room under the last line included', () => {
        const natural = layout(6).height;
        const l = layout(6, { maxHeight: natural - 1 });
        assert.ok(l.pages! > 1 && l.height <= natural - 1 + 1e-6, `${l.pages} pages, ${l.height} within ${natural - 1}`);
      });

      it('names the smallest box a resize may reach, and a page in a box that small still holds a row', () => {
        const min = layout(60).minBox!;
        assert.ok(min.width > 0 && min.height > 0);
        const l = layout(60, { maxHeight: min.height });
        assert.ok(l.height <= min.height + 1e-6, `${l.height} within ${min.height}`);
        assert.ok(l.pages! > 1);
      });
    });
  }

  it('the finishes\' shared-area note is never alone on a page: it travels with the last row above it', () => {
    for (let h = KINDS[1].layout(60).minBox!.height; h <= 320; h += 1) {
      const l = KINDS[1].layout(60, { maxHeight: h });
      for (let page = 0; page < l.pages!; page++) {
        const t = texts(KINDS[1].layout(60, { maxHeight: h, page }));
        if (t.includes(FINISH_LABELS.sharedNote)) assert.ok(t.includes('Oak parquet'), `box ${h}, page ${page + 1}: the note has a row beside it`);
      }
    }
  });
});

describe('text stays inside the viewport clip, inset like the cells (#42)', () => {
  /** A note much longer than the table is wide: it wraps, it is not cut. */
  const LONG = 'Su = aria utilă (Au): suma ariilor încăperilor. Sc = aria construită (Ac): amprenta nivelului care conține ±0,00, măsurată la fața exterioară a pereților exteriori. Sd = aria desfășurată (Ad): suma ariilor construite ale tuturor nivelurilor, subsolurile incluse.';
  const KINDS_WITH_NOTES: [string, () => ScheduleLayout][] = [
    ['rooms (ro)', () => layoutRoomSchedule(roomData(4), { ...ROOM_LABELS, ...ROOM_SCHEDULE_RO, locale: 'ro', title: 'Tabel de încăperi și arii', notes: [LONG] })],
    ['urban', () => layoutUrban(urbanData(3), { ...URBAN_LABELS, rules: () => [LONG] })],
  ];
  for (const [kind, layout] of KINDS_WITH_NOTES) {
    it(`${kind}: every text run, title and notes included, lies between the left and right inset of the table`, () => {
      const l = layout();
      const runs = l.prims.flatMap((p) => (p.kind === 'text' ? [p] : []));
      assert.ok(runs.some((r) => r.text.includes('Su = aria') || r.text.includes('amprenta') || r.text.includes('suma')), 'the long note is on the sheet');
      for (const r of runs) {
        const w = textWidth(r.text, r.size);
        const [left, right] = r.anchor === 'end' ? [r.x - w, r.x] : [r.x, r.x + w];
        assert.ok(left >= PAD - 1e-9, `"${r.text}" starts at ${left}, left of the inset ${PAD}`);
        assert.ok(right <= l.width - PAD + 1e-9, `"${r.text}" ends at ${right}, right of ${l.width - PAD}`);
      }
    });
  }

  it('a long note handed to the shared layout unwrapped is wrapped to the table, not cut at its edge', () => {
    const table = { kind: 'table' as const, block: { columns: [30, 30], header: ['A', 'B'], numeric: (c: number) => c === 1, rows: [{ cells: ['x', '1'], rule: 0.18 }] } };
    const l = layoutPagedTable('Title', 4, [table, { kind: 'text', h: 4, dy: 4, size: 2, text: LONG }]);
    const notes = l.prims.flatMap((p) => (p.kind === 'text' && p.size === 2 ? [p] : []));
    assert.ok(notes.length > 2, 'wrapped to several lines');
    for (const r of notes) assert.ok(r.x + textWidth(r.text, r.size) <= l.width - PAD + 1e-9, `"${r.text}" runs past the table`);
    assert.equal(notes.map((r) => r.text).join(' '), LONG, 'nothing is lost');
  });
});
