/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, third slice: a joinery schedule split into sub-reports. The content a sub-report lists is the engine's cut of the
 * model's rows (`scheduleDataOf`); each part keeps fitting the paper through the same layout as the whole schedule.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { layoutSchedule, schedulePages, type ScheduleLabels, type ScheduleLayout } from './schedule-layout';
import { scheduleDataOf } from './schedule-split';
import type { ScheduleData, ScheduleEntry } from './schedule-data';
import type { ProjectSchedule } from '@/project/types';

const labels: ScheduleLabels = {
  title: 'Doors and windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};
const LEVELS = ['Ground', 'Level 1', 'Level 2'];

/** `n` types, every third a door, with occurrences on the storeys, each element id unique across the schedule. */
function model(n: number): ScheduleData {
  let id = 0;
  return {
    levels: LEVELS,
    entries: Array.from({ length: n }, (_, i): ScheduleEntry => {
      const door = i % 3 === 0;
      const occurrences = Array.from({ length: 1 + (i % 3) }, (_, j) => ({ modelId: 'm', expressId: id++, globalId: `g${id}`, level: LEVELS[(i + j) % 3], tag: null, number: j + 1 }));
      const counts: Record<string, number> = {};
      for (const o of occurrences) counts[o.level] = (counts[o.level] ?? 0) + 1;
      return {
        key: `t${i}`, kind: door ? 'door' : 'window', spec: door ? defaultDoorSpec(`D${i}`) : defaultWindowSpec(`W${i}`), mark: `${door ? 'D' : 'W'}${i + 1}`, name: `Type ${i}`,
        width: 0.8 + (i % 5) * 0.2, height: door ? 2.1 : 1.5, counts, total: occurrences.length, occurrences,
      };
    }),
  };
}

const sched = (sub?: ProjectSchedule['sub']): Pick<ProjectSchedule, 'kind' | 'sub'> => ({ kind: 'all', sub });
const elementIds = (d: ScheduleData) => d.entries.flatMap((e) => e.occurrences.map((o) => `${o.modelId}:${o.expressId}`));

// An A3 landscape drawing area less the margins: about 400 x 270 mm.
const BOX = { w: 400, h: 270 };
const OPTIONS = { scale: 50, maxWidth: BOX.w, maxHeight: BOX.h };
const marksOnPages = (data: ScheduleData): string[] =>
  Array.from({ length: schedulePages(data, OPTIONS) }, (_, page) => layoutSchedule(data, labels, { ...OPTIONS, page }).prims.flatMap((p) => (p.kind === 'text' && /^[DW]\d+$/.test(p.text) ? [p.text] : []))).flat();
const fits = (l: ScheduleLayout) => l.width <= BOX.w + 1e-6 && l.height <= BOX.h + 1e-6;

describe('scheduleDataOf', () => {
  it('a schedule without a sub-report is the model\'s rows, whole (a project from before sub-reports)', () => {
    const whole = model(30);
    assert.equal(scheduleDataOf(sched(), () => whole), whole);
    assert.equal(scheduleDataOf({ kind: 'all' }, () => whole), whole);
  });

  it('asks the model for the parent\'s kind and cuts the part from it', () => {
    const asked: string[] = [];
    const part = scheduleDataOf({ kind: 'window', sub: { parent: 'p', filter: { levels: ['Ground'] } } }, (k) => { asked.push(k); return model(12); });
    assert.deepEqual(asked, ['window']);
    assert.deepEqual(part.levels, ['Ground']);
  });

  it('a partition into doors and windows lists every element exactly once, and the types once each', () => {
    const whole = model(60);
    const doors = scheduleDataOf(sched({ parent: 'p', filter: { kinds: ['door'] } }), () => whole);
    const windows = scheduleDataOf(sched({ parent: 'p', filter: { kinds: ['window'] } }), () => whole);
    assert.deepEqual([...elementIds(doors), ...elementIds(windows)].sort(), elementIds(whole).sort());
    assert.deepEqual([...doors.entries, ...windows.entries].map((e) => e.key).sort(), whole.entries.map((e) => e.key).sort());
  });

  it('a partition per storey lists every element exactly once, and a mark names the same element in the part and the whole', () => {
    const whole = model(60);
    const parts = LEVELS.map((level) => scheduleDataOf(sched({ parent: 'p', filter: { levels: [level] } }), () => whole));
    assert.deepEqual(parts.flatMap(elementIds).sort(), elementIds(whole).sort());
    const byKey = new Map(whole.entries.map((e) => [e.key, e]));
    for (const part of parts) for (const e of part.entries) for (const o of e.occurrences) {
      const same = byKey.get(e.key)!.occurrences.find((w) => w.expressId === o.expressId)!;
      assert.equal(o.number, same.number, `${e.mark}.${o.number}`);
    }
  });
});

describe('a sub-report keeps fitting the paper', () => {
  it('a sub-report spanning many types wraps and pages inside the box, every type on exactly one page', () => {
    const windows = scheduleDataOf(sched({ parent: 'p', filter: { kinds: ['window'] } }), () => model(120));
    assert.equal(windows.entries.length, 80);
    const pages = schedulePages(windows, OPTIONS);
    assert.ok(pages > 1, `80 window types take several pages (${pages})`);
    for (let page = 0; page < pages; page++) assert.ok(fits(layoutSchedule(windows, labels, { ...OPTIONS, page })), `page ${page} fits`);
    assert.deepEqual(marksOnPages(windows).sort(), windows.entries.map((e) => e.mark).sort());
  });

  it('every part of a partition fits, and the parts together print every type of the whole once', () => {
    const whole = model(90);
    const parts = LEVELS.map((level) => scheduleDataOf(sched({ parent: 'p', filter: { levels: [level] } }), () => whole));
    const marks: string[] = [];
    for (const part of parts) {
      const pages = schedulePages(part, OPTIONS);
      for (let page = 0; page < pages; page++) assert.ok(fits(layoutSchedule(part, labels, { ...OPTIONS, page })));
      marks.push(...marksOnPages(part));
    }
    // A type with elements on several storeys is on a page of each of those parts: the marks are those of the types, once per part that lists it.
    const expected = whole.entries.flatMap((e) => Object.keys(e.counts).map(() => e.mark));
    assert.deepEqual(marks.sort(), expected.sort());
  });

  it('a schedule that is not split lays out exactly as the engine lays out the rows (nothing changed for old projects)', () => {
    const whole = model(40);
    const viaSplit = scheduleDataOf(sched(), () => whole);
    for (let page = 0; page < schedulePages(whole, OPTIONS); page++) {
      assert.deepEqual(layoutSchedule(viaSplit, labels, { ...OPTIONS, page }), layoutSchedule(whole, labels, { ...OPTIONS, page }));
    }
  });
});
