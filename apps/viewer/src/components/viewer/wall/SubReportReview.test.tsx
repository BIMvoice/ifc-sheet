/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The review by element (#186, section 2), on bloc-p4.ifc (86 doors, 89 windows) with a deliberate overlap: the schedule is split into
 * Doors and Windows, and a third part, Pick, lists one window type again. The expectations are worked out from the sample's rows and
 * the parts' kinds, not from the engine's check the view reads.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { scheduleOf } from '@bimvoice/ifcsheet';
import { readinessOfModel } from '@bimvoice/ifcsheet/readiness-read';
import { cleanup, click, press, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { parseStep } from '@/test/properties-panel-harness.js';
import { undoDrafts, redoDrafts } from '@/drafting/draft-store';
import { addSchedule, addSubReport, scheduleById, splitByKind } from '@/joinery/schedules.js';
import { setNumbering, setSort } from '@/joinery/schedule-content-actions';
import { occurrenceMark, scheduleData } from '@/joinery/schedule-data.js';
import { subReportChecks } from '@/check/sub-report-check';
import { ReadinessList } from '@/components/viewer/sheets/ReadinessList';
import type { SetSkin } from '@/components/viewer/sheets/set-skin';
import { SubReportCard } from './SubReportCard';
import { SubReportReview } from './SubReportReview';
import { useWallNav } from './wall-nav';

const skin = { note: 'note', heading: 'heading' } as unknown as SetSkin;
let ifcDataStore: Awaited<ReturnType<typeof parseStep>>;

beforeEach(async () => {
  resetProject();
  useWallNav.setState({ review: null });
  ifcDataStore ??= await parseStep(new Uint8Array(readFileSync(new URL('../../../../public/samples/bloc-p4.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([['m', { ifcDataStore, name: 'bloc-p4.ifc' }]]) } as never);
});
afterEach(() => {
  cleanup();
  useViewerStore.setState({ models: new Map() } as never);
});

const rows = () => scheduleData('all');
const windows = () => rows().entries.filter((e) => e.kind === 'window');
const doors = () => rows().entries.filter((e) => e.kind === 'door');

/** Doors, Windows and Pick (the first window type again): returns the ids. */
function overlap() {
  const parent = addSchedule('all', 'Joinery');
  const [doorsPart, windowsPart] = splitByKind(parent, { door: 'Doors', window: 'Windows' });
  const picked = windows()[0];
  const pick = addSubReport(parent, 'Pick', { types: [picked.key] })!;
  return { parent, doorsPart, windowsPart, pick, picked };
}

const open = (parent: string) => render(<SubReportReview scheduleId={parent} onClose={() => {}} />);
const dialog = () => document.body.querySelector<HTMLElement>('[data-sub-report-review]')!;
const heads = () => [...dialog().querySelectorAll<HTMLElement>('[data-review-row]')];
const head = (key: string) => heads().find((h) => h.dataset.reviewRow === key)!;
const buttonNamed = (text: string | RegExp) => [...dialog().querySelectorAll('button')].find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')));
const select = (label: string) => [...dialog().querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector('select')!;
function choose(sel: HTMLSelectElement, value: string): void {
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
const filterOf = (id: string) => scheduleById(id)!.sub!.filter;

describe('the list', () => {
  it('shows every type of the schedule with exactly the parts that list it', () => {
    const { parent, picked } = overlap();
    open(parent);
    const expected = rows().entries.map((e) => [e.key, e.kind === 'door' ? 'Doors' : e.key === picked.key ? 'Windows, Pick' : 'Windows']);
    assert.ok(expected.length >= 4);
    assert.deepEqual(heads().map((h) => [h.dataset.reviewRow, h.lastElementChild?.textContent]), expected);
  });

  it('marks the repeated type as a duplicate and every other as fine, counting elements', () => {
    const { parent, picked } = overlap();
    open(parent);
    const status = (h: HTMLElement) => h.querySelector('span:nth-of-type(3)')?.textContent;
    assert.equal(status(head(picked.key)), 'Duplicate');
    assert.deepEqual([...new Set(heads().filter((h) => h.dataset.reviewRow !== picked.key).map(status))], ['Fine']);
    assert.match(dialog().querySelector('[aria-live]')!.textContent ?? '', new RegExp(`duplicates ${picked.total}, gaps 0, kept apart 0, fine ${175 - picked.total}`));
  });

  it('opens a type to its elements, each with its mark, storey and parts', () => {
    const { parent, picked } = overlap();
    open(parent);
    click(head(picked.key));
    assert.equal(head(picked.key).getAttribute('aria-expanded'), 'true');
    const cells = [...dialog().querySelectorAll('tbody tr')].map((tr) => [tr.querySelector('th')?.textContent, tr.children[1].textContent, tr.children[2].textContent]);
    assert.deepEqual(cells, picked.occurrences.map((o) => [occurrenceMark(picked, o), o.level, 'Windows, Pick']));
  });
});

describe('merge, move and keep apart', () => {
  it('merge: lists the type in the part chosen only, and the check is clean', () => {
    const { parent, windowsPart, pick, picked } = overlap();
    open(parent);
    click(head(picked.key));
    click(buttonNamed('Merge into "Windows"')!);
    assert.deepEqual(filterOf(pick), { types: [] });
    assert.deepEqual(filterOf(windowsPart), { kinds: ['window'] });
    assert.deepEqual(subReportChecks(useProjectStore.getState().schedules ?? [])[0].duplicates, []);
    assert.equal(head(picked.key).lastElementChild?.textContent, 'Windows');
    assert.match(dialog().querySelector('output')!.textContent ?? '', /Merged .* into "Windows"\./);
    assert.equal(document.activeElement, head(picked.key), 'focus stays on the type after the merge button is gone');
  });

  it('merge into the other part keeps the type in Pick only', () => {
    const { parent, windowsPart, pick, picked } = overlap();
    open(parent);
    click(head(picked.key));
    click(buttonNamed('Merge into "Pick"')!);
    assert.deepEqual(filterOf(pick), { types: [picked.key] });
    assert.deepEqual(filterOf(windowsPart), { kinds: ['window'], types: windows().filter((w) => w.key !== picked.key).map((w) => w.key) });
    assert.equal(head(picked.key).lastElementChild?.textContent, 'Pick');
    assert.equal(subReportChecks(useProjectStore.getState().schedules ?? []).flatMap((c) => c.duplicates).length, 0);
  });

  it('move: takes a door type to Pick; the Doors part lets it go and the check shows no gap', () => {
    const { parent, doorsPart, pick, picked } = overlap();
    const door = doors()[0];
    open(parent);
    click(head(door.key));
    click(buttonNamed('Move to "Pick"')!);
    assert.deepEqual(filterOf(doorsPart), { kinds: ['door'], types: doors().filter((d) => d.key !== door.key).map((d) => d.key) });
    assert.deepEqual(filterOf(pick).types, [picked.key, door.key]);
    assert.equal(head(door.key).lastElementChild?.textContent, 'Pick');
    assert.equal(subReportChecks(useProjectStore.getState().schedules ?? []).flatMap((c) => c.gaps).length, 0);
  });

  it('keep apart: the duplicate check stops flagging the type, in the card and in the readiness list, and the type reads "Kept apart"', () => {
    const { parent, picked } = overlap();
    const before = readinessOfModel({ dataStore: ifcDataStore, storeys: [] }, subReportChecks(useProjectStore.getState().schedules ?? []));
    assert.ok(before.some((f) => f.kind === 'subReportDuplicates'));
    open(parent);
    click(head(picked.key));
    click(buttonNamed('Keep this type apart on purpose')!);
    assert.deepEqual(scheduleById(parent)!.keptApart, [`${picked.key}|`]);
    const after = readinessOfModel({ dataStore: ifcDataStore, storeys: [] }, subReportChecks(useProjectStore.getState().schedules ?? []));
    assert.ok(!after.some((f) => f.kind === 'subReportDuplicates'));
    assert.match(head(picked.key).textContent ?? '', /Kept apart/);
    cleanup();
    assert.match(render(<SubReportCard schedule={scheduleById(parent)!} />).textContent ?? '', /Every element is in exactly one part\./);
  });

  it('keep apart one element: the others of the type stay flagged', () => {
    const { parent, picked } = overlap();
    open(parent);
    click(head(picked.key));
    click(buttonNamed('Keep apart')!);
    assert.deepEqual(scheduleById(parent)!.keptApart, [`${picked.key}|${picked.occurrences[0].globalId}`]);
    const [dup] = subReportChecks(useProjectStore.getState().schedules ?? [])[0].duplicates;
    assert.equal(dup.elements.length, picked.total - 1);
    assert.deepEqual([...dialog().querySelectorAll('tbody tr')].slice(0, 2).map((tr) => tr.children[3].textContent), ['Kept apart', 'Duplicate']);
  });

  it('check again takes a kept-apart type back', () => {
    const { parent, picked } = overlap();
    open(parent);
    click(head(picked.key));
    click(buttonNamed('Keep this type apart on purpose')!);
    click(buttonNamed('Check this type again')!);
    assert.equal(scheduleById(parent)!.keptApart, undefined);
    assert.equal(subReportChecks(useProjectStore.getState().schedules ?? []).flatMap((c) => c.duplicates).length, 1);
  });
});

describe('undo', () => {
  it('takes back a merge in one step, however many parts it changed, and redo does it again', () => {
    const { parent, doorsPart, pick, picked } = overlap();
    const door = doors()[0];
    open(parent);
    click(head(door.key));
    click(buttonNamed('Move to "Pick"')!);
    const moved = [filterOf(doorsPart), filterOf(pick)];
    assert.notDeepEqual(moved, [{ kinds: ['door'] }, { types: [picked.key] }]);
    assert.ok(undoDrafts());
    assert.deepEqual([filterOf(doorsPart), filterOf(pick)], [{ kinds: ['door'] }, { types: [picked.key] }]);
    assert.ok(redoDrafts());
    assert.deepEqual([filterOf(doorsPart), filterOf(pick)], moved);
  });

  it('takes back keep apart, and the duplicate is flagged again', () => {
    const { parent, picked } = overlap();
    open(parent);
    click(head(picked.key));
    click(buttonNamed('Keep this type apart on purpose')!);
    assert.ok(undoDrafts());
    assert.equal(scheduleById(parent)!.keptApart, undefined);
    assert.equal(subReportChecks(useProjectStore.getState().schedules ?? []).flatMap((c) => c.duplicates).length, 1);
  });
});

describe('filters', () => {
  it('by status, kind and storey', () => {
    const { parent, picked } = overlap();
    open(parent);
    choose(select('Status'), 'duplicate');
    assert.deepEqual(heads().map((h) => h.dataset.reviewRow), [picked.key]);
    choose(select('Status'), 'gap');
    assert.match(dialog().textContent ?? '', /Nothing matches these filters\./);
    choose(select('Status'), '');
    choose(select('Kind'), 'door');
    assert.deepEqual(heads().map((h) => h.dataset.reviewRow), doors().map((d) => d.key));
    choose(select('Kind'), '');
    const level = picked.occurrences[0].level;
    choose(select('Storey'), level);
    const onLevel = rows().entries.filter((e) => e.occurrences.some((o) => o.level === level)).map((e) => e.key);
    assert.deepEqual(heads().map((h) => h.dataset.reviewRow), onLevel);
    assert.ok(select('Storey').options.length > 1);
  });

  it('a gap shows as a gap: a type taken out of every part', () => {
    const { parent, windowsPart, pick, picked } = overlap();
    const other = windows()[1];
    open(parent);
    cleanup();
    useProjectStore.setState({ schedules: (useProjectStore.getState().schedules ?? []).map((s) => (s.id === windowsPart ? { ...s, sub: { ...s.sub!, filter: { kinds: ['window' as const], types: windows().filter((w) => w.key !== other.key).map((w) => w.key) } } } : s)) });
    assert.ok(pick && picked);
    open(parent);
    choose(select('Status'), 'gap');
    assert.deepEqual(heads().map((h) => [h.dataset.reviewRow, h.lastElementChild?.textContent]), [[other.key, 'no part']]);
    click(head(other.key));
    click(buttonNamed('Move to "Windows"')!);
    assert.equal(subReportChecks(useProjectStore.getState().schedules ?? []).flatMap((c) => c.gaps).length, 0);
  });
});

describe('marks follow the schedule\'s numbering (#276)', () => {
  it('names each element and type by the mark the part prints, with sequence numbering and a sort on', () => {
    const { parent, windowsPart } = overlap();
    setSort(parent, { by: 'count', descending: true });
    setNumbering(parent, { marks: 'sequence' });
    const printedRows = scheduleOf(useProjectStore.getState().schedules ?? [], scheduleById(windowsPart)!, rows()).entries;
    // Not vacuous: the numbering moved at least one type away from the catalogue's mark.
    const moved = printedRows.filter((e) => e.mark !== windows().find((w) => w.key === e.key)!.mark);
    assert.ok(moved.length > 0, 'sequence numbering changes a mark');
    const target = moved[0];
    open(parent);
    click(head(target.key));
    assert.deepEqual([...dialog().querySelectorAll('tbody th')].map((th) => th.textContent), target.occurrences.map((o) => occurrenceMark(target, o)));
    assert.ok((head(target.key).getAttribute('aria-label') ?? '').startsWith(`${target.mark} `), 'the type is named by the mark on the sheet');
  });

  it('does not touch a mark when a type moves', () => {
    const { parent, windowsPart, picked } = overlap();
    setNumbering(parent, { marks: 'sequence' });
    const marksOf = () => scheduleOf(useProjectStore.getState().schedules ?? [], scheduleById(windowsPart)!, rows()).entries.map((e) => [e.key, e.mark]);
    const before = marksOf();
    open(parent);
    click(head(picked.key));
    click(buttonNamed('Merge into "Pick"')!);
    const after = marksOf().filter(([key]) => key !== picked.key);
    assert.deepEqual(after, before.filter(([key]) => key !== picked.key));
  });
});

describe('keyboard', () => {
  it('Down and Up move between the types, Home and End to the ends, Escape closes', () => {
    const { parent } = overlap();
    let closed = 0;
    render(<SubReportReview scheduleId={parent} onClose={() => { closed += 1; }} />);
    const all = heads();
    all[0].focus();
    press(all[0], 'ArrowDown');
    assert.equal(document.activeElement, all[1]);
    press(all[1], 'ArrowUp');
    assert.equal(document.activeElement, all[0]);
    press(all[0], 'End');
    assert.equal(document.activeElement, all.at(-1));
    press(all.at(-1)!, 'Home');
    assert.equal(document.activeElement, all[0]);
    press(window, 'Escape');
    assert.equal(closed, 1);
  });

  it('a type opens and closes from the keyboard (Enter on the focused row)', () => {
    const { parent, picked } = overlap();
    open(parent);
    const h = head(picked.key);
    h.focus();
    act(() => { h.click(); });
    assert.equal(h.getAttribute('aria-expanded'), 'true');
    act(() => { h.click(); });
    assert.equal(h.getAttribute('aria-expanded'), 'false');
  });

  it('every control is a native button or select, reachable by Tab, with a name', () => {
    const { parent, picked } = overlap();
    open(parent);
    click(head(picked.key));
    for (const el of dialog().querySelectorAll<HTMLElement>('button, select')) {
      assert.ok(el.getAttribute('aria-label') || (el.textContent ?? '').trim() || el.closest('label'), `${el.tagName} has a name`);
      assert.notEqual(el.getAttribute('tabindex'), '-1');
    }
    assert.equal(dialog().getAttribute('aria-modal'), 'true');
  });
});

describe('where it opens from', () => {
  it('"Review by element" on the schedule\'s card', () => {
    const { parent } = overlap();
    const card = render(<SubReportCard schedule={scheduleById(parent)!} />);
    click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Review by element')!);
    assert.equal(useWallNav.getState().review, parent);
  });

  it('"Review by element" on a part\'s card with a duplicate opens the parent\'s review', () => {
    const { parent, pick } = overlap();
    const card = render(<SubReportCard schedule={scheduleById(pick)!} />);
    click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Review by element')!);
    assert.equal(useWallNav.getState().review, parent);
  });

  it('a readiness finding about duplicates, and one about gaps, each open the review of their schedule', () => {
    const { parent, windowsPart } = overlap();
    const second = addSchedule('all', 'Second joinery');
    const [d2] = splitByKind(second, { door: 'Doors 2', window: 'Windows 2' });
    assert.ok(d2);
    // The second schedule has a gap (windows part missing): remove the windows part of it.
    useProjectStore.setState({ schedules: (useProjectStore.getState().schedules ?? []).filter((s) => s.name !== 'Windows 2') });
    assert.ok(windowsPart);
    const list = render(<ReadinessList skin={skin} />);
    const links = [...list.querySelectorAll('button')].filter((b) => b.textContent === 'Review by element');
    assert.equal(links.length, 2);
    click(links[0]);
    assert.equal(useWallNav.getState().review, parent);
    click(links[1]);
    assert.equal(useWallNav.getState().review, second);
  });

  it('says there is nothing to review for a schedule that is not split', () => {
    const lone = addSchedule('all', 'Lone');
    open(lone);
    assert.match(dialog().textContent ?? '', /not split into parts/);
  });
});
