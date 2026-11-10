/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #446, on AC20-FZK-Haus: a property or quantity of the model is added to the door and window schedule from the sheet's picker, like a column of
 * a list schedule. The window schedule has two types, W1 (1000×1000, two windows) and W2 (2000×1200, nine). Every window states
 * Pset_WindowCommon.ThermalTransmittance 1.4; the "disagree" cases give one W2 window another value (IFC entity #23032, EG-Fenster-6), so W2's
 * cell says "varies" and W1's still says 1.4. The row is a row like the built-in ones: it is saved with the project, printed by the engine
 * reading that project (a headless build), and a cell of it can be typed over.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { modelRowId, modelRowsOf, scheduleOf } from '@bimvoice/ifcsheet';
import { joineryScheduleData, openModel, readProjectFile } from '@bimvoice/ifcsheet/headless';
import { cleanup, click, render } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { resetSectionChoices } from '@/components/viewer/wall/card-section-state';
import { ScheduleContentCard } from '@/components/viewer/wall/ScheduleContentCard';
import { pickCell } from '@/joinery/list-cell-pick';
import { addSchedule, addSubReport, scheduleById } from '@/joinery/schedules';
import { loadUrbanModel } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { hangSchedule } from '@/project/drawing-set-actions';
import { addModelRow, setRowShown } from '@/joinery/schedule-content-actions';
import { setJoineryCellOverride } from '@/joinery/joinery-override-actions';
import { scheduleData } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { joineryExport, type ScheduleLayout, type SchedulePrim } from '@/joinery/schedule-layout';
import { joineryLabels } from '@/joinery/export-test-util';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';

const FZK = resolve(import.meta.dirname, '../test/__fixtures__/AC20-FZK-Haus.ifc');
const W1 = 'untyped:window:1000×1000';
const W2 = 'untyped:window:2000×1200';
const U = modelRowId('property', 'Pset_WindowCommon', 'ThermalTransmittance');
const AREA = modelRowId('quantity', 'BaseQuantities', 'Area');
const LABELS = { locale: 'en' as const, title: 'Windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U (W/m²K)', fire: 'Fire rating', varies: 'varies', op: (o: string) => o };

const original = readFileSync(FZK, 'utf8');
/** The model where one W2 window states another U value than its eight neighbours. */
const disagreeing = original.replace('#23032= IFCPROPERTYSINGLEVALUE(\'ThermalTransmittance\',$,IFCTHERMALTRANSMITTANCEMEASURE(1.4),$);', '#23032= IFCPROPERTYSINGLEVALUE(\'ThermalTransmittance\',$,IFCTHERMALTRANSMITTANCEMEASURE(2.4),$);');
let step = original;
const load = async () => { useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); await loadUrbanModel('fzk', new TextEncoder().encode(step), []); };
type Text = Extract<SchedulePrim, { kind: 'text' }>;
const cellTexts = (l: ScheduleLayout): string[] => l.prims.filter((p): p is Text => p.kind === 'text').map((p) => p.text);
const entryOf = (key: string) => scheduleData('window').entries.find((e) => e.key === key)!;

async function drawn(id: string): Promise<ScheduleLayout> {
  const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  const get = () => (layouts as unknown as ReturnType<typeof useSheetSchedules> | null)?.get(id);
  for (let i = 0; i < 100 && !get(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  const layout = get();
  cleanup();
  assert.ok(layout, 'the sheet drew the schedule');
  return layout;
}

function windowSchedule(): string {
  const id = addSchedule('window', 'Windows');
  assert.ok(hangSchedule(id), 'the schedule is hung on a sheet');
  return id;
}

beforeEach(async () => { resetProject(); resetSectionChoices(); pickCell(null); step = original; await load(); });
afterEach(() => cleanup());

describe('the sheet\'s picker offers the model\'s properties and quantities (#446)', () => {
  it('lists those the schedule\'s windows carry, groups them like the list schedules\' picker, and adds the one chosen', () => {
    const id = windowSchedule();
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    openSection(view, 'Content');
    const picker = view.querySelector<HTMLSelectElement>('select')!;
    const groups = [...picker.querySelectorAll('optgroup')].map((g) => g.label);
    assert.ok(groups.includes('Property: Pset_WindowCommon'), 'the set the windows carry');
    assert.ok(groups.includes('Quantity: BaseQuantities'));
    assert.ok(!groups.some((g) => /Pset_DoorCommon|Pset_WallCommon|Pset_BeamCommon/.test(g)), 'only what the schedule\'s elements carry is offered');
    assert.ok(![...picker.options].some((o) => /Code|Title/.test(o.textContent ?? '')), 'no office classification here');
    const option = [...picker.options].find((o) => o.value === JSON.stringify(['property', 'Pset_WindowCommon', 'ThermalTransmittance']))!;
    assert.ok(option, 'ThermalTransmittance is offered');
    picker.value = option.value;
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.deepEqual(scheduleById(id)!.content?.properties, [{ id: U, source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' }]);
    assert.ok(view.textContent?.includes('ThermalTransmittance'), 'the card lists the new row among the rows');
    assert.ok([...picker.options].find((o) => o.value === option.value)!.disabled, 'a row the schedule has is not offered twice');
  });

  it('offers a sub-report only what ITS elements carry: a property only a window of the other type states is not listed', () => {
    step = original.replace("#23032= IFCPROPERTYSINGLEVALUE('ThermalTransmittance'", "#23032= IFCPROPERTYSINGLEVALUE('OnlyOnOtherType'");
    return load().then(() => {
      const whole = windowSchedule();
      const part = addSubReport(whole, 'W1 only', { types: [W1] })!;
      assert.ok(part);
      const offered = (id: string) => {
        const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
        openSection(view, 'Content');
        const names = [...view.querySelectorAll<HTMLOptionElement>('select option')].map((o) => o.value);
        cleanup();
        return names;
      };
      const property = JSON.stringify(['property', 'Pset_WindowCommon', 'OnlyOnOtherType']);
      assert.ok(offered(whole).includes(property), 'the whole schedule carries it (a W2 window states it)');
      assert.ok(!offered(part).includes(property), 'the W1 part does not');
      assert.ok(offered(part).includes(JSON.stringify(['property', 'Pset_WindowCommon', 'ThermalTransmittance'])), 'what its windows do carry is still offered');
    });
  });

  it('takes the row off and puts it back like a built-in one', () => {
    const id = windowSchedule();
    addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    openSection(view, 'Content');
    click(view.querySelector<HTMLButtonElement>('button[aria-label="Remove the column ThermalTransmittance"]')!);
    assert.deepEqual(scheduleById(id)!.content?.rows?.hidden, [U]);
    const picker = view.querySelector<HTMLSelectElement>('select')!;
    const back = [...picker.options].find((o) => o.value === JSON.stringify(['attribute', null, U]))!;
    assert.ok(back, 'a hidden model row is offered among the rows that are off');
    picker.value = back.value;
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.deepEqual(scheduleById(id)!.content?.rows?.hidden ?? [], []);
    assert.equal(scheduleById(id)!.content?.properties?.length, 1, 'and it is not added twice');
  });
});

describe('a model row on the sheet (#446)', () => {
  it('prints the value the type\'s windows share, per type', async () => {
    const id = windowSchedule();
    addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
    addModelRow(id, { source: 'quantity', psetName: 'BaseQuantities', propertyName: 'Area' });
    const layout = await drawn(id);
    const texts = cellTexts(layout);
    assert.ok(texts.includes('ThermalTransmittance') && texts.includes('Area'), 'the rows are labelled');
    assert.equal(texts.filter((t) => t === '1.4').length, 2, 'both types state 1.4');
    assert.ok(texts.includes('0.7851') && texts.includes('2.4'), 'the area of a window of each type');
    assert.ok(!texts.includes('varies'));
  });

  it('says "varies" for the type whose windows disagree, and the value for the type whose windows agree', async () => {
    step = disagreeing;
    await load();
    const id = windowSchedule();
    addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
    const layout = await drawn(id);
    const cells = layout.cells!.filter((c) => c.column === U);
    assert.deepEqual(cells.map((c) => c.guid), [W1, W2]);
    const texts = cellTexts(layout);
    assert.equal(texts.filter((t) => t === 'varies').length, 1);
    assert.equal(texts.filter((t) => t === '1.4').length, 1);
    const w1 = cells.find((c) => c.guid === W1)!, w2 = cells.find((c) => c.guid === W2)!;
    const at = (c: typeof w1) => layout.prims.filter((p): p is Text => p.kind === 'text').filter((p) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h).map((p) => p.text);
    assert.deepEqual(at(w1), ['1.4']);
    assert.deepEqual(at(w2), ['varies']);
  });

  it('can be typed over for a type, like a built-in cell', async () => {
    step = disagreeing;
    await load();
    const id = windowSchedule();
    addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
    setJoineryCellOverride(entryOf(W2), U, '1.6', 'W2 Window', scheduleData('window').entries);
    const layout = await drawn(id);
    const texts = cellTexts(layout);
    assert.ok(texts.includes('1.6') && !texts.includes('varies'));
    assert.deepEqual(layout.cells!.filter((c) => c.overridden).map((c) => [c.guid, c.column]), [[W2, U]]);
    assert.deepEqual(useProjectStore.getState().joineryOverrides, [{ type: W2, row: U, value: '1.6', about: 'W2 Window' }]);
  });

  it('is in the schedule\'s CSV', () => {
    step = disagreeing;
    const id = windowSchedule();
    return load().then(() => {
      addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
      const table = joineryExport(scheduleDataOf(scheduleById(id)!), joineryLabels(LABELS)).tables[0];
      const col = table.header.indexOf('ThermalTransmittance');
      assert.ok(col >= 0);
      assert.deepEqual(table.rows.map((r) => [r[0], r[col]]), [['W1', 1.4], ['W2', 'varies']]);
    });
  });

  it('exports a number as a number, not as text, in the workbook and the CSV', () => {
    const id = windowSchedule();
    addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
    addModelRow(id, { source: 'quantity', psetName: 'BaseQuantities', propertyName: 'Area' });
    const table = joineryExport(scheduleDataOf(scheduleById(id)!), joineryLabels(LABELS)).tables[0];
    for (const head of ['ThermalTransmittance', 'Area']) {
      const col = table.header.indexOf(head);
      assert.ok(col >= 0, head);
      assert.ok(table.rows.every((r) => typeof r[col] === 'number'), `${head} cells are numbers`);
      assert.ok(table.numeric?.includes(col), `${head} is a numeric column`);
    }
    const area = table.header.indexOf('Area');
    assert.deepEqual(table.rows.map((r) => r[area]), [0.785082789239, 2.4]);
  });
});

describe('the project keeps the row and the engine prints it (#446)', () => {
  it('survives a save and a reopen, with the typed cell and a hidden row', async () => {
    step = disagreeing;
    await load();
    const id = windowSchedule();
    addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
    addModelRow(id, { source: 'quantity', psetName: 'BaseQuantities', propertyName: 'Area' });
    setRowShown(id, AREA, false);
    setJoineryCellOverride(entryOf(W1), U, '1.5', 'W1 Window', scheduleData('window').entries);
    const saved = serializeProject(projectDocument());
    const expected = [{ id: U, source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' }, { id: AREA, source: 'quantity', psetName: 'BaseQuantities', propertyName: 'Area' }];
    assert.deepEqual(parseProjectFile(saved).schedules?.find((s) => s.id === id)?.content?.properties, expected);
    assert.deepEqual(readProjectFile(saved).schedules.find((s) => s.id === id)?.content?.properties, expected);

    resetProject();
    loadProjectDocument(parseProjectFile(saved));
    const texts = cellTexts(await drawn(id));
    assert.ok(texts.includes('ThermalTransmittance') && texts.includes('1.5') && texts.includes('varies'));
    assert.ok(!texts.includes('Area'), 'the hidden row stays hidden');
  });

  it('is the table a headless build reads from the saved project: the same cells as the app\'s', async () => {
    step = disagreeing;
    await load();
    const id = windowSchedule();
    addModelRow(id, { source: 'property', psetName: 'Pset_WindowCommon', propertyName: 'ThermalTransmittance' });
    addModelRow(id, { source: 'quantity', psetName: 'BaseQuantities', propertyName: 'Area' });
    setJoineryCellOverride(entryOf(W1), U, '1.5', 'W1 Window', scheduleData('window').entries);
    const saved = serializeProject(projectDocument());
    const app = joineryExport(scheduleDataOf(scheduleById(id)!), joineryLabels(LABELS)).tables[0];

    const facts = readProjectFile(saved);
    const model = await openModel(new TextEncoder().encode(step), { geometry: false });
    const schedule = facts.schedules.find((s) => s.id === id)!;
    const rows = joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null }], facts, 'window', undefined, [], modelRowsOf(facts.schedules.map((s) => s.content)));
    const table = joineryExport(scheduleOf(facts.schedules, schedule, rows, facts.joineryOverrides) as never, joineryLabels(LABELS)).tables[0];
    assert.deepEqual(table.header, app.header);
    assert.deepEqual(table.rows.map((r) => r.slice(0, 7)), app.rows.map((r) => r.slice(0, 7)));
    const u = table.header.indexOf('ThermalTransmittance'), area = table.header.indexOf('Area');
    // The typed 1.5 is a number in a row of numbers, so the spreadsheet keeps it as one (#485), as it keeps the model's.
    assert.deepEqual(table.rows.map((r) => [r[0], r[u], r[area]]), [['W1', 1.5, 0.785082789239], ['W2', 'varies', 2.4]]);
  });
});
