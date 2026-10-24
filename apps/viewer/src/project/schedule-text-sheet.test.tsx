/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, section 4, on the Wall: text a user types into a joinery schedule's rows is keyed to the type, kept with the project
 * (sidecar and .bvproj), printed on the sheet through the same layout as the rest, and survives a model update. A type that
 * leaves the model keeps its text as an orphan the card shows and can remove.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { blur, cleanup, click, render, type as typeInto } from '@/test/render.js';
import { addSchedule, addSubReport, scheduleById } from '@/joinery/schedules.js';
import { addScheduleTextRow, removeScheduleTextCell, setScheduleTextCell } from '@/joinery/schedule-text-actions.js';
import { scheduleDataOf } from '@/joinery/schedule-split.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { ScheduleTextCard } from '@/components/viewer/wall/ScheduleTextCard';
import { textRowsOf } from '@bimvoice/ifcsheet';
import { buildPackage, readPackage, unzipPackage, zipPackage } from './package/package-io.js';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import type { ProjectDocument, ProjectSchedule, ProjectSheet } from './types.js';

const door = { ...defaultDoorSpec('D1'), id: 'd1', mark: 'D1', name: 'Interior door' };
const win = { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1', name: 'Fixed window' };
const win2 = { ...defaultWindowSpec('W2'), id: 'w2', mark: 'W2', name: 'Tilt window' };

const sheets = () => useProjectStore.getState().sheets;
const holder = (id: string): ProjectSheet => sheets().find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;
const textsOf = (l: { prims: { kind: string; text?: string }[] }) => l.prims.flatMap((p) => (p.kind === 'text' && p.text ? [p.text] : []));

function drawn(sheet: ProjectSheet) {
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  assert.ok(layouts);
  return layouts as ReturnType<typeof useSheetSchedules>;
}
const printed = (id: string) => drawn(holder(id)).get(id)!;
/** The x of a text on the layout. */
const xOf = (l: ReturnType<typeof printed>, text: string) => (l.prims.find((p) => p.kind === 'text' && p.text === text) as { x: number } | undefined)?.x;

/** A schedule with a Manufacturer row typed in for the door and one window. */
function typed(): { id: string; row: string } {
  useProjectStore.setState({ joineryTypes: [door, win, win2] });
  const id = addSchedule('all', 'Joinery');
  const row = addScheduleTextRow(id, 'Manufacturer')!;
  setScheduleTextCell(id, row, 'd1', 'Rehau', 'D1 Interior door');
  setScheduleTextCell(id, row, 'w1', 'Velux', 'W1 Fixed window');
  return { id, row };
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('typing text into a schedule', () => {
  it('is kept on the schedule, keyed by the type, with what the type was called', () => {
    const { id, row } = typed();
    assert.deepEqual(scheduleById(id)!.textRows, [{ id: row, label: 'Manufacturer', cells: { d1: { text: 'Rehau', about: 'D1 Interior door' }, w1: { text: 'Velux', about: 'W1 Fixed window' } } }]);
    assert.equal(useProjectStore.getState().dirty, true);
  });

  it('prints on the sheet under the right types, and clearing a cell removes it', () => {
    const { id, row } = typed();
    hangSchedule(id);
    const l = printed(id);
    assert.ok(textsOf(l).includes('Manufacturer'));
    assert.equal(xOf(l, 'Rehau'), xOf(l, 'D1'));
    assert.equal(xOf(l, 'Velux'), xOf(l, 'W1'));
    cleanup();
    setScheduleTextCell(id, row, 'd1', '', '');
    assert.equal(textsOf(printed(id)).includes('Rehau'), false);
  });

  it('a sub-report prints its parent\'s text, and typing on the part writes to the parent', () => {
    const { id, row } = typed();
    const doors = addSubReport(id, 'Doors', { kinds: ['door'] })!;
    hangSchedule(doors);
    const l = printed(doors);
    assert.ok(textsOf(l).includes('Rehau') && !textsOf(l).includes('Velux'), 'the door part prints the door\'s text only');
    cleanup();
    setScheduleTextCell(doors, row, 'd1', 'Schüco', 'D1');
    assert.equal(scheduleById(id)!.textRows![0].cells.d1.text, 'Schüco');
    assert.equal(scheduleById(doors)!.textRows, undefined, 'nothing is kept on the part');
    assert.equal(textRowsOf(useProjectStore.getState().schedules!, scheduleById(doors)!)![0].cells.d1.text, 'Schüco');
    assert.equal(scheduleDataOf(scheduleById(doors)!, () => ({ entries: [], levels: [] })).textRows![0].cells.d1.text, 'Schüco');
  });
});

describe('a model update', () => {
  it('types listed in another order, with a new one in front, keep their text', () => {
    const { id } = typed();
    hangSchedule(id);
    useProjectStore.setState({ joineryTypes: [win2, win, door] });
    const l = printed(id);
    assert.equal(xOf(l, 'Rehau'), xOf(l, 'D1'));
    assert.equal(xOf(l, 'Velux'), xOf(l, 'W1'));
    assert.notEqual(xOf(l, 'Rehau'), xOf(l, 'W2'));
  });

  it('a type that leaves the model keeps its text, which is not printed, and prints again when the type returns', () => {
    const { id } = typed();
    hangSchedule(id);
    useProjectStore.setState({ joineryTypes: [door, win2] });
    assert.equal(textsOf(printed(id)).includes('Velux'), false, 'no column for the orphan');
    assert.equal(scheduleById(id)!.textRows![0].cells.w1.text, 'Velux', 'still kept');
    cleanup();
    useProjectStore.setState({ joineryTypes: [door, win, win2] });
    assert.equal(xOf(printed(id), 'Velux'), xOf(printed(id), 'W1'));
  });
});

describe('the card', () => {
  const input = (view: HTMLElement, label: string) => view.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

  it('types into a cell and keeps it when the field is left', () => {
    useProjectStore.setState({ joineryTypes: [door, win] });
    const id = addSchedule('all', 'Joinery');
    const view = render(<ScheduleTextCard schedule={scheduleById(id)!} />);
    click([...view.querySelectorAll('button')].find((b) => b.textContent === '+ Add a text row')!);
    const row = scheduleById(id)!.textRows![0];
    assert.equal(row.label, 'Remarks');
    const field = input(view, 'Remarks, D1 Interior door');
    assert.ok(field, [...view.querySelectorAll('input')].map((i) => i.getAttribute('aria-label')).join('|'));
    typeInto(field, 'Fire door  ');
    blur(field);
    assert.equal(scheduleById(id)!.textRows![0].cells.d1.text, 'Fire door');
    assert.equal(scheduleById(id)!.textRows![0].cells.d1.about, 'D1 Interior door');
  });

  it('renames and removes a row', () => {
    const { id } = typed();
    const view = render(<ScheduleTextCard schedule={scheduleById(id)!} />);
    const name = input(view, 'Row name')!;
    typeInto(name, 'Maker');
    blur(name);
    assert.equal(scheduleById(id)!.textRows![0].label, 'Maker');
    click([...view.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Remove row')!);
    assert.equal(scheduleById(id)!.textRows, undefined, 'a schedule with no rows is an ordinary schedule again');
  });

  it('shows the text of a type that left the model as an orphan, and removes it on request', () => {
    const { id, row } = typed();
    useProjectStore.setState({ joineryTypes: [door, win2] });
    const view = render(<ScheduleTextCard schedule={scheduleById(id)!} />);
    assert.match(view.textContent ?? '', /Text for types no longer in the model/);
    assert.match(view.textContent ?? '', /Velux/);
    assert.match(view.textContent ?? '', /W1 Fixed window/);
    assert.equal(input(view, 'Manufacturer, W1 Fixed window'), null, 'an orphan is not an editable cell');
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Remove')!);
    assert.equal(scheduleById(id)!.textRows![0].cells.w1, undefined);
    assert.equal(scheduleById(id)!.textRows![0].cells.d1.text, 'Rehau', 'the other text is untouched');
    removeScheduleTextCell(id, row, 'nothing');
  });

  it('a type the part filters out is not an orphan', () => {
    const { id } = typed();
    const doors = addSubReport(id, 'Doors', { kinds: ['door'] })!;
    const view = render(<ScheduleTextCard schedule={scheduleById(doors)!} />);
    assert.doesNotMatch(view.textContent ?? '', /no longer in the model/);
    assert.ok(input(view, 'Manufacturer, D1 Interior door'));
    assert.equal(input(view, 'Manufacturer, W1 Fixed window'), null, 'the windows are not this part\'s');
  });

  it('offers nothing on a schedule that is not a joinery list', () => {
    const takeoff = addSchedule('materials', 'Takeoff');
    assert.equal(render(<ScheduleTextCard schedule={scheduleById(takeoff)!} />).textContent, '');
  });
});

describe('saving and reopening', () => {
  const base: ProjectDocument = parseProjectFile(serializeProject({} as ProjectDocument));
  const literal: ProjectSchedule = {
    id: 's1', name: 'Joinery', kind: 'all', createdAt: 5, scale: 50,
    textRows: [{ id: 'r1', label: 'Manufacturer', cells: { d1: { text: 'Rehau', about: 'D1 Interior door' }, 'untyped:door:900×2100': { text: 'Șantier ț ă', about: 'Door 900×2100' } } }],
  };

  it('a project saved before text cells reopens with its schedules exactly as they were', () => {
    const old = { ...JSON.parse(serializeProject(base)), schedules: [{ id: 's1', name: 'Joinery', kind: 'all', createdAt: 5, scale: 25 }] };
    assert.deepEqual(parseProjectFile(JSON.stringify(old)).schedules, [{ id: 's1', name: 'Joinery', kind: 'all', createdAt: 5, scale: 25 }]);
  });

  it('text survives the sidecar', () => {
    assert.deepEqual(parseProjectFile(serializeProject({ ...base, schedules: [literal] })).schedules, [literal]);
  });

  it('text survives the .bvproj package', async () => {
    const { files } = await buildPackage({ projectId: 'p', doc: { ...base, schedules: [literal] }, models: [] });
    const opened = await readPackage(unzipPackage(zipPackage(files)));
    assert.deepEqual(opened.doc.schedules, [literal]);
  });

  it('only a joinery list keeps text rows when loading', () => {
    const saved = { ...JSON.parse(serializeProject(base)), schedules: [{ id: 's3', name: 'Takeoff', kind: 'materials', createdAt: 1, textRows: literal.textRows }] };
    assert.equal(parseProjectFile(JSON.stringify(saved)).schedules?.[0]?.textRows, undefined);
  });
});
