/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #446, on AC20-FZK-Haus: the door and window schedule has a column taken off it and one cell typed over, from the sheet. The file has windows of two
 * sizes (read from the IFC text): nine of 2000×1200 on the ground floor and two of 1000×1000 in the attic (OG-Fenster-1 and -2), so the window schedule
 * has two types, W1 (1000×1000) and W2 (2000×1200). The sheet's SVG and the print show both changes for that type only and carry no mark; the
 * schedule's CSV agrees; the project keeps them through a save and a reopen; the engine reading the saved project hands out the same table; a model
 * update that removes the type is reported in "What is missing", and dropping its values is one undo step.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { joineryCellText, scheduleOf, typeIdentityOf } from '@bimvoice/ifcsheet';
import { joineryScheduleData, openModel, readProjectFile } from '@bimvoice/ifcsheet/headless';
import { defaultWindowSpec } from '@ifc-lite/create';
import { blur, cleanup, click, render, type as typeInto } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { resetSectionChoices } from '@/components/viewer/wall/card-section-state';
import { JoineryCellCard } from '@/components/viewer/wall/JoineryCellCard';
import { ScheduleContentCard } from '@/components/viewer/wall/ScheduleContentCard';
import { pickCell } from '@/joinery/list-cell-pick';
import { scheduleById } from '@/joinery/schedules';
import { loadUrbanModel } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { undoDrafts as undo } from '@/drafting/draft-store';
import { addSchedule } from '@/joinery/schedules';
import { hangSchedule } from '@/project/drawing-set-actions';
import { cellAt } from '@/joinery/list-cell-pick';
import { resetJoineryCellOverride, setJoineryCellOverride } from '@/joinery/joinery-override-actions';
import { setRowShown } from '@/joinery/schedule-content-actions';
import { scheduleData } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { joineryExport, type ScheduleLayout, type SchedulePrim } from '@/joinery/schedule-layout';
import { joineryLabels } from '@/joinery/export-test-util';
import { currentFindings } from '@/check/collect';
import { describeFinding } from '@/check/say';
import { removeFindingAnnotation } from '@/check/go';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetPrintHtml, sheetSvgText } from '@/components/viewer/sheets/sheet-export';

const FZK = resolve(import.meta.dirname, '../test/__fixtures__/AC20-FZK-Haus.ifc');
const W1 = 'untyped:window:1000×1000';
const W2 = 'untyped:window:2000×1200';
const U_LABEL = 'U (W/m²K)';
const FIRE_LABEL = 'Fire rating';
const LABELS = { locale: 'en' as const, title: 'Windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: U_LABEL, fire: FIRE_LABEL, op: (o: string) => o };

let step = readFileSync(FZK, 'utf8');
const load = async (source = step) => { await loadUrbanModel('fzk', new TextEncoder().encode(source), []); };
const reloadAs = async (source: string) => { useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); await load(source); };
const has = (xs: readonly unknown[], v: unknown): boolean => xs.some((x) => x === v);
type Text = Extract<SchedulePrim, { kind: 'text' }>;
const cellTexts = (l: ScheduleLayout): string[] => l.prims.filter((p): p is Text => p.kind === 'text').map((p) => p.text);
const entryOf = (key: string) => scheduleData('window').entries.find((e) => e.key === key)!;

/** The sheet that holds the schedule `id`, and the layout it draws now. */
async function drawn(id: string): Promise<{ sheet: ReturnType<typeof useProjectStore.getState>['sheets'][number]; layout: ScheduleLayout }> {
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
  return { sheet, layout };
}

/** The sheet's SVG as the editor shows it (live) and as it is exported (the document SVG and the PDF print from). */
function svgOf(sheet: Awaited<ReturnType<typeof drawn>>['sheet'], layout: ScheduleLayout): { live: string; exported: string; print: string } {
  const ui = render(<SheetPaper sheet={sheet} projectName="House" content={() => ({ view: undefined, drawing: null, drafts: [], schedule: layout })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
  const live = svg.outerHTML;
  const exported = sheetSvgText(svg, sheet);
  const print = sheetPrintHtml(svg, sheet);
  cleanup();
  return { live, exported, print };
}

function windowSchedule(name = 'Windows'): string {
  const id = addSchedule('window', name);
  assert.ok(hangSchedule(id), 'the schedule is hung on a sheet');
  return id;
}

beforeEach(async () => { resetProject(); resetSectionChoices(); pickCell(null); step = readFileSync(FZK, 'utf8'); useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); await load(); });
afterEach(() => cleanup());

describe('a column taken off and a cell typed over, from the sheet (#446)', () => {
  it('prints both for that type only, in the sheet SVG and the PDF print, and marks the cell only in the editor', async () => {
    const id = windowSchedule();
    const before = cellTexts((await drawn(id)).layout);
    assert.ok(has(before, U_LABEL) && has(before, FIRE_LABEL), 'the model\'s columns are all there');
    assert.deepEqual(scheduleData('window').entries.map((e) => [e.key, e.mark, e.total]), [[W1, 'W1', 2], [W2, 'W2', 9]]);

    setRowShown(id, 'u', false);
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    const { sheet, layout } = await drawn(id);
    const cells = cellTexts(layout);
    assert.ok(!has(cells, U_LABEL), 'the column is off the table');
    assert.ok(has(cells, FIRE_LABEL), 'the other columns stay');
    // Two types, one typed cell: the text is printed once, in the card of W2.
    assert.equal(cells.filter((t) => t === 'EI 30').length, 1);
    assert.ok(!has(before, 'EI 30'));
    const typed = layout.cells!.filter((c) => c.overridden);
    assert.deepEqual(typed.map((c) => [c.guid, c.column]), [[W2, 'fire']]);
    const w1 = layout.cells!.find((c) => c.guid === W1 && c.column === 'fire')!;
    assert.ok(typed[0].x > w1.x, 'W2 is the card to the right of W1');

    const svg = svgOf(sheet, layout);
    for (const doc of [svg.live, svg.exported, svg.print]) {
      assert.match(doc, />EI 30</);
      assert.doesNotMatch(doc, /U \(W\/m²K\)/);
    }
    assert.match(svg.live, /data-overridden-cell/, 'the editor marks the typed cell');
    assert.doesNotMatch(svg.exported, /data-overridden-cell/, 'the SVG carries no mark');
    assert.doesNotMatch(svg.print, /data-overridden-cell/, 'the PDF carries no mark');
  });

  it('reports the cell a click lands on by its type and row, not by place', async () => {
    const id = windowSchedule();
    const { layout } = await drawn(id);
    const box = layout.fit!.box;
    const cell = layout.cells!.find((c) => c.guid === W2 && c.column === 'fire')!;
    assert.ok(cell, 'the fire rating of W2 is pickable');
    const hit = cellAt(layout, { x: box.x + cell.x + cell.w / 2, y: box.y + cell.y + cell.h / 2 });
    assert.deepEqual([hit?.guid, hit?.column], [W2, 'fire']);
    assert.equal(cellAt(layout, { x: box.x - 5, y: box.y - 5 }), null);
    // Counts and sizes are measured from the model, not typed: they have no pickable cell.
    assert.deepEqual([...new Set(layout.cells!.map((c) => c.column))].sort(), ['fire', 'name', 'operation', 'sill', 'u']);
  });

  it('applies to the type\'s cell in every joinery schedule, and is one undo step each', async () => {
    const first = windowSchedule('Windows');
    const second = windowSchedule('Windows, again');
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    for (const id of [first, second]) assert.equal(cellTexts((await drawn(id)).layout).filter((t) => t === 'EI 30').length, 1, `on ${id}`);
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 60', 'W2 Window');
    assert.deepEqual(useProjectStore.getState().joineryOverrides!.map((o) => o.value), ['EI 60'], 'a second edit of the cell replaces the first');
    undo();
    assert.deepEqual(useProjectStore.getState().joineryOverrides!.map((o) => o.value), ['EI 30'], 'one undo takes back one edit');
    resetJoineryCellOverride(entryOf(W2), 'fire');
    assert.equal(useProjectStore.getState().joineryOverrides, undefined, 'reset leaves no override');
    assert.ok(!has(cellTexts((await drawn(first)).layout), 'EI 30'));
    undo();
    assert.equal(useProjectStore.getState().joineryOverrides!.length, 1, 'and the reset is one step too');
  });

  it('keeps the typed text when the column is taken off and put back', async () => {
    const id = windowSchedule();
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    setRowShown(id, 'fire', false);
    assert.ok(!has(cellTexts((await drawn(id)).layout), 'EI 30'), 'a column that is off prints nothing');
    setRowShown(id, 'fire', true);
    assert.ok(has(cellTexts((await drawn(id)).layout), 'EI 30'));
  });

  it('is written to the CSV the schedule exports, in the column that is left', () => {
    const id = windowSchedule();
    setRowShown(id, 'u', false);
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    const table = joineryExport(scheduleDataOf(useProjectStore.getState().schedules!.find((s) => s.id === id)!), joineryLabels(LABELS)).tables[0];
    assert.ok(!table.header.includes(U_LABEL));
    const col = table.header.indexOf(FIRE_LABEL);
    assert.deepEqual(table.rows.map((r) => [r[0], r[col]]), [['W1', null], ['W2', 'EI 30']]);
  });
});

describe('the project keeps them, and the engine prints the same (#446)', () => {
  it('survives a save and a reopen: the app\'s reader, the engine\'s, and the drawing after the project is loaded again', async () => {
    const id = windowSchedule();
    setRowShown(id, 'u', false);
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    const saved = serializeProject(projectDocument());
    const expected = [{ type: W2, row: 'fire', value: 'EI 30', about: 'W2 Window' }];
    assert.deepEqual(parseProjectFile(saved).joineryOverrides, expected);
    assert.deepEqual(readProjectFile(saved).joineryOverrides, expected);
    assert.deepEqual(parseProjectFile(saved).schedules?.find((s) => s.id === id)?.content?.rows?.hidden, ['u']);

    resetProject();
    assert.equal(useProjectStore.getState().joineryOverrides, undefined);
    loadProjectDocument(parseProjectFile(saved));
    const cells = cellTexts((await drawn(id)).layout);
    assert.equal(cells.filter((t) => t === 'EI 30').length, 1);
    assert.ok(!has(cells, U_LABEL));
  });

  it('is the table the engine reads from the saved project: the same rows as the app\'s', async () => {
    const id = windowSchedule();
    setRowShown(id, 'u', false);
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    const saved = serializeProject(projectDocument());
    const app = joineryExport(scheduleDataOf(useProjectStore.getState().schedules!.find((s) => s.id === id)!), joineryLabels(LABELS)).tables[0];

    const facts = readProjectFile(saved);
    const model = await openModel(new TextEncoder().encode(step), { geometry: false });
    const rows = joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null }], facts, 'window');
    const schedule = facts.schedules.find((s) => s.id === id)!;
    const headless = scheduleOf(facts.schedules, schedule, rows, facts.joineryOverrides);
    const table = joineryExport(headless as never, joineryLabels(LABELS)).tables[0];
    assert.deepEqual(table.header, app.header);
    assert.deepEqual(table.rows.map((r) => r.slice(0, 5)), app.rows.map((r) => r.slice(0, 5)));
    assert.equal(joineryCellText(headless.overrides, headless.entries.find((e) => e.key === W2)!, 'fire', '—'), 'EI 30');
    assert.equal(joineryCellText(headless.overrides, headless.entries.find((e) => e.key === W1)!, 'fire', '—'), '—');
  });
});

describe('the identity of a type (#446)', () => {
  /** FZK with a joinery configuration written on its IfcWindowType "Rundfenster 13", which types the two attic windows. */
  const configured = (): string => {
    const spec = { ...defaultWindowSpec('W'), id: 'attic-round', name: 'Attic round window', mark: 'W9', width: 1, height: 1 };
    const json = JSON.stringify(spec).replace(/'/g, "''");
    return step
      .replace("(#67451,#67454),(#67463", '(#67451,#67454,#99902),(#67463')
      .replace('ENDSEC;', `#99901= IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('${json}'),$);\n#99902= IFCPROPERTYSET('2aBcDeFgHiJkLmNoPqRs01',#12,'Pset_IfcLiteJoinery',$,(#99901));\nENDSEC;`);
  };

  it('is the GlobalId of the model\'s IfcTypeObject when the type has one, and the entry key when it has none', async () => {
    await reloadAs(configured());
    const typed = scheduleData('window').entries.find((e) => e.key === 'attic-round')!;
    assert.ok(typed, 'the attic windows are one configured type now');
    assert.equal(typed.typeGlobalId, '0KzM3XjQrPipQpI0RMGVb1', 'the GlobalId of #67450 in the IFC text');
    assert.equal(typeIdentityOf(typed), '0KzM3XjQrPipQpI0RMGVb1');
    const id = windowSchedule();
    setJoineryCellOverride(typed, 'fire', 'EI 90', 'W9 Attic round window');
    assert.deepEqual(useProjectStore.getState().joineryOverrides, [{ type: '0KzM3XjQrPipQpI0RMGVb1', row: 'fire', value: 'EI 90', about: 'W9 Attic round window' }]);
    assert.equal(cellTexts((await drawn(id)).layout).filter((t) => t === 'EI 90').length, 1);
    // The ground-floor windows have no type of the project's: their identity is the entry key.
    assert.equal(typeIdentityOf(entryOf(W2)), W2);
  });
});

describe('a model update (#446)', () => {
  /** The next model version: the two attic windows (OG-Fenster-1 and -2, the only windows of 1000×1000) are gone. */
  const withoutAtticWindows = (source: string): string => source.split('\n').flatMap((line) => {
    const refs = /#66459\b|#74280\b/.test(line);
    if (!refs) return [line];
    if (/^#(66459|74280)=/.test(line)) return [];
    // The lists that hold other elements too lose just these two; a relationship of theirs alone goes.
    if (/IFCRELCONTAINEDINSPATIALSTRUCTURE|IFCRELDEFINESBYTYPE/.test(line)) return [line.replace(/#(66459|74280),/g, '').replace(/,#(66459|74280)\b/g, '')];
    return [];
  }).join('\n');

  it('reports the type that is gone and keeps the value of the type that is left', async () => {
    const id = windowSchedule();
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    setJoineryCellOverride(entryOf(W1), 'fire', 'EI 90', 'W1 Window');
    setJoineryCellOverride(entryOf(W1), 'name', 'Attic light', 'W1 Window');
    assert.equal(currentFindings().filter((f) => f.kind === 'orphanedJoineryOverride').length, 0, 'both types are in the model');

    const updated = withoutAtticWindows(step);
    assert.notEqual(updated, step, 'the update changed the model');
    await reloadAs(updated);
    assert.deepEqual(scheduleData('window').entries.map((e) => e.key), [W2], 'one type is left');
    const cells = cellTexts((await drawn(id)).layout);
    assert.equal(cells.filter((t) => t === 'EI 30').length, 1, 'the value stayed with its type');
    assert.ok(!has(cells, 'EI 90') && !has(cells, 'Attic light'), 'the gone type\'s values are not printed on another');

    const found = currentFindings().filter((f) => f.kind === 'orphanedJoineryOverride');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].typeKeys, [W1]);
    assert.match(describeFinding(found[0]), /2 typed values for the type "W1 Window".*no longer in the model/);

    // Dropping them is one undo step; the type that is still there keeps its value.
    assert.ok(removeFindingAnnotation(found[0]));
    assert.deepEqual(useProjectStore.getState().joineryOverrides!.map((o) => o.type), [W2]);
    assert.equal(currentFindings().filter((f) => f.kind === 'orphanedJoineryOverride').length, 0);
    undo();
    assert.equal(useProjectStore.getState().joineryOverrides!.length, 3);
  });

  it('reports nothing while no model is loaded: every type is unknown then, and none of them is gone', () => {
    windowSchedule();
    setJoineryCellOverride(entryOf(W2), 'fire', 'EI 30', 'W2 Window');
    useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null });
    assert.equal(currentFindings().filter((f) => f.kind === 'orphanedJoineryOverride').length, 0);
  });
});

describe('the viewport card (#446)', () => {
  it('types over the picked cell, marks it as typed, and resets it to the model\'s text', async () => {
    const id = windowSchedule();
    const view = render(<JoineryCellCard schedule={scheduleById(id)!} />);
    assert.match(view.textContent ?? '', /Click a cell to type over it/, 'closed, the section says what to do');
    await act(async () => { pickCell({ scheduleId: id, guid: W2, column: 'fire' }); });
    // A picked cell opens the section by itself.
    assert.match(view.textContent ?? '', /Fire rating: W2 Window/);
    const field = view.querySelector<HTMLInputElement>('[data-joinery-cell-editor] input')!;
    typeInto(field, 'EI 30');
    blur(field);
    assert.deepEqual(useProjectStore.getState().joineryOverrides, [{ type: W2, row: 'fire', value: 'EI 30', about: 'W2 Window' }]);
    assert.match(view.textContent ?? '', /Typed over the model/);
    const reset = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Reset to model value')!;
    click(reset);
    assert.equal(useProjectStore.getState().joineryOverrides, undefined);
  });

  it('removes a column with its button and adds it back with the picker the list schedules use', () => {
    const id = windowSchedule();
    const view = render(<ScheduleContentCard schedule={scheduleById(id)!} />);
    openSection(view, 'Content');
    click(view.querySelector<HTMLButtonElement>('button[aria-label="Remove the column U (W/m²K)"]')!);
    assert.deepEqual(scheduleById(id)!.content?.rows?.hidden, ['u']);
    const picker = view.querySelector<HTMLSelectElement>('select')!;
    // Besides the model's properties and quantities (`joinery-model-rows.fzk.test.tsx`), the rows of the table that are off.
    const off = [...picker.options].filter((o) => o.value.startsWith('["attribute"'));
    assert.deepEqual(off.map((o) => o.textContent), ['U (W/m²K)'], 'only the column that is off is offered among the rows');
    picker.value = off[0].value;
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.deepEqual(scheduleById(id)!.content?.rows?.hidden ?? [], [], 'the column is back');
  });
});
