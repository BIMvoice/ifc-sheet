/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, first slice: a joinery schedule wraps to its viewport's width at its
 * scale, and the bands that do not fit its height continue on further pages,
 * never shrunk (scale matters on drawings).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { layoutSchedule, scheduleMinBox, schedulePages, type ScheduleLabels, type ScheduleLayout } from './schedule-layout';
import type { ScheduleData, ScheduleEntry } from './schedule-data';

const labels: ScheduleLabels = {
  locale: 'en', title: 'Doors and windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};

/** `n` types, alternately windows and doors of varying width, as a large model has. */
export function manyTypes(n: number): ScheduleData {
  return {
    levels: ['Ground', 'Level 1'],
    entries: Array.from({ length: n }, (_, i): ScheduleEntry => {
      const door = i % 2 === 1;
      return {
        key: `t${i}`, kind: door ? 'door' : 'window', spec: door ? defaultDoorSpec(`D${i}`) : defaultWindowSpec(`W${i}`), mark: `${door ? 'D' : 'W'}${i + 1}`, name: `Type ${i}`,
        width: 0.8 + (i % 5) * 0.2, height: door ? 2.1 : 1.5, counts: { Ground: 1 + (i % 3), 'Level 1': i % 2 }, total: 2 + (i % 3), occurrences: [],
      };
    }),
  };
}

/** The extent of everything a layout draws, paper mm (a text's width estimated from its size). */
export function extentOf(layout: ScheduleLayout): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const p of layout.prims) {
    if (p.kind === 'line') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else if (p.kind === 'path') { for (const q of p.pts) { xs.push(q.x); ys.push(q.y); } }
    else {
      const w = p.text.length * p.size * 0.55;
      xs.push(p.anchor === 'start' ? p.x : p.anchor === 'end' ? p.x - w : p.x - w / 2, p.anchor === 'start' ? p.x + w : p.anchor === 'end' ? p.x : p.x + w / 2);
      ys.push(p.y);
    }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// An A3 landscape drawing area less the margins: about 400 × 277 mm.
const BOX = { w: 400, h: 270 };
const OPTIONS = { scale: 50, maxWidth: BOX.w, maxHeight: BOX.h };

describe('a joinery schedule wrapped to its viewport', () => {
  it('wraps 40 types to the viewport width and continues on further pages, each inside the box', () => {
    const data = manyTypes(40);
    const pages = schedulePages(data, OPTIONS);
    assert.ok(pages > 1, `40 types take several pages (${pages})`);
    let bands = 0;
    for (let page = 0; page < pages; page++) {
      const layout = layoutSchedule(data, labels, { ...OPTIONS, page });
      assert.equal(layout.pages, pages);
      assert.ok(layout.width <= BOX.w + 1e-6, `page ${page} is ${layout.width} wide`);
      assert.ok(layout.height <= BOX.h + 1e-6, `page ${page} is ${layout.height} tall`);
      const e = extentOf(layout);
      assert.ok(e.minX >= 0 && e.minY >= 0 && e.maxX <= BOX.w && e.maxY <= BOX.h, `page ${page} draws inside the box: ${JSON.stringify(e)}`);
      bands += layout.prims.filter((p) => p.kind === 'text' && p.text === labels.mark).length;
      assert.ok(layout.prims.some((p) => p.kind === 'text' && p.text === `${labels.title} (${page + 1}/${pages})`), 'the title says which page');
    }
    // No type lost or repeated: every mark is on exactly one page.
    const marks = Array.from({ length: pages }, (_, page) => layoutSchedule(data, labels, { ...OPTIONS, page }).prims.flatMap((p) => (p.kind === 'text' && /^[DW]\d+$/.test(p.text) ? [p.text] : [])));
    assert.deepEqual(marks.flat().sort(), data.entries.map((e) => e.mark).sort());
    assert.ok(bands > 1, 'more than one band (each carries its own mark row)');
  });

  it('keeps the scale: the pages are not shrunk to fit', () => {
    const data = manyTypes(40);
    const [first] = data.entries;
    const sizeAt = (maxHeight: number) => {
      const l = layoutSchedule(data, labels, { scale: 50, maxWidth: BOX.w, maxHeight, page: 0 });
      // The first card's elevation outline is drawn at 1000 / 50 mm per metre whatever the height given.
      return l.prims.flatMap((p) => (p.kind === 'text' && p.text === String(Math.round(first.width * 1000)) ? [p.size] : []))[0];
    };
    assert.equal(sizeAt(270), sizeAt(2000));
    assert.equal(layoutSchedule(data, labels, { ...OPTIONS, page: 0 }).prims.filter((p) => p.kind === 'text').every((p) => p.size >= 1.6), true);
  });

  it('re-wraps when the viewport is resized: narrower takes more pages, wider fewer', () => {
    const data = manyTypes(40);
    const wide = schedulePages(data, { scale: 50, maxWidth: 800, maxHeight: BOX.h });
    const normal = schedulePages(data, OPTIONS);
    const narrow = schedulePages(data, { scale: 50, maxWidth: 200, maxHeight: BOX.h });
    assert.ok(wide < normal && normal < narrow, `${wide} < ${normal} < ${narrow}`);
    for (const maxWidth of [200, 400, 800]) {
      const layout = layoutSchedule(data, labels, { scale: 50, maxWidth, maxHeight: BOX.h, page: 0 });
      assert.ok(layout.width <= maxWidth, `${layout.width} within ${maxWidth}`);
    }
    // A taller box holds more bands per page.
    assert.ok(schedulePages(data, { scale: 50, maxWidth: BOX.w, maxHeight: 2 * BOX.h }) < normal);
  });

  it('a small schedule is unchanged: one page, the layout it had without a box', () => {
    const data = manyTypes(8);
    const before = layoutSchedule(data, labels, { scale: 50 });
    const after = layoutSchedule(data, labels, { ...OPTIONS, page: 0 });
    assert.equal(after.pages, 1);
    assert.deepEqual(after.prims, before.prims);
    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    assert.ok(layoutSchedule(data, labels, { scale: 50 }).prims.some((p) => p.kind === 'text' && p.text === 'Doors and windows'), 'no page suffix on a single page');
  });

  it('keeps one band per page however small the box, and the minimum box holds one band whole', () => {
    const data = manyTypes(10);
    const min = scheduleMinBox(data, { scale: 50 });
    const layout = layoutSchedule(data, labels, { scale: 50, maxWidth: min.width, maxHeight: min.height, page: 0 });
    assert.ok(layout.width <= min.width && layout.height <= min.height, `${layout.width}x${layout.height} within ${min.width}x${min.height}`);
    assert.equal(layout.pages, 10, 'a card per band at the minimum width');
    assert.ok(schedulePages(data, { scale: 50, maxWidth: 10, maxHeight: 10 }) >= 1);
  });
});
