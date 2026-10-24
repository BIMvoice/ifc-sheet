/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, third slice, on the sheets and the Wall: a joinery schedule is split into sub-reports from its card; each part is hung like
 * any schedule, fits the paper through `layoutJoineryOnSheet`, and the choices made on the card change what prints.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { cleanup, click, render } from '@/test/render.js';
import { addSchedule, addSubReport, scheduleById, setSubReportFilter, splitByKind, splitByLevel, toggled } from '@/joinery/schedules.js';
import { scheduleDataOf } from '@/joinery/schedule-split.js';
import type { ScheduleData, ScheduleEntry } from '@/joinery/schedule-data.js';
import type { ScheduleLabels } from '@/joinery/schedule-layout.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import type { ProjectSheet } from './types.js';
import { SubReportCard } from '@/components/viewer/wall/SubReportCard';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { frameOf, frameRect } from './sheet-frame.js';
import { paperOf } from './sheets.js';
import { layoutJoineryOnSheet, pagesIn, syncSchedulePages } from './schedule-fit.js';
import { sheetDrawingArea } from './viewport-resize.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import type { ProjectDocument, ProjectSchedule } from './types.js';

const labels: ScheduleLabels = {
  locale: 'en', title: 'T', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: (op) => op,
};
const LEVELS = ['Ground', 'Level 1'];

function model(n: number): ScheduleData {
  let id = 0;
  return {
    levels: LEVELS,
    entries: Array.from({ length: n }, (_, i): ScheduleEntry => {
      const door = i % 2 === 0;
      const occurrences = Array.from({ length: 2 }, (_, j) => ({ modelId: 'm', expressId: id++, globalId: `g${id}`, level: LEVELS[j], tag: null, number: j + 1 }));
      return {
        key: `t${i}`, kind: door ? 'door' : 'window', spec: door ? defaultDoorSpec(`D${i}`) : defaultWindowSpec(`W${i}`), mark: `${door ? 'D' : 'W'}${i + 1}`, name: `Type ${i}`,
        width: 0.8 + (i % 5) * 0.2, height: door ? 2.1 : 1.5, counts: { Ground: 1, 'Level 1': 1 }, total: 2, occurrences,
      };
    }),
  };
}

const sheets = () => useProjectStore.getState().sheets;
const holders = (id: string) => sheets().filter((s) => (s.viewports ?? []).some((v) => v.viewId === id)).sort((a, b) => a.number.localeCompare(b.number));

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a sub-report on the sheets', () => {
  it('is hung like any schedule, shows its part, and continues on A-6xx.1… inside the frame when the part is large', () => {
    const whole = model(160);
    const parent = addSchedule('all', 'Joinery');
    const windows = addSubReport(parent, 'Windows', { kinds: ['window'] });
    assert.ok(windows);
    assert.ok(hangSchedule(windows, whole));
    const sub = scheduleById(windows)!;
    const part = scheduleDataOf(sub, () => whole);
    assert.equal(part.entries.length, 80);
    const [first] = holders(windows);
    const area = sheetDrawingArea(first);
    assert.equal(holders(windows).length, pagesIn(part, 50, area), 'hanging counted the sheets from the part, not from the whole schedule');
    syncSchedulePages(windows, layoutJoineryOnSheet({ data: part, labels, scale: 50, sheets: sheets(), sheet: first, vp: first.viewports![0] }).pages!);
    const held = holders(windows);
    assert.ok(held.length > 1, `80 window types continue on further sheets (${held.length})`);
    const marks: string[] = [];
    for (const sheet of held) {
      const layout = layoutJoineryOnSheet({ data: part, labels, scale: 50, sheets: sheets(), sheet, vp: sheet.viewports![0] });
      const frame = frameRect(paperOf(sheet), frameOf(sheet));
      const box = layout.fit!.box;
      assert.ok(box.x >= frame.x - 1e-6 && box.y >= frame.y - 1e-6 && box.x + box.w <= frame.x + frame.w + 1e-6 && box.y + box.h <= frame.y + frame.h + 1e-6, `${sheet.number}: the box lies in the frame`);
      assert.ok(layout.width <= area.w + 1e-6 && layout.height <= area.h + 1e-6, `${sheet.number}: ${layout.width}x${layout.height} in ${area.w}x${area.h}`);
      marks.push(...layout.prims.flatMap((p) => (p.kind === 'text' && /^W\d+$/.test(p.text) ? [p.text] : [])));
    }
    assert.deepEqual(marks.sort(), part.entries.map((e) => e.mark).sort(), 'every window type on exactly one sheet');
    assert.equal(marks.some((m) => m.startsWith('D')), false, 'no door in the windows');
  });

  it('a parent hung beside its parts is untouched by them', () => {
    const whole = model(10);
    const parent = addSchedule('all', 'Joinery');
    hangSchedule(parent, whole);
    const [parentSheet] = holders(parent);
    const before = layoutJoineryOnSheet({ data: scheduleDataOf(scheduleById(parent)!, () => whole), labels, scale: 50, sheets: sheets(), sheet: parentSheet, vp: parentSheet.viewports![0] });
    for (const id of splitByKind(parent, { door: 'Doors', window: 'Windows' })) hangSchedule(id, whole);
    const after = layoutJoineryOnSheet({ data: scheduleDataOf(scheduleById(parent)!, () => whole), labels, scale: 50, sheets: sheets(), sheet: holders(parent)[0], vp: holders(parent)[0].viewports![0] });
    assert.deepEqual(after.prims, before.prims);
    assert.equal(scheduleDataOf(scheduleById(parent)!, () => whole).entries.length, 10);
  });
});

/** The layouts the Wall draws on `sheet` (`useSheetSchedules`), the path every placed schedule's content goes through. */
function drawn(sheet: ProjectSheet) {
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  assert.ok(layouts);
  return layouts as ReturnType<typeof useSheetSchedules>;
}
const textsOf = (l: { prims: { kind: string; text?: string }[] }) => l.prims.flatMap((p) => (p.kind === 'text' && p.text ? [p.text] : []));

describe('what the Wall draws for a sub-report', () => {
  it('a part prints its own types only, and its parent still prints all of them', () => {
    useProjectStore.setState({ joineryTypes: [{ ...defaultDoorSpec('D1'), id: 'd1', mark: 'D1' }, { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1' }] });
    const parent = addSchedule('all', 'Joinery');
    const [doors, windows] = splitByKind(parent, { door: 'Doors', window: 'Windows' });
    for (const id of [parent, doors, windows]) hangSchedule(id);
    const layoutOn = (id: string) => { const sheet = holders(id)[0]; return drawn(sheet).get(id)!; };
    const doorTexts = textsOf(layoutOn(doors)), windowTexts = textsOf(layoutOn(windows)), allTexts = textsOf(layoutOn(parent));
    assert.ok(doorTexts.includes('D1') && !doorTexts.includes('W1'), `doors: ${doorTexts}`);
    assert.ok(windowTexts.includes('W1') && !windowTexts.includes('D1'), `windows: ${windowTexts}`);
    assert.ok(allTexts.includes('D1') && allTexts.includes('W1'), `whole: ${allTexts}`);
  });
});

describe('sub-report actions', () => {
  it('split by kind and by storey make parts with the parent\'s kind and scale, naming it as their parent', () => {
    const parent = addSchedule('all', 'Joinery');
    const [doors, windows] = splitByKind(parent, { door: 'Doors', window: 'Windows' });
    assert.deepEqual(scheduleById(doors)!.sub, { parent, filter: { kinds: ['door'] } });
    assert.deepEqual(scheduleById(windows)!.sub, { parent, filter: { kinds: ['window'] } });
    assert.equal(scheduleById(doors)!.kind, 'all');
    assert.equal(scheduleById(doors)!.scale, 50);
    const levels = splitByLevel(parent, ['Ground', 'Level 1']);
    assert.deepEqual(levels.map((id) => scheduleById(id)!.name), ['Ground', 'Level 1']);
  });

  it('only a joinery schedule that is not itself a part can be split', () => {
    const takeoff = addSchedule('materials', 'Takeoff');
    assert.equal(addSubReport(takeoff, 'x', {}), null);
    assert.equal(addSubReport('missing', 'x', {}), null);
    const parent = addSchedule('all', 'Joinery');
    const part = addSubReport(parent, 'Part', {})!;
    assert.equal(addSubReport(part, 'Nested', {}), null);
  });

  it('toggling a value starts from "everything" and comes back', () => {
    assert.deepEqual(toggled(undefined, 'a', ['a', 'b', 'c']), ['b', 'c']);
    assert.deepEqual(toggled(['b', 'c'], 'a', ['a', 'b', 'c']), ['a', 'b', 'c']);
    assert.deepEqual(toggled(['b'], 'b', ['a', 'b', 'c']), []);
  });

  it('setSubReportFilter changes one dimension and `undefined` lifts it', () => {
    const parent = addSchedule('all', 'Joinery');
    const part = addSubReport(parent, 'Part', { kinds: ['door'], levels: ['Ground'] })!;
    setSubReportFilter(part, { levels: undefined, types: ['t1'] });
    assert.deepEqual(scheduleById(part)!.sub!.filter, { kinds: ['door'], types: ['t1'] });
  });
});

describe('the Wall card', () => {
  it('splits a joinery schedule into doors and windows, each hung on a sheet of its own', () => {
    const parent = addSchedule('all', 'Joinery');
    const view = render(<SubReportCard schedule={scheduleById(parent)!} />);
    const button = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Doors and windows apart');
    assert.ok(button, 'the card offers the split');
    click(button);
    const parts = (useProjectStore.getState().schedules ?? []).filter((s) => s.sub);
    assert.deepEqual(parts.map((p) => [p.name, p.sub!.filter]), [['Doors', { kinds: ['door'] }], ['Windows', { kinds: ['window'] }]]);
    for (const p of parts) assert.equal(holders(p.id).length, 1, `${p.name} is on a sheet`);
  });

  it('a sub-report\'s card chooses its kinds', () => {
    const parent = addSchedule('all', 'Joinery');
    const part = addSubReport(parent, 'Part', {})!;
    const view = render(<SubReportCard schedule={scheduleById(part)!} />);
    const doors = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Doors');
    assert.ok(doors);
    assert.equal(doors.getAttribute('aria-pressed'), 'true', 'a part with no restriction keeps both kinds');
    click(doors);
    assert.deepEqual(scheduleById(part)!.sub!.filter, { kinds: ['window'] });
  });

  it('lists, to pick from, only the types of the kinds the sub-report keeps', () => {
    useProjectStore.setState({ joineryTypes: [{ ...defaultDoorSpec('D1'), id: 'd1', mark: 'D1' }, { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1' }] });
    const parent = addSchedule('all', 'Joinery');
    const part = addSubReport(parent, 'Doors', { kinds: ['door'] })!;
    const view = render(<SubReportCard schedule={scheduleById(part)!} />);
    const labelsShown = [...view.querySelectorAll('li label')].map((l) => l.textContent ?? '');
    assert.equal(labelsShown.length, 1, labelsShown.join('|'));
    assert.match(labelsShown[0], /^D1 /);
    assert.match(view.textContent ?? '', /1 of 1 types/);
  });

  it('offers nothing on a takeoff', () => {
    const takeoff = addSchedule('materials', 'Takeoff');
    const view = render(<SubReportCard schedule={scheduleById(takeoff)!} />);
    assert.equal(view.textContent, '');
  });
});

describe('saving and reopening', () => {
  const base: ProjectDocument = parseProjectFile(serializeProject({} as ProjectDocument));

  it('a project saved before sub-reports reopens with its schedules exactly as they were', () => {
    const old = { ...JSON.parse(serializeProject(base)), schedules: [{ id: 's1', name: 'Joinery', kind: 'all', createdAt: 5, scale: 25 }] };
    const reopened = parseProjectFile(JSON.stringify(old));
    assert.deepEqual(reopened.schedules, [{ id: 's1', name: 'Joinery', kind: 'all', createdAt: 5, scale: 25 }]);
  });

  it('a sub-report survives save and reopen, with its filter', () => {
    const part: ProjectSchedule = { id: 's2', name: 'Ground windows', kind: 'all', createdAt: 6, scale: 50, sub: { parent: 's1', filter: { kinds: ['window'], levels: ['Ground'], types: ['t1'] } } };
    const reopened = parseProjectFile(serializeProject({ ...base, schedules: [part] }));
    assert.deepEqual(reopened.schedules, [part]);
  });

  it('a sub-report on a kind that cannot be split loads as an ordinary schedule', () => {
    const saved = { ...JSON.parse(serializeProject(base)), schedules: [{ id: 's3', name: 'Takeoff', kind: 'materials', createdAt: 1, sub: { parent: 's1', filter: { levels: ['Ground'] } } }] };
    assert.equal(parseProjectFile(JSON.stringify(saved)).schedules?.[0]?.sub, undefined);
  });
});
