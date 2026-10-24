/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, section 3, on the Wall: the content choice of a joinery schedule (which rows, in which order; how the type columns are sorted;
 * how types and elements are numbered) is kept on the schedule, applied before anything is printed, and the same on the sheet for a
 * schedule and for every part cut from it. A schedule saved without a choice prints exactly the table it always did.
 *
 * The tables below are written out by hand, row by row, as they print on the sheet: the label column, then one cell per type.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { act } from 'react';
import { blur, cleanup, click, render, type as typeInto } from '@/test/render.js';
import { addSchedule, addSubReport, scheduleById } from '@/joinery/schedules.js';
import { addScheduleTextRow, setScheduleTextCell } from '@/joinery/schedule-text-actions.js';
import { moveRow, resetContent, setNumbering, setRowShown, setSort } from '@/joinery/schedule-content-actions.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import type { ScheduleLayout, SchedulePrim } from '@/joinery/schedule-layout';
import { ScheduleContentCard } from '@/components/viewer/wall/ScheduleContentCard';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import type { ProjectSheet } from './types.js';

const door = { ...defaultDoorSpec('D1'), id: 'd1', mark: 'D1', name: 'Interior door', width: 0.9, height: 2.1 };
const win = { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1', name: 'Fixed window', width: 1.2, height: 1.2 };

const OPENING_W1 = 'Tilt and turn, hinges left + Side-hung, hinges right';
const OPENING_D1 = 'Leaf, hinges left';

const holder = (id: string): ProjectSheet => useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;

function drawn(sheet: ProjectSheet) {
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  assert.ok(layouts);
  return layouts as ReturnType<typeof useSheetSchedules>;
}
const printed = (id: string): ScheduleLayout => { const l = drawn(holder(id)).get(id)!; cleanup(); return l; };

type Text = Extract<SchedulePrim, { kind: 'text' }>;

/** The table as it prints: each row of the label column (x = 2) with the cells on its line, left to right. The drawings above the table are not part of it. */
function table(layout: ScheduleLayout): string[][] {
  const texts = layout.prims.filter((p): p is Text => p.kind === 'text');
  return texts.filter((t) => t.x === 2).sort((a, b) => a.y - b.y)
    .map((label) => [label.text, ...texts.filter((t) => t.x > 2 && t.y >= label.y - 0.01 && t.y <= label.y + 0.6).sort((a, b) => a.x - b.x).map((t) => t.text)]);
}

/** A joinery schedule over a door and a window of the catalogue, hung on a sheet of its own. */
function hung(): string {
  useProjectStore.setState({ joineryTypes: [door, win] });
  const id = addSchedule('all', 'Joinery');
  hangSchedule(id);
  return id;
}

/** Choose an option of a select the way a user does (React's change handler listens for the bubbling `change`). */
function change(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a schedule saved without a content choice', () => {
  it('prints the table it always did: name, size, opening, sill, total, U, fire, windows before doors', () => {
    const id = hung();
    assert.equal(scheduleById(id)!.content, undefined);
    assert.deepEqual(table(printed(id)), [
      ['Mark', 'W1', 'D1'],
      ['Name', 'Fixed window', 'Interior door'],
      ['Size W × H (mm)', '1200 × 1200', '900 × 2100'],
      ['Opening', OPENING_W1, OPENING_D1],
      ['Sill height (mm)', '900', '—'],
      ['Total', '0', '0'],
      ['U (W/m²K)', '1.1', '—'],
      ['Fire rating', '—', '—'],
    ]);
  });

  it('a project file without the field loads as that schedule, and saves without it', () => {
    const id = hung();
    const saved = JSON.parse(serializeProject(useProjectStore.getState()));
    assert.equal('content' in saved.schedules[0], false);
    resetProject();
    useProjectStore.setState({ joineryTypes: [door, win] });
    useProjectStore.setState({ schedules: parseProjectFile(JSON.stringify(saved)).schedules });
    assert.equal(scheduleById(id)!.content, undefined);
  });
});

describe('which rows, and in which order', () => {
  it('hides a row and moves another to the top; the band shrinks by the rows hidden', () => {
    const id = hung();
    const before = printed(id);
    setRowShown(id, 'operation', false);
    setRowShown(id, 'u', false);
    setRowShown(id, 'fire', false);
    for (let i = 0; i < 5; i++) moveRow(id, 'total', -1);
    const after = printed(id);
    assert.deepEqual(table(after), [
      ['Mark', 'W1', 'D1'],
      ['Total', '0', '0'],
      ['Name', 'Fixed window', 'Interior door'],
      ['Size W × H (mm)', '1200 × 1200', '900 × 2100'],
      ['Sill height (mm)', '900', '—'],
    ]);
    // Three rows of 6 mm fewer; the schedule still lies inside the box the sheet gave it.
    assert.equal(after.height, before.height - 3 * 6);
    assert.ok(after.fit && after.height <= after.fit.box.h && after.width <= after.fit.box.w);
  });

  it('shows a hidden row again, and the row comes back where the order puts it', () => {
    const id = hung();
    setRowShown(id, 'size', false);
    assert.equal(table(printed(id)).some((r) => r[0] === 'Size W × H (mm)'), false);
    setRowShown(id, 'size', true);
    assert.deepEqual(table(printed(id)).map((r) => r[0]), ['Mark', 'Name', 'Size W × H (mm)', 'Opening', 'Sill height (mm)', 'Total', 'U (W/m²K)', 'Fire rating']);
  });

  it('puts the text rows among the rows like any other, and prints one added afterwards at the end', () => {
    const id = hung();
    const maker = addScheduleTextRow(id, 'Manufacturer')!;
    setScheduleTextCell(id, maker, 'd1', 'Rehau', 'D1 Interior door');
    moveRow(id, `text:${maker}`, -1);
    moveRow(id, `text:${maker}`, -1);
    assert.deepEqual(table(printed(id)).map((r) => r[0]), ['Mark', 'Name', 'Size W × H (mm)', 'Opening', 'Sill height (mm)', 'Total', 'Manufacturer', 'U (W/m²K)', 'Fire rating']);
    assert.deepEqual(table(printed(id)).find((r) => r[0] === 'Manufacturer'), ['Manufacturer', 'Rehau']);
    addScheduleTextRow(id, 'Remarks');
    assert.equal(table(printed(id)).at(-1)![0], 'Remarks');
  });

  it('back to the default puts every row where it was', () => {
    const id = hung();
    setRowShown(id, 'name', false);
    moveRow(id, 'fire', -1);
    resetContent(id);
    assert.equal(scheduleById(id)!.content, undefined);
    assert.deepEqual(table(printed(id)).map((r) => r[0]), ['Mark', 'Name', 'Size W × H (mm)', 'Opening', 'Sill height (mm)', 'Total', 'U (W/m²K)', 'Fire rating']);
  });
});

describe('sort and numbering', () => {
  it('sorts the type columns, and the text under each follows its type', () => {
    const id = hung();
    const maker = addScheduleTextRow(id, 'Manufacturer')!;
    setScheduleTextCell(id, maker, 'd1', 'Rehau', 'D1 Interior door');
    setScheduleTextCell(id, maker, 'w1', 'Velux', 'W1 Fixed window');
    setSort(id, { by: 'size' });
    // 900 wide before 1200 wide.
    assert.deepEqual(table(printed(id)).filter((r) => ['Mark', 'Manufacturer'].includes(r[0])), [['Mark', 'D1', 'W1'], ['Manufacturer', 'Rehau', 'Velux']]);
    setSort(id, { by: 'size', descending: true });
    assert.deepEqual(table(printed(id)).filter((r) => ['Mark', 'Manufacturer'].includes(r[0])), [['Mark', 'W1', 'D1'], ['Manufacturer', 'Velux', 'Rehau']]);
    setSort(id, undefined);
    assert.equal(scheduleById(id)!.content, undefined, 'no sort and nothing else chosen is no choice');
  });

  it('marks the types in the order shown, from the chosen number', () => {
    const id = hung();
    setSort(id, { by: 'size' });
    setNumbering(id, { marks: 'sequence', typeStart: 7 });
    assert.deepEqual(table(printed(id))[0], ['Mark', 'D7', 'W7']);
    setNumbering(id, { typeStart: undefined });
    assert.deepEqual(table(printed(id))[0], ['Mark', 'D1', 'W1']);
    setNumbering(id, { marks: undefined });
    assert.deepEqual(table(printed(id))[0], ['Mark', 'D1', 'W1']);
    assert.deepEqual(scheduleById(id)!.content, { sort: { by: 'size' } });
  });

  it('a part prints the marks of its parent\'s numbering, the same as the whole', () => {
    const id = hung();
    setSort(id, { by: 'size' });
    setNumbering(id, { marks: 'sequence', typeStart: 7 });
    const doors = addSubReport(id, 'Doors', { kinds: ['door'] })!;
    const windows = addSubReport(id, 'Windows', { kinds: ['window'] })!;
    hangSchedule(doors);
    hangSchedule(windows);
    assert.deepEqual(table(printed(id))[0], ['Mark', 'D7', 'W7']);
    assert.deepEqual(table(printed(doors))[0], ['Mark', 'D7']);
    assert.deepEqual(table(printed(windows))[0], ['Mark', 'W7']);
  });

  it('a part prints its parent\'s rows, and the card edits them on the parent', () => {
    const id = hung();
    const doors = addSubReport(id, 'Doors', { kinds: ['door'] })!;
    hangSchedule(doors);
    setRowShown(doors, 'fire', false);
    assert.deepEqual(scheduleById(id)!.content, { rows: { hidden: ['fire'] } });
    assert.equal(scheduleById(doors)!.content, undefined, 'nothing is kept on the part');
    assert.equal(table(printed(doors)).some((r) => r[0] === 'Fire rating'), false);
    assert.equal(table(printed(id)).some((r) => r[0] === 'Fire rating'), false);
  });
});

describe('the choice is kept with the project', () => {
  it('survives save and reopen, and prints the same table', () => {
    const id = hung();
    setRowShown(id, 'u', false);
    moveRow(id, 'total', -1);
    setSort(id, { by: 'count', descending: true });
    setNumbering(id, { marks: 'sequence', typeStart: 4, elementStart: 0 });
    const content = scheduleById(id)!.content;
    const printedBefore = table(printed(id));
    const saved = serializeProject(useProjectStore.getState());
    resetProject();
    useProjectStore.setState({ joineryTypes: [door, win] });
    useProjectStore.setState({ schedules: parseProjectFile(saved).schedules, sheets: parseProjectFile(saved).sheets });
    assert.deepEqual(scheduleById(id)!.content, content);
    assert.deepEqual(table(printed(id)), printedBefore);
  });
});

describe('the card', () => {
  const box = (view: HTMLElement, label: string) => [...view.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) => i.closest('label')?.textContent === label)!;
  const button = (view: HTMLElement, label: string) => view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it('lists every row, shown, in the order they print', () => {
    const id = hung();
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    assert.deepEqual([...view.querySelectorAll('ul li label')].map((l) => l.textContent), ['Name', 'Size W × H (mm)', 'Opening', 'Sill height (mm)', 'Count per level', 'Total', 'U (W/m²K)', 'Fire rating']);
    assert.ok([...view.querySelectorAll<HTMLInputElement>('ul input[type="checkbox"]')].every((i) => i.checked));
  });

  it('hides and moves a row, and the schedule keeps it', () => {
    const id = hung();
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    click(box(view, 'Opening'));
    assert.deepEqual(scheduleById(id)!.content, { rows: { hidden: ['operation'] } });
    click(button(view, 'Move Total up'));
    assert.deepEqual(scheduleById(id)!.content!.rows!.order!.slice(0, 6), ['name', 'size', 'operation', 'sill', 'total', 'levels']);
  });

  it('sorts, reverses, and numbers', () => {
    const id = hung();
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    const selects = view.querySelectorAll<HTMLSelectElement>('select');
    change(selects[0], 'size');
    assert.deepEqual(scheduleById(id)!.content, { sort: { by: 'size' } });
    click(box(view, 'Reverse'));
    assert.deepEqual(scheduleById(id)!.content!.sort, { by: 'size', descending: true });
    change(selects[1], 'sequence');
    const first = view.querySelector<HTMLInputElement>('input[aria-label="First type no."]')!;
    typeInto(first, '12');
    blur(first);
    const element = view.querySelector<HTMLInputElement>('input[aria-label="First element no."]')!;
    typeInto(element, '3');
    blur(element);
    assert.deepEqual(scheduleById(id)!.content!.numbering, { marks: 'sequence', typeStart: 12, elementStart: 3 });
    typeInto(first, '-3');
    blur(first);
    assert.equal(scheduleById(id)!.content!.numbering!.typeStart, 12, 'what is not a whole number from 0 is not kept');
  });

  it('a part says whose choice it is', () => {
    const id = hung();
    const doors = addSubReport(id, 'Doors', { kinds: ['door'] })!;
    const view = render(<ScheduleContentCard schedule={scheduleById(doors)!} />);
    assert.match(view.textContent!, /Chosen on Joinery, the schedule this part is cut from\./);
    click(box(view, 'Fire rating'));
    assert.deepEqual(scheduleById(id)!.content, { rows: { hidden: ['fire'] } });
  });

  it('is not shown for a schedule that is not a joinery list', () => {
    const id = addSchedule('materials', 'Takeoff');
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    assert.equal(view.textContent, '');
  });
});
