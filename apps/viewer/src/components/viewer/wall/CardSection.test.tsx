/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sections of a schedule's viewport card are disclosures (#290): headings that are buttons with `aria-expanded`, a default
 * that follows warnings and settings, a one-line summary that says exactly what the settings are, a choice kept for the session,
 * and keys that stay with the control that has the focus. The duplicate and gap warning is exercised on a real model in
 * `check/sub-report-check.test.tsx`.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { openSection, sectionHeading } from '@/test/open-section.js';
import { resetProject } from '@/project/project-store';
import { addSchedule, addSubReport, scheduleById } from '@/joinery/schedules';
import { moveRow, setNumbering, setRowShown, setScheduleFilter, setSort, setSymbolShown } from '@/joinery/schedule-content-actions';
import { addScheduleTextRow } from '@/joinery/schedule-text-actions';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { resetSectionChoices, reloadSectionChoices } from './card-section-state';
import { keysBelongElsewhere } from './wall-key-bus';
import { ScheduleContentCard } from './ScheduleContentCard';
import { ScheduleFilterSection } from './ScheduleFilterCard';
import { ScheduleTextCard } from './ScheduleTextCard';
import { SubReportCard } from './SubReportCard';

beforeEach(() => {
  resetProject();
  resetSectionChoices();
  registerLocale('ro', checkCatalogue(ro).catalogue);
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const STORAGE = 'ifcsheet.wall.cardSections';

/** The sections of a joinery schedule's card, in the order the viewport card lists them. */
function sections(id: string) {
  const schedule = scheduleById(id)!;
  return render(
    <>
      <SubReportCard schedule={schedule} />
      <ScheduleContentCard schedule={schedule} />
      <ScheduleFilterSection schedule={schedule} />
      <ScheduleTextCard schedule={schedule} />
    </>,
  );
}

/** What a heading reads: its title, then (while closed) its summary; the decorative arrow left out. */
const heading = (root: ParentNode, title: string) => sectionHeading(root, title);
const said = (root: ParentNode, title: string) => (heading(root, title).textContent ?? '').replace(/^▸/, '');
const expanded = (root: ParentNode, title: string) => heading(root, title).getAttribute('aria-expanded');
/** Close a section whatever its default, so its summary shows. */
const close = (root: ParentNode, title: string) => { if (expanded(root, title) === 'true') click(heading(root, title)); };

describe('a section of the card is a disclosure', () => {
  it('has a heading button with aria-expanded that opens and closes its panel', () => {
    const id = addSchedule('all', 'Joinery');
    const ui = sections(id);
    const button = heading(ui, 'Content');
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.closest('h3') !== null, true, 'the button is the heading\'s content');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(ui.querySelector('input[aria-label="First type no."]'), null, 'a closed panel is not in the page');
    click(button);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    const panel = ui.ownerDocument.getElementById(button.getAttribute('aria-controls')!);
    assert.ok(panel, 'aria-controls names the panel');
    assert.ok(panel.querySelector('input[aria-label="First type no."]'), 'the panel holds the section');
    click(button);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
  });

  it('keeps the keys with the control: the heading is a button inside a panel that owns its keys', () => {
    const id = addSchedule('all', 'Joinery');
    const ui = sections(id);
    for (const title of ['Sub-reports', 'Content', 'Filter', 'Text rows']) {
      const button = heading(ui, title);
      // Enter and Space press a button natively; the drafting keys (#224) and the nudge guard (#281) leave a target like this alone.
      assert.equal(button.matches('button'), true, title);
      assert.equal(keysBelongElsewhere(button), true, `${title}: arrows and single keys belong to the heading`);
    }
  });

  it('keeps the focus order logical: each heading comes first in its section, and the sections do not interleave', () => {
    const id = addSchedule('all', 'Joinery');
    const ui = sections(id);
    for (const title of ['Content', 'Filter', 'Text rows']) openSection(ui, title);
    const stops = [...ui.querySelectorAll<HTMLElement>('button, input, select')];
    const owners = stops.map((e) => e.closest('[data-owns-keys]'));
    const groups = owners.filter((o, i) => o !== owners[i - 1]);
    assert.equal(new Set(groups).size, groups.length, 'the controls of one section are consecutive');
    assert.equal(groups.length, 4);
    for (const group of groups) {
      const first = stops.find((e) => e.closest('[data-owns-keys]') === group)!;
      assert.equal(first.hasAttribute('aria-expanded'), true, 'the heading is the first stop of its section');
    }
    assert.deepEqual(stops.filter((e) => e.hasAttribute('aria-expanded')).map((e) => (e.textContent ?? '').replace(/^▸/, '').slice(0, 7)), ['Sub-rep', 'Content', 'Filter', 'Text ro']);
  });
});

describe('what a section does by default', () => {
  it('starts closed, with a one-line summary, when its settings are the defaults', () => {
    const id = addSchedule('all', 'Joinery');
    const ui = sections(id);
    assert.deepEqual(['Sub-reports', 'Content', 'Filter', 'Text rows'].map((t) => expanded(ui, t)), ['false', 'false', 'false', 'false']);
    assert.equal(said(ui, 'Sub-reports'), 'Sub-reportsNot split yet');
    assert.equal(said(ui, 'Content'), 'ContentAs the model lists them');
    assert.equal(said(ui, 'Filter'), 'FilterNot filtered');
    assert.equal(said(ui, 'Text rows'), 'Text rowsNone');
  });

  it('opens a section whose settings are off the default, and its summary says what they are', () => {
    const id = addSchedule('all', 'Joinery');
    setRowShown(id, 'operation', false);
    setRowShown(id, 'fire', false);
    setSort(id, { by: 'size' });
    setScheduleFilter(id, { classes: ['IfcDoor', 'IfcWindow'], properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] });
    addScheduleTextRow(id, 'Remarks');
    addScheduleTextRow(id, 'Maker');
    const ui = sections(id);
    assert.deepEqual(['Sub-reports', 'Content', 'Filter', 'Text rows'].map((t) => expanded(ui, t)), ['false', 'true', 'true', 'true']);
    for (const t of ['Content', 'Filter', 'Text rows']) close(ui, t);
    assert.equal(said(ui, 'Content'), 'Content2 rows hidden, sorted by size');
    assert.equal(said(ui, 'Filter'), 'FilterClasses IfcDoor, IfcWindow; IsExternal is true');
    assert.equal(said(ui, 'Text rows'), 'Text rows2 rows');
  });

  it('says each content setting once and no other: order, direction, marks, starts, symbols', () => {
    const id = addSchedule('all', 'Joinery');
    moveRow(id, 'total', -1);
    setSort(id, { by: 'count', descending: true });
    setNumbering(id, { marks: 'sequence', typeStart: 12, elementStart: 3 });
    setSymbolShown(id, 'plan', false);
    setSymbolShown(id, 'elevation', false);
    const ui = sections(id);
    close(ui, 'Content');
    assert.equal(said(ui, 'Content'), 'ContentRows reordered, sorted by count, reversed, marks in the order shown, types from 12, elements from 3, no elevation symbols, no plan symbols');
  });

  it('says a part\'s kinds, and that a part with no restriction keeps everything', () => {
    const parent = addSchedule('all', 'Joinery');
    const doors = addSubReport(parent, 'Doors', { kinds: ['door'] })!;
    const whole = addSubReport(parent, 'Rest', {})!;
    const onDoors = sections(doors);
    assert.equal(expanded(onDoors, 'Sub-reports'), 'true', 'a part that keeps only some kinds has settings off the default');
    close(onDoors, 'Sub-reports');
    assert.equal(said(onDoors, 'Sub-reports'), 'Sub-reportsKinds: Doors');
    cleanup();
    const onRest = sections(whole);
    assert.equal(expanded(onRest, 'Sub-reports'), 'false');
    assert.equal(said(onRest, 'Sub-reports'), 'Sub-reportsKeeps everything');
  });

  it('counts the parts of a split schedule', () => {
    const parent = addSchedule('all', 'Joinery');
    addSubReport(parent, 'A', { kinds: ['door'] });
    addSubReport(parent, 'B', { kinds: ['window'] });
    const ui = sections(parent);
    assert.equal(said(ui, 'Sub-reports'), 'Sub-reports2 sub-reports');
  });
});

describe('the choice is kept', () => {
  it('survives a new render, for the section and not for the others, and goes to every schedule', () => {
    const a = addSchedule('all', 'Joinery');
    const b = addSchedule('all', 'Joinery 2');
    openSection(sections(a), 'Content');
    cleanup();
    const again = sections(a);
    assert.equal(expanded(again, 'Content'), 'true');
    assert.equal(expanded(again, 'Filter'), 'false', 'only the section that was opened');
    cleanup();
    assert.equal(expanded(sections(b), 'Content'), 'true', 'the choice is per section, for the session');
    cleanup();
    const closing = sections(a);
    click(heading(closing, 'Content'));
    cleanup();
    assert.equal(expanded(sections(a), 'Content'), 'false');
  });

  it('outranks the default: a section closed by hand stays closed while it has settings', () => {
    const id = addSchedule('all', 'Joinery');
    setSort(id, { by: 'mark' });
    click(heading(sections(id), 'Content'));
    cleanup();
    assert.equal(expanded(sections(id), 'Content'), 'false');
  });

  it('is written to localStorage and read back; damaged storage means the defaults', () => {
    const id = addSchedule('all', 'Joinery');
    openSection(sections(id), 'Filter');
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(STORAGE)!), { filter: true });
    cleanup();
    globalThis.localStorage.setItem(STORAGE, JSON.stringify({ text: true, content: 'yes' }));
    reloadSectionChoices();
    const ui = sections(id);
    assert.equal(expanded(ui, 'Text rows'), 'true', 'read from storage');
    assert.equal(expanded(ui, 'Content'), 'false', 'a value that is not a choice is dropped');
    cleanup();
    globalThis.localStorage.setItem(STORAGE, '{not json');
    reloadSectionChoices();
    assert.equal(expanded(sections(id), 'Text rows'), 'false');
  });
});

describe('in Romanian', () => {
  it('titles and summarises the sections in Romanian', () => {
    act(() => setLocale('ro'));
    const id = addSchedule('all', 'Joinery');
    const quiet = sections(id);
    assert.equal(said(quiet, 'Subtabele'), 'SubtabeleNesplitat încă');
    assert.equal(said(quiet, 'Conținut'), 'ConținutÎn ordinea din model');
    assert.equal(said(quiet, 'Filtru'), 'FiltruNefiltrat');
    assert.equal(said(quiet, 'Rânduri de text'), 'Rânduri de textNiciunul');
    cleanup();
    setRowShown(id, 'operation', false);
    setRowShown(id, 'fire', false);
    setSort(id, { by: 'size' });
    setScheduleFilter(id, { predefined: ['GATE'], properties: [{ name: 'IsExternal', op: 'notEquals', value: 'true' }] });
    addScheduleTextRow(id, 'Remarks');
    const ui = sections(id);
    for (const t of ['Conținut', 'Filtru', 'Rânduri de text']) close(ui, t);
    assert.equal(said(ui, 'Conținut'), 'Conținut2 rânduri ascunse, sortat după dimensiune');
    assert.equal(said(ui, 'Filtru'), 'FiltruTipuri predefinite GATE; IsExternal nu este true');
    assert.equal(said(ui, 'Rânduri de text'), 'Rânduri de text1 rând');
  });
});
