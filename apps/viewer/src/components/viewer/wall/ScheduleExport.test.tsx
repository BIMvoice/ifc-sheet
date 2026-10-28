/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #80 on the Wall: the CSV and XLSX of a placed schedule are the table the sheet draws. The sheet is read through `useSheetSchedules`
 * (the layouts a sheet draws) and the file through the card's own button, over a project whose schedule has a sub-report, a hidden row, a
 * sort, a sequence numbering and a text row; the buttons are on the card and in the drawer for every kind.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n/registry';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { addSchedule, addSubReport, scheduleById } from '@/joinery/schedules.js';
import { setNumbering, setRowShown, setSort } from '@/joinery/schedule-content-actions.js';
import { addScheduleTextRow, setScheduleTextCell } from '@/joinery/schedule-text-actions.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { assertSameRows, csvLines, shows, textsOf } from '@/joinery/export-test-util';
import type { ScheduleLayout } from '@/joinery/schedule-layout';
import { addRegisterToSet, addScheduleToSet, hangSchedule } from '@/project/drawing-set-actions.js';
import { addProjectSheet, resetProject, useProjectStore } from '@/project/project-store.js';
import type { ProjectSheet } from '@/project/types.js';
import { resetSectionChoices } from './card-section-state';
import { ScheduleExportCard } from './ScheduleExportCard';
import { ScheduleExportButtons, useScheduleExportLabels } from './ScheduleExportButtons';
import { readScheduleExport } from './schedule-export-read';
import { openSection } from '@/test/open-section.js';

const door = { ...defaultDoorSpec('D1'), id: 'd1', mark: 'D1', name: 'Ușă interioară', width: 0.9, height: 2.1 };
const door2 = { ...defaultDoorSpec('D2'), id: 'd2', mark: 'D2', name: 'Interior door 2', width: 1.1, height: 2.1 };
const win = { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1', name: 'Fixed window', width: 1.2, height: 1.2 };

const holder = (id: string): ProjectSheet => useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;

/** What the sheet draws for `id` and what the card's export reads for it, in the same render. */
async function both(id: string) {
  let drawn: ScheduleLayout | undefined;
  let labels: ReturnType<typeof useScheduleExportLabels> | undefined;
  function Probe() { drawn = useSheetSchedules(holder(id)).get(id); labels = useScheduleExportLabels(); return null; }
  render(<Probe />);
  cleanup();
  return { layout: drawn!, exported: await readScheduleExport(scheduleById(id)!, labels!) };
}

/** The drawn table: each row of the label column and the cells on its line. */
function drawnRows(layout: ScheduleLayout) {
  const texts = textsOf(layout);
  const marks = texts.filter((t) => t.size === 4).sort((a, b) => a.x - b.x).map((t) => t.text);
  const rows = texts.filter((t) => t.x === 2 && t.size !== 4 && t.text !== 'Mark').sort((a, b) => a.y - b.y)
    .map((label) => ({ label: label.text, cells: texts.filter((t) => t.x > 2 && t.y >= label.y - 0.01 && t.y <= label.y + 0.6 && t.size !== 2).sort((a, b) => a.x - b.x).map((t) => t.text) }));
  return { marks, rows };
}

function project(): string {
  useProjectStore.setState({ joineryTypes: [door, door2, win] });
  const id = addSchedule('all', 'Joinery');
  hangSchedule(id);
  const row = addScheduleTextRow(id, 'Producător')!;
  setScheduleTextCell(id, row, 'd1', 'Rehau', 'D1');
  setScheduleTextCell(id, row, 'd2', 'Velux', 'D2');
  setScheduleTextCell(id, row, 'w1', 'Schüco', 'W1');
  setRowShown(id, 'sill', false);
  setSort(id, { by: 'size', descending: true });
  setNumbering(id, { marks: 'sequence', typeStart: 5 });
  return id;
}

beforeEach(() => { resetProject(); resetSectionChoices(); registerLocale('ro', checkCatalogue(ro).catalogue); act(() => setLocale('en')); });
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the file of a placed joinery schedule is the table on the sheet', () => {
  it('has the rows, order, numbering and text row of the sheet, and not the row that was hidden', async () => {
    const id = project();
    const { layout, exported } = await both(id);
    assert.ok(exported);
    const [types] = exported.tables;
    const { marks, rows } = drawnRows(layout);
    assert.ok(marks.length === 3 && marks.every((m) => /^[DW]\d+$/.test(m)), marks.join());
    assert.deepEqual(types.rows.map((r) => r[0]), marks, 'marks: the sort and the sequence numbering');
    assert.ok(marks.includes('D5') || marks.includes('W5'), 'numbering starts at 5');
    assert.ok(!types.header.includes('Sill'), 'the hidden row is not exported');
    assert.ok(types.header.includes('Producător'), 'the text row is exported');
    // Every drawn row is a column of the file, cell for cell.
    let col = 1;
    for (const line of rows) {
      const span = line.cells.every((c) => c.includes('×')) ? 2 : 1;
      if (span === 1) assert.equal(types.header[col], line.label);
      types.rows.forEach((row, e) => assert.ok(shows(line.cells[e], (span === 2 ? `${row[col]} × ${row[col + 1]}` : row[col]) as string | number | null), `${line.label} of ${row[0]}: ${line.cells[e]} / ${row[col]}`));
      col += span;
    }
    assert.equal(col, types.header.length);
  });

  it('has only the part a sub-report keeps', async () => {
    const id = project();
    const part = addSubReport(id, 'Doors', { kinds: ['door'] })!;
    hangSchedule(part);
    const whole = await both(id);
    const doors = await both(part);
    assert.equal(whole.exported!.tables[0].rows.length, 3);
    assert.equal(doors.exported!.tables[0].rows.length, 2);
    assert.deepEqual(doors.exported!.tables[0].rows.map((r) => r[0]), drawnRows(doors.layout).marks);
    assert.ok(doors.exported!.tables[0].rows.every((r) => !String(r[0]).startsWith('W')));
  });

  it('writes a Romanian interface\'s headings, and keeps its diacritics', async () => {
    act(() => setLocale('ro'));
    const id = project();
    const { exported } = await both(id);
    assert.ok(exported!.tables[0].header.includes('Producător'));
    assert.ok(exported!.tables[0].header.some((h) => h.includes('Lățime')), exported!.tables[0].header.join());
  });
});

describe('the register is the table on the sheet', () => {
  it('exports every sheet row the register draws', async () => {
    addProjectSheet('Ground floor');
    addProjectSheet('Zeta sections');
    addRegisterToSet('Register');
    const id = useProjectStore.getState().schedules!.find((s) => s.kind === 'register')!.id;
    const { layout, exported } = await both(id);
    assert.ok(exported && exported.tables[0].rows.length >= 3, 'a register of several sheets');
    assertSameRows(layout, exported.tables[0]);
  });
});

describe('the buttons', () => {
  const downloads: { name: string; type: string; blob: Blob }[] = [];
  const realCreate = URL.createObjectURL;
  const realClick = window.HTMLAnchorElement.prototype.click;
  let pending: Blob | null = null;
  beforeEach(() => {
    downloads.length = 0;
    URL.createObjectURL = ((blob: Blob) => { pending = blob; return 'blob:test'; }) as typeof URL.createObjectURL;
    window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { downloads.push({ name: this.download, type: pending?.type ?? '', blob: pending! }); };
  });
  afterEach(() => { URL.createObjectURL = realCreate; window.HTMLAnchorElement.prototype.click = realClick; });
  // Wait for the download the click starts (the XLSX writer loads lazily, so a fixed pause is a race on a loaded runner), never longer than 15 s.
  const settle = (count = 0) => act(async () => {
    const until = Date.now() + 15_000;
    await new Promise((r) => setTimeout(r, 300));
    while (downloads.length < count && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  });
  const buttons = (view: HTMLElement) => [...view.querySelectorAll<HTMLButtonElement>('button')].filter((b) => /CSV|XLSX/.test(b.textContent ?? ''));

  it('the card offers CSV and XLSX, named after the schedule', async () => {
    const id = project();
    const view = render(<ScheduleExportCard schedule={scheduleById(id)!} />);
    openSection(view, 'Export');
    const [csv, xlsx] = buttons(view);
    click(csv);
    await settle(1);
    click(xlsx);
    await settle(2);
    assert.deepEqual(downloads.map((d) => d.name), ['Joinery.csv', 'Joinery.xlsx']);
    assert.match(downloads[0].type, /text\/csv/);
    const text = await downloads[0].blob.text();
    assert.ok(text.startsWith('﻿'), 'a byte order mark');
    assert.ok(csvLines(text)[0].startsWith('Mark,'), csvLines(text)[0]);
    assert.ok(csvLines(text)[0].includes('Producător'), 'diacritics in the CSV');
    assert.ok(downloads[1].blob.size > 1000);
  });

  it('a Romanian interface gets `;` between the columns', async () => {
    act(() => setLocale('ro'));
    const id = project();
    const view = render(<ScheduleExportButtons schedule={scheduleById(id)!} />);
    click(buttons(view)[0]);
    await settle(1);
    assert.ok(csvLines(await downloads[0].blob.text())[0].includes(';'));
  });

  it('every kind has the pair on its card and in the drawer\'s list', () => {
    for (const k of ['all', 'materials', 'types', 'finishes', 'urban'] as const) addScheduleToSet(k, k);
    addRegisterToSet('Register');
    const ids = useProjectStore.getState().schedules!.map((s) => s.id);
    assert.deepEqual(useProjectStore.getState().schedules!.map((s) => s.kind), ['all', 'materials', 'types', 'finishes', 'urban', 'register']);
    for (const id of ids) {
      const view = render(<ScheduleExportCard schedule={scheduleById(id)!} />);
      assert.equal(buttons(view).length, 2, scheduleById(id)!.kind);
      cleanup();
      const row = render(<ScheduleExportButtons schedule={scheduleById(id)!} named />);
      assert.deepEqual([...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')), [`CSV of ${scheduleById(id)!.name}`, `XLSX of ${scheduleById(id)!.name}`]);
      cleanup();
    }
  });
});
