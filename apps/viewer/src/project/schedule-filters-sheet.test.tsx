/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, section 3, on the Wall: the filters of a sub-report and of a whole schedule (by IFC class, predefined type and property), the
 * "Exterior and interior apart" split, and the choice of the symbols in the header cells. All are kept on the schedule and survive a
 * save and reopen; a project saved before them loads and saves unchanged. What the filters keep from a model is pinned in the engine
 * (`schedule-filter.test.ts`) and in `check/project-filters-parity.test.tsx`; this is the card and the sheet.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { act } from 'react';
import { cleanup, click, render, type as typeInto } from '@/test/render.js';
import { addSchedule, addSubReport, scheduleById } from '@/joinery/schedules.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import type { ScheduleLayout, SchedulePrim } from '@/joinery/schedule-layout';
import { ScheduleContentCard } from '@/components/viewer/wall/ScheduleContentCard';
import { SubReportCard } from '@/components/viewer/wall/SubReportCard';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import type { ProjectSheet } from './types.js';

const door = { ...defaultDoorSpec('D1'), id: 'd1', mark: 'D1', name: 'Interior door', width: 0.9, height: 2.1 };
const win = { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1', name: 'Fixed window', width: 1.2, height: 1.2 };

const holder = (id: string): ProjectSheet => useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;
function printed(id: string): ScheduleLayout {
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(holder(id)); return null; }
  render(<Probe />);
  const l = (layouts as unknown as ReturnType<typeof useSheetSchedules>).get(id)!;
  cleanup();
  return l;
}
type Text = Extract<SchedulePrim, { kind: 'text' }>;
const texts = (l: ScheduleLayout): string[] => l.prims.filter((p): p is Text => p.kind === 'text').map((p) => p.text);
/** The paths of the layout: the frame of each band, and the drawings of the cells. */
const drawings = (l: ScheduleLayout): number => l.prims.filter((p) => p.kind === 'path').length;

function hung(): string {
  useProjectStore.setState({ joineryTypes: [door, win] });
  const id = addSchedule('all', 'Joinery');
  hangSchedule(id);
  return id;
}

const buttonWith = (view: HTMLElement, label: string) => [...view.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;
const box = (view: HTMLElement, label: string) => [...view.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) => i.closest('label')?.textContent === label)!;
const field = (view: HTMLElement, label: string) => [...view.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')].find((i) => i.closest('label')?.textContent?.startsWith(label))!;
function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('Exterior and interior apart', () => {
  it('is offered on a joinery schedule and makes two parts, a partition by IsExternal, each hung on a sheet', () => {
    const parent = addSchedule('all', 'Joinery');
    const view = render(<SubReportCard schedule={scheduleById(parent)!} />);
    click(buttonWith(view, 'Exterior and interior apart'));
    const parts = (useProjectStore.getState().schedules ?? []).filter((s) => s.sub);
    assert.deepEqual(parts.map((p) => [p.name, p.sub!.filter]), [
      ['Exterior', { properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] }],
      ['Interior', { properties: [{ name: 'IsExternal', op: 'notEquals', value: 'true' }] }],
    ]);
    for (const p of parts) assert.ok(holder(p.id), `${p.name} is on a sheet`);
  });
});

describe('the filter card of a sub-report', () => {
  it('adds a property test, keeps it with the part, and removes it again', () => {
    const parent = addSchedule('all', 'Joinery');
    const part = addSubReport(parent, 'Part', { kinds: ['door'] })!;
    // The card takes its schedule as a prop, as on the Wall, where the viewport card renders it again from the store after each change.
    let view = render(<SubReportCard schedule={scheduleById(part)!} />);
    const again = () => { cleanup(); view = render(<SubReportCard schedule={scheduleById(part)!} />); };
    assert.ok(buttonWith(view, '+ Add test').disabled, 'nothing to add before a property is named');
    typeInto(field(view, 'Property') as HTMLInputElement, 'FireRating');
    choose(field(view, 'Test') as HTMLSelectElement, 'present');
    assert.ok((field(view, 'Value') as HTMLInputElement).disabled, 'a test for presence has no value');
    click(buttonWith(view, '+ Add test'));
    assert.deepEqual(scheduleById(part)!.sub!.filter, { kinds: ['door'], properties: [{ name: 'FireRating', op: 'present' }] });
    again();

    typeInto(field(view, 'Property') as HTMLInputElement, 'IsExternal');
    typeInto(field(view, 'Set') as HTMLInputElement, 'Pset_DoorCommon');
    choose(field(view, 'Test') as HTMLSelectElement, 'notEquals');
    typeInto(field(view, 'Value') as HTMLInputElement, 'true');
    click(buttonWith(view, '+ Add test'));
    assert.deepEqual(scheduleById(part)!.sub!.filter.properties, [
      { name: 'FireRating', op: 'present' },
      { pset: 'Pset_DoorCommon', name: 'IsExternal', op: 'notEquals', value: 'true' },
    ]);

    again();
    assert.deepEqual([...view.querySelectorAll('li span')].map((s) => s.textContent), ['FireRating has a value', 'Pset_DoorCommon.IsExternal is not true']);
    click(view.querySelector<HTMLButtonElement>('button[aria-label="Remove the test FireRating has a value"]')!);
    assert.deepEqual(scheduleById(part)!.sub!.filter.properties, [{ pset: 'Pset_DoorCommon', name: 'IsExternal', op: 'notEquals', value: 'true' }]);
    again();
    click(buttonWith(view, 'Clear the filter'));
    assert.deepEqual(scheduleById(part)!.sub!.filter, { kinds: ['door'] }, 'the kinds, which have their own control, are kept');
  });

  it('survives a save and a reopen', () => {
    const parent = addSchedule('all', 'Joinery');
    const filter = { classes: ['IfcDoor'], predefined: ['GATE'], properties: [{ name: 'IsExternal', op: 'equals' as const, value: 'true' }] };
    const part = addSubReport(parent, 'Gates', filter)!;
    const saved = serializeProject(useProjectStore.getState());
    resetProject();
    useProjectStore.setState({ schedules: parseProjectFile(saved).schedules });
    assert.deepEqual(scheduleById(part)!.sub!.filter, filter);
  });
});

describe('the filter of a whole schedule', () => {
  it('is on the schedule\'s content card and not on a part\'s, which prints its parent\'s', () => {
    const parent = addSchedule('all', 'Joinery');
    const part = addSubReport(parent, 'Part', {})!;
    const onParent = render(<ScheduleContentCard schedule={scheduleById(parent)!} />);
    assert.match(onParent.textContent ?? '', /What this schedule lists/);
    typeInto(field(onParent, 'Property') as HTMLInputElement, 'IsExternal');
    typeInto(field(onParent, 'Value') as HTMLInputElement, 'true');
    click(buttonWith(onParent, '+ Add test'));
    assert.deepEqual(scheduleById(parent)!.content, { filter: { properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] } });
    cleanup();
    const onPart = render(<ScheduleContentCard schedule={scheduleById(part)!} />);
    assert.doesNotMatch(onPart.textContent ?? '', /What this schedule lists/);
  });

  it('clearing it leaves no content behind', () => {
    const parent = addSchedule('all', 'Joinery');
    const view = render(<ScheduleContentCard schedule={scheduleById(parent)!} />);
    typeInto(field(view, 'Property') as HTMLInputElement, 'IsExternal');
    choose(field(view, 'Test') as HTMLSelectElement, 'present');
    click(buttonWith(view, '+ Add test'));
    assert.ok(scheduleById(parent)!.content?.filter);
    click(buttonWith(view, 'Clear the filter'));
    assert.equal(scheduleById(parent)!.content, undefined);
  });
});

describe('the symbols in the header cells', () => {
  // The dimension texts: the width and height of each type. The window's 900 mm sill is a table cell and stays.
  const dimensions = ['2100', '1200'];
  it('the elevation toggle takes the drawings and the dimensions off the sheet and keeps the table', () => {
    const id = hung();
    const before = printed(id);
    assert.ok(dimensions.every((d) => texts(before).includes(d)) && texts(before).filter((t) => t === '900').length === 2 && drawings(before) > 10);
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    assert.equal(box(view, 'Elevation').checked, true);
    click(box(view, 'Elevation'));
    assert.deepEqual(scheduleById(id)!.content, { symbols: { elevation: false } });
    const after = printed(id);
    assert.ok(dimensions.every((d) => !texts(after).includes(d)), `no dimension lines: ${texts(after).join('|')}`);
    assert.equal(drawings(after), 1, 'the frame of the one band is all that is left');
    const rest = texts(before).filter((t) => !dimensions.includes(t));
    rest.splice(rest.lastIndexOf('900'), 1); // the door's width, drawn after the window's sill cell
    assert.deepEqual(texts(after), rest, 'every other text, in the same order');
    assert.ok(after.height < before.height);
  });

  it('shows it again and the schedule is the one it was, with no content saved', () => {
    const id = hung();
    const before = printed(id);
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    click(box(view, 'Elevation'));
    click(box(view, 'Elevation'));
    assert.equal(scheduleById(id)!.content, undefined);
    assert.deepEqual(printed(id), before);
  });

  it('is kept with the project: saved, reopened, and printed the same', () => {
    const id = hung();
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    click(box(view, 'Plan'));
    click(box(view, 'Elevation'));
    cleanup();
    const content = { symbols: { elevation: false, plan: false } };
    assert.deepEqual(scheduleById(id)!.content, content);
    const printedBefore = printed(id);
    const saved = serializeProject(useProjectStore.getState());
    resetProject();
    useProjectStore.setState({ joineryTypes: [door, win] });
    const doc = parseProjectFile(saved);
    useProjectStore.setState({ schedules: doc.schedules, sheets: doc.sheets });
    assert.deepEqual(scheduleById(id)!.content, content);
    assert.deepEqual(printed(id), printedBefore);
  });

  it('a part prints its parent\'s choice', () => {
    const parent = hung();
    const part = addSubReport(parent, 'Doors', { kinds: ['door'] })!;
    hangSchedule(part);
    const view = render(<ScheduleContentCard schedule={scheduleById(part)!} />);
    click(box(view, 'Elevation'));
    assert.deepEqual(scheduleById(parent)!.content, { symbols: { elevation: false } });
    assert.equal(scheduleById(part)!.content, undefined);
    assert.equal(drawings(printed(part)), 1, 'the frame of the one band is all that is left');
  });
});

describe('a project saved before the filters and the symbols', () => {
  it('loads and saves without a new field', () => {
    const parent = addSchedule('all', 'Joinery');
    addSubReport(parent, 'Doors', { kinds: ['door'], levels: ['Ground'], types: ['d1'] });
    const saved = JSON.parse(serializeProject(useProjectStore.getState()));
    for (const s of saved.schedules) {
      assert.equal('content' in s, false);
      if (s.sub) assert.deepEqual(Object.keys(s.sub.filter).sort(), ['kinds', 'levels', 'types']);
    }
    const again = JSON.parse(serializeProject({ ...useProjectStore.getState(), schedules: parseProjectFile(JSON.stringify(saved)).schedules }));
    assert.deepEqual(again.schedules, saved.schedules);
  });
});
