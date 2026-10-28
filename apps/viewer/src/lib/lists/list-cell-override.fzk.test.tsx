/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #446, on AC20-FZK-Haus: a schedule of the doors on a sheet has a column taken off it and one cell typed over, from the sheet. The sheet's SVG
 * (the document the PDF prints from) shows both and carries no mark; the project keeps them through a save and a reopen; a headless build of the
 * saved project, the command line, prints the same table; a model update that moves the rows leaves the value on its door; a door that has
 * gone is reported in "What is missing", and dropping its values is one undo step.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { act } from 'react';
import { listScheduleTable, listTableCells, type ListScheduleDef } from '@bimvoice/ifcsheet';
import { listScheduleTableOn, openModel, readProjectFile } from '@bimvoice/ifcsheet/headless';
import { cleanup, render } from '@/test/render.js';
import { loadUrbanModel } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { useProjectStore, resetProject, projectDocument } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { undoDrafts as undo } from '@/drafting/draft-store';
import { addListScheduleToSet, removeListColumn, resetListCellOverride, setListCellOverride } from '@/joinery/list-schedule-actions';
import { scheduleById } from '@/joinery/schedules';
import { cellAt } from '@/joinery/list-cell-pick';
import { currentFindings } from '@/check/collect';
import { describeFinding } from '@/check/say';
import { removeFindingAnnotation } from '@/check/go';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetPrintHtml, sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import type { ScheduleLayout, SchedulePrim } from '@/joinery/schedule-layout';
import { listTableSourceOf, runListSchedule } from './list-schedule-run';
import { prepareListProviders } from './prepare-providers';

const FZK = resolve(import.meta.dirname, '../../test/__fixtures__/AC20-FZK-Haus.ifc');
const BIN = resolve(import.meta.dirname, '../../../../../packages/ifcsheet/dist/bin.js');
const WORDS = { count: 'Count', total: 'Total', yes: 'Yes', no: 'No', missing: 'The total of {column} leaves out {missing} of {rows} rows with no value' };
const DOOR_2 = '0pGAjlJMP3ifYPATVF5xAR';
const DOOR_1 = '1Oms875aH3Wg$9l65H2ZGw';

const NAME = { id: 'name', source: 'attribute', propertyName: 'Name' } as const;
const STOREY = { id: 'storey', source: 'spatial', propertyName: 'Storey' } as const;
const FIRE = { id: 'fire', source: 'property', psetName: 'Pset_DoorCommon', propertyName: 'FireRating' } as const;
const DOORS: ListScheduleDef = { filter: { classes: ['IfcDoor'] }, columns: [NAME, STOREY, FIRE] };

let step = readFileSync(FZK, 'utf8');
const load = async (source = step) => { await loadUrbanModel('fzk', new TextEncoder().encode(source), []); };
const reloadAs = async (source: string) => { useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); await load(source); };

const has = (xs: readonly unknown[], v: unknown): boolean => xs.some((x) => x === v);
const at = (xs: readonly unknown[], v: unknown): number => xs.findIndex((x) => x === v);
type Text = Extract<SchedulePrim, { kind: 'text' }>;
const cellTexts = (l: ScheduleLayout): string[] => l.prims.filter((p): p is Text => p.kind === 'text').map((p) => p.text);

/** The sheet that holds the schedule `id`, and the layout it draws once the list has run. */
async function drawn(id: string): Promise<{ sheet: ReturnType<typeof useProjectStore.getState>['sheets'][number]; layout: ScheduleLayout }> {
  const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  const get = () => (layouts as unknown as ReturnType<typeof useSheetSchedules> | null)?.get(id);
  // The layout of the schedule as it stands now: wait for a layout that is not the one before the edit.
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

beforeEach(async () => { resetProject(); step = readFileSync(FZK, 'utf8'); useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); await load(); });
afterEach(() => cleanup());

function scheduleOnSheet(): string {
  const sheetId = addListScheduleToSet('Doors', DOORS);
  return useProjectStore.getState().sheets.find((s) => s.id === sheetId)!.viewports![0].viewId;
}

describe('a column taken off and a cell typed over, from the sheet (#446)', () => {
  it('prints both in the sheet SVG and the PDF print, and marks the cell only in the editor', async () => {
    const id = scheduleOnSheet();
    const before = cellTexts((await drawn(id)).layout);
    assert.deepEqual(before.slice(0, 4), ['Doors', 'Name', 'Storey', 'FireRating'], 'three columns');
    assert.equal(before.filter((t) => t === 'Innentuer-2').length, 1);

    removeListColumn(id, 'storey');
    setListCellOverride(id, DOOR_2, 'fire', 'EI 30', 'Innentuer-2');
    const { sheet, layout } = await drawn(id);
    const cells = cellTexts(layout);
    assert.ok(!has(cells, 'Storey'), 'the column is off the table');
    assert.deepEqual(cells.slice(0, 3), ['Doors', 'Name', 'FireRating']);
    // The five doors (a blank cell is not drawn); the typed value is in the row of its own door and nowhere else.
    assert.equal(new Set(layout.cells!.map((c) => c.guid)).size, 5);
    assert.equal(cells.filter((t) => t === 'EI 30').length, 1);
    const door = at(cells, 'Innentuer-2');
    assert.equal(cells[door + 1], 'EI 30');
    assert.ok(!has(before, 'EI 30'));

    const svg = svgOf(sheet, layout);
    for (const doc of [svg.live, svg.exported, svg.print]) {
      assert.match(doc, />EI 30</);
      assert.doesNotMatch(doc, />Storey</);
    }
    assert.match(svg.live, /data-overridden-cell/, 'the editor marks the typed cell');
    assert.doesNotMatch(svg.exported, /data-overridden-cell/, 'the SVG carries no mark');
    assert.doesNotMatch(svg.print, /data-overridden-cell/, 'the PDF carries no mark');
  });

  it('reports the cell a click lands on by its element and column, not by place', async () => {
    const id = scheduleOnSheet();
    const { sheet, layout } = await drawn(id);
    const box = layout.fit!.box;
    const cell = layout.cells!.find((c) => c.guid === DOOR_2 && c.column === 'fire')!;
    assert.ok(cell, 'the cell of Innentuer-2, FireRating is pickable');
    const hit = cellAt(layout, { x: box.x + cell.x + cell.w / 2, y: box.y + cell.y + cell.h / 2 });
    assert.deepEqual([hit?.guid, hit?.column], [DOOR_2, 'fire']);
    assert.equal(cellAt(layout, { x: box.x - 5, y: box.y - 5 }), null);
    assert.equal(sheet.viewports!.length, 1);
  });

  it('is one undo step each, and "Reset to model value" prints the model\'s again', async () => {
    const id = scheduleOnSheet();
    setListCellOverride(id, DOOR_2, 'fire', 'EI 30', 'Innentuer-2');
    assert.equal(scheduleById(id)!.list!.overrides!.length, 1);
    setListCellOverride(id, DOOR_2, 'fire', 'EI 60', 'Innentuer-2');
    assert.deepEqual(scheduleById(id)!.list!.overrides!.map((o) => o.value), ['EI 60'], 'a second edit of the cell replaces the first');
    undo();
    assert.deepEqual(scheduleById(id)!.list!.overrides!.map((o) => o.value), ['EI 30'], 'one undo takes back one edit');
    resetListCellOverride(id, DOOR_2, 'fire');
    assert.equal(scheduleById(id)!.list!.overrides, undefined, 'reset leaves no override');
    assert.ok(!has(cellTexts((await drawn(id)).layout), 'EI 30'));
    undo();
    assert.equal(scheduleById(id)!.list!.overrides!.length, 1, 'and the reset is one step too');
  });

  it('keeps what was typed when the builder saves the definition, and when the column is taken off and put back', async () => {
    const id = scheduleOnSheet();
    setListCellOverride(id, DOOR_2, 'fire', 'EI 30', 'Innentuer-2');
    // The builder's save passes a definition without overrides (`draftToDef`).
    const { setListSchedule, addListColumn } = await import('@/joinery/list-schedule-actions');
    setListSchedule(id, { ...DOORS, columns: [NAME, FIRE] });
    assert.equal(scheduleById(id)!.list!.overrides!.length, 1);
    removeListColumn(id, 'fire');
    addListColumn(id, FIRE);
    const cells = cellTexts((await drawn(id)).layout);
    assert.equal(cells[at(cells, 'Innentuer-2') + 1], 'EI 30');
  });
});

describe('the project keeps them, and the engine prints the same (#446)', () => {
  it('survives a save and a reopen, in the app\'s reader and the engine\'s', async () => {
    const id = scheduleOnSheet();
    removeListColumn(id, 'storey');
    setListCellOverride(id, DOOR_2, 'fire', 'EI 30', 'Innentuer-2');
    const saved = serializeProject(projectDocument());
    const expected = { ...DOORS, columns: [NAME, FIRE], overrides: [{ guid: DOOR_2, key: 'property:Pset_DoorCommon:FireRating', value: 'EI 30', about: 'Innentuer-2' }] };
    assert.deepEqual(parseProjectFile(saved).schedules?.find((s) => s.kind === 'list')?.list, expected);
    assert.deepEqual(readProjectFile(saved).schedules.find((s) => s.kind === 'list')?.list, expected);
  });

  it('is the table a headless build of the saved project prints: the engine\'s, and the command line\'s', async (t) => {
    const id = scheduleOnSheet();
    removeListColumn(id, 'storey');
    setListCellOverride(id, DOOR_2, 'fire', 'EI 30', 'Innentuer-2');
    const saved = serializeProject(projectDocument());
    const list = readProjectFile(saved).schedules.find((s) => s.kind === 'list')!.list!;

    const { pairs, modelUnits } = prepareListProviders(useViewerStore.getState(), {});
    const run = await runListSchedule({ id: 's', name: 'Doors', list }, pairs, modelUnits, useViewerStore.getState());
    const appTable = listScheduleTable(listTableSourceOf(run, list, WORDS), list, 'Doors', WORDS);
    const model = await openModel(new TextEncoder().encode(step), { geometry: false });
    const headTable = listScheduleTableOn(model, { id: 's', name: 'Doors', list }, 'en');
    assert.deepEqual(headTable.header, appTable.header);
    assert.deepEqual(headTable.rows, appTable.rows);
    assert.equal(headTable.rows.filter((r) => has(r, 'EI 30')).length, 1);
    assert.deepEqual(headTable.rows.find((r) => has(r, 'EI 30')), ['Innentuer-2', 'EI 30']);

    if (!existsSync(BIN)) { t.skip('the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`'); return; }
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-override-'));
    try {
      const file = join(dir, 'p.ifclite-project.json');
      writeFileSync(file, saved);
      const out = JSON.parse((await promisify(execFile)(process.execPath, [BIN, 'list', FZK, '--project', file, '--json'], { maxBuffer: 64 * 1024 * 1024 })).stdout) as { header: string[]; rows: unknown[][] };
      assert.deepEqual(out.header, appTable.header);
      assert.deepEqual(out.rows.find((r) => has(r, 'EI 30')), ['Innentuer-2', 'EI 30']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.ok(has(listTableCells(appTable, 'en').flat(), 'EI 30'));
  });
});

describe('a model update (#446)', () => {
  /** The next model version: the first door is gone (its line and its place in the storey), so the rows move up. */
  const withoutDoor1 = (source: string): string => {
    return source.replace(/\n#17468= IFCDOOR\([^\n]*/, '').replace('#17040,#17468,#18407', '#17040,#18407');
  };

  it('keeps a typed value on its door when the rows move, and reports the door that is gone', async () => {
    const id = scheduleOnSheet();
    setListCellOverride(id, DOOR_2, 'fire', 'EI 30', 'Innentuer-2');
    setListCellOverride(id, DOOR_1, 'fire', 'EI 90', 'Innentuer-1');
    const names = (l: ScheduleLayout) => cellTexts(l).filter((x) => x.slice(0, 10) === 'Innentuer-');
    const first = await drawn(id);
    assert.equal(names(first.layout)[0], 'Innentuer-1');

    const updated = withoutDoor1(step);
    assert.notEqual(updated, step, 'the update changed the model');
    await reloadAs(updated);
    const { layout } = await drawn(id);
    const cells = cellTexts(layout);
    assert.ok(!has(cells, 'Innentuer-1'), 'the door is gone from the table');
    assert.equal(new Set(layout.cells!.map((c) => c.guid)).size, 4, 'four doors are left');
    assert.equal(cells[at(cells, 'Innentuer-2') + 2], 'EI 30', 'the value followed its door, which moved up a row');
    assert.ok(!has(cells, 'EI 90'), 'the gone door\'s value is not printed on another');

    const found = currentFindings().filter((f) => f.kind === 'orphanedOverride');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].guids, [DOOR_1]);
    assert.equal(found[0].scheduleId, id);
    assert.match(describeFinding(found[0]), /Doors.*1 typed value for "Innentuer-1".*no longer in the model/);

    // Dropping them is one undo step; the door that is still there keeps its value.
    assert.ok(removeFindingAnnotation(found[0]));
    assert.deepEqual(scheduleById(id)!.list!.overrides!.map((o) => o.guid), [DOOR_2]);
    assert.equal(currentFindings().filter((f) => f.kind === 'orphanedOverride').length, 0);
    undo();
    assert.equal(scheduleById(id)!.list!.overrides!.length, 2);
  });

  it('reports nothing while no model is loaded: every GlobalId is unknown then, and none of them is gone', async () => {
    const id = scheduleOnSheet();
    setListCellOverride(id, DOOR_2, 'fire', 'EI 30', 'Innentuer-2');
    useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null });
    assert.equal(currentFindings().filter((f) => f.kind === 'orphanedOverride').length, 0);
  });
});
