/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #495: the room and area schedule printed "12,50 *" and a reader took the star for a unit that failed to print. The unit is
 * m² in the header AND in every area cell, the star is only the mark of an estimated area, and its legend is the first note
 * under the table. Read as the sheet draws it (the SVG of the real sheet paper), in English and Romanian, and as the PDF
 * (the embedded font has the ²) and the DXF (windows-1252 has it) carry it.
 */
import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as jspdf from 'jspdf';
import { encodeDxfCp1252 } from '@ifc-lite/drawing-2d';
import { roomSchedule, type RoomRecord } from '@bimvoice/ifcsheet';
import { roomScheduleEn } from '@/i18n/catalogues/room-schedule.en';
import { roomScheduleRo } from '@/i18n/catalogues/room-schedule.ro';
import { roomSummaryEn } from '@/i18n/catalogues/room-summary.en';
import { roomSummaryRo } from '@/i18n/catalogues/room-summary.ro';
import { embedFonts, missingGlyphs } from '@/issue/pdf-fonts';
import { roomScheduleLabelsOf } from '@/components/viewer/joinery/room-schedule-hooks';
import { layoutRoomSchedule, roomScheduleCells } from './room-schedule-layout';
import { PAD, textWidth } from './paged-table';

const ROOMS: RoomRecord[] = [
  { id: 'a', number: '1', name: 'Flur', level: 0, area: 12.5, source: 'quantity', perimeter: 14 },
  { id: 'b', number: '2', name: 'Bad', level: 0, area: 8.25, source: 'geometry', perimeter: 11 },
];
const SCHEDULE = roomSchedule([{ name: 'EG', elevation: 0 }], ROOMS);

const catalogue = (lang: 'en' | 'ro'): Record<string, string> => (lang === 'en' ? { ...roomSummaryEn, ...roomScheduleEn } : { ...roomSummaryRo, ...roomScheduleRo }) as Record<string, string>;
const texts = (lang: 'en' | 'ro'): string[] => {
  const c = catalogue(lang);
  const t = ((key: string, vars?: Record<string, unknown>) => (c[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`))) as never;
  const data = { schedule: SCHEDULE, leftOut: { external: 0, gfa: 0, parents: 0 } } as never;
  const labels = roomScheduleLabelsOf(t, lang, 'Rooms', data);
  return layoutRoomSchedule(SCHEDULE, labels).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
};

describe('the room schedule prints m², never a bare star (#495)', () => {
  for (const lang of ['en', 'ro'] as const) {
    it(`${lang}: the header, every area cell and the legend of the star`, () => {
      const all = texts(lang);
      assert.ok(all.some((s) => /\bm²$/.test(s) && /^(Useful|Arie)/.test(s)), `a header with m²: ${all.join(' | ')}`);
      const cells = all.filter((s) => /^\d[\d.,]* m²( \*)?$/.test(s));
      assert.equal(cells.length, 4, `two rooms, the level and the building total: ${all.join(' | ')}`);
      assert.deepEqual(all.filter((s) => s.endsWith('*')), [lang === 'en' ? '8.25 m² *' : '8,25 m² *']);
      const legend = all.filter((s) => s.startsWith('* '));
      assert.equal(legend.length, 1);
      assert.match(legend[0], lang === 'en' ? /^\* Estimated area: .*NetFloorArea/ : /^\* Arie estimată: .*NetFloorArea/);
      assert.ok(all.indexOf(legend[0]) < all.findIndex((s) => s.startsWith(lang === 'en' ? 'Area: the model' : 'Aria: NetFloorArea')), 'the legend comes first under the table');
    });
  }

  it('the PDF font has the superscript two, and windows-1252 (the DXF) encodes it', async () => {
    const doc = new jspdf.jsPDF();
    const load = async (url: string) => new Uint8Array(readFileSync(new URL(`../../public${url}`, import.meta.url)));
    assert.ok(await embedFonts(doc, load), 'the fonts embed');
    assert.deepEqual(missingGlyphs(doc, 'Useful area m² 12,50 m² *'), []);
    const dxf = encodeDxfCp1252('m²');
    assert.equal(dxf.hadUnmappable, false);
    assert.deepEqual([...dxf.bytes], [0x6d, 0xb2]);
  });
});

describe('a long room number stays in its column (#543)', () => {
  const LONG = roomSchedule([{ name: 'Parter', elevation: 0 }], [
    { id: 'a', number: 'Casa scarii parter', name: 'Casa scarii parter', level: 0, area: 12.5, source: 'quantity', perimeter: 14 },
    { id: 'b', number: 'Living + hol ap.1', name: 'Living', level: 0, area: 8.25, source: 'quantity', perimeter: 11 },
    { id: 'c', number: 'Baie ap.1', name: 'Baie', level: 0, area: 4, source: 'quantity', perimeter: 8 },
  ]);
  const labels = (() => {
    const c = catalogue('en');
    const t = ((key: string, vars?: Record<string, unknown>) => (c[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`))) as never;
    return roomScheduleLabelsOf(t, 'en', 'Rooms', { schedule: LONG, leftOut: { external: 0, gfa: 0, parents: 0 } } as never);
  })();

  it('every text sits inside the column its left edge is in, so nothing prints over the next cell', () => {
    const layout = layoutRoomSchedule(LONG, labels);
    const xs = [...new Set(layout.prims.flatMap((p) => (p.kind === 'line' && p.x1 === p.x2 ? [p.x1] : [])))].sort((a, b) => a - b);
    assert.ok(xs.length >= 5, `the column rules: ${xs.join(', ')}`);
    const cellTexts = new Set(roomScheduleCells(LONG, labels).flatMap((r) => r.cells).concat([labels.number, labels.room]));
    const rows = layout.prims.filter((p) => p.kind === 'text' && p.anchor === 'start' && cellTexts.has(p.text) && xs.some((x) => Math.abs(x + PAD - p.x) < 1e-6));
    assert.ok(rows.length > 0);
    for (const p of rows) {
      if (p.kind !== 'text') continue;
      const right = xs.find((x) => x > p.x)!;
      assert.ok(p.x + textWidth(p.text, p.size) <= right, `"${p.text}" ends at ${(p.x + textWidth(p.text, p.size)).toFixed(1)}, past the rule at ${right}`);
    }
  });

  it('a table that already fits keeps its columns', () => {
    assert.equal(layoutRoomSchedule(SCHEDULE, labels).width, 130);
  });
});
