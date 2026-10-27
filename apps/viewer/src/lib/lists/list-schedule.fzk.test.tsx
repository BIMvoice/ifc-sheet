/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #78, on AC20-FZK-Haus: a schedule of the walls by type with the count and the NetSideArea, placed on a sheet, holds the numbers the Lists
 * panel gives for the same list. The panel's side is a `ListDefinition` written by hand here and run through `runListFederated`; the sheet's side
 * is a `ProjectSchedule` of kind `list` drawn by `useSheetSchedules`; the hand sum of the thirteen walls' quantities is a third witness that reads
 * the model without the Lists engine. The files, the saved project and the filters are pinned against the same model.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import ExcelJS from 'exceljs';
import { IfcTypeEnum } from '@ifc-lite/data';
import type { ListDefinition } from '@ifc-lite/lists';
import { extractQuantitiesOnDemand } from '@ifc-lite/parser';
import type { ListScheduleDef } from '@bimvoice/ifcsheet';
import { readProjectFile } from '@bimvoice/ifcsheet/headless';
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { cleanup, render } from '@/test/render.js';
import { loadUrbanModel } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { useProjectStore, resetProject, projectDocument } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { addListScheduleToSet } from '@/joinery/list-schedule-actions';
import { scheduleById } from '@/joinery/schedules';
import { exportCsv, exportXlsx } from '@/joinery/schedule-export';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import type { ScheduleLayout, SchedulePrim } from '@/joinery/schedule-layout';
import { listScheduleTable } from '@bimvoice/ifcsheet';
import { listExportTable, listScheduleExport } from './list-schedule-export';
import { listTableSourceOf, runListSchedule } from './list-schedule-run';
import { prepareListProviders } from './prepare-providers';
import { runListFederated } from './run-list';

const FZK = resolve(import.meta.dirname, '../../test/__fixtures__/AC20-FZK-Haus.ifc');
const AREA_SET = 'BaseQuantities';
const WORDS = { count: 'Count', total: 'Total', yes: 'Yes', no: 'No' };

const TYPE = { id: 'type', source: 'attribute', propertyName: 'Type' } as const;
const AREA = { id: 'area', source: 'quantity', psetName: AREA_SET, propertyName: 'NetSideArea' } as const;
/** Walls by type with the count and the area: the list of the issue's "Done when". */
const WALLS_BY_TYPE: ListScheduleDef = {
  filter: { classes: ['IfcWallStandardCase'] }, columns: [TYPE, AREA], groupBy: ['type'], sum: ['area'],
};
/** The same list as the Lists panel would hold it, written without the schedule's code. */
const PANEL_LIST: ListDefinition = {
  id: 'panel', name: 'Walls by type', createdAt: 0, updatedAt: 0, entityTypes: [IfcTypeEnum.IfcWallStandardCase], groups: [],
  columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: AREA_SET, propertyName: 'NetSideArea' }],
  grouping: { columnId: 'type', columnIds: ['type'], sumColumnIds: ['area'], view: 'schedule' },
};

let text = readFileSync(FZK, 'utf8');
const load = async (source = text) => { await loadUrbanModel('fzk', new TextEncoder().encode(source), []); };
const providers = () => prepareListProviders(useViewerStore.getState(), {});

type Text = Extract<SchedulePrim, { kind: 'text' }>;
const texts = (l: ScheduleLayout): string[] => l.prims.filter((p): p is Text => p.kind === 'text').map((p) => p.text);

/** The layout the sheet that holds `id` draws, once the list has run. */
async function printed(id: string): Promise<ScheduleLayout> {
  const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;
  let layouts: ReturnType<typeof useSheetSchedules> | null = null;
  function Probe() { layouts = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  for (let i = 0; i < 100 && !(layouts as unknown as ReturnType<typeof useSheetSchedules> | null)?.get(id); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  const layout = (layouts as unknown as ReturnType<typeof useSheetSchedules>).get(id);
  cleanup();
  assert.ok(layout, 'the sheet drew the schedule');
  return layout;
}

/** The thirteen walls' NetSideArea summed by type name, read without the Lists engine: from the store's own quantity sets and the IFC text of the type. */
function handSums(): { byType: Map<string, { count: number; area: number }>; walls: number; area: number } {
  const store = useViewerStore.getState().models.get('fzk')!.ifcDataStore!;
  const byType = new Map<string, { count: number; area: number }>();
  let area = 0;
  const walls = store.entities.getByType(IfcTypeEnum.IfcWallStandardCase);
  for (const id of walls) {
    const q = extractQuantitiesOnDemand(store, id).flatMap((set) => set.quantities).find((x) => x.name === 'NetSideArea');
    assert.ok(q, `wall #${id} states a NetSideArea`);
    // The type of the wall: the IfcWallType that lists it among its occurrences, by its name in the IFC text.
    const type = typeNameOfWall(id);
    const row = byType.get(type) ?? { count: 0, area: 0 };
    row.count += 1; row.area += q.value; byType.set(type, row); area += q.value;
  }
  return { byType, walls: walls.length, area };
}
function typeNameOfWall(id: number): string {
  for (const m of text.matchAll(/IFCRELDEFINESBYTYPE\([^;]*?\(([^)]*)\),#(\d+)\);/g)) {
    if (m[1].split(',').includes(`#${id}`)) return (text.match(new RegExp(`#${m[2]}= IFCWALLTYPE\\('[^']*',#\\d+,'([^']*)'`)) ?? [])[1] ?? '';
  }
  return '';
}

beforeEach(() => { resetProject(); text = readFileSync(FZK, 'utf8'); useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); });
afterEach(() => cleanup());

describe('a schedule of the walls by type, placed on a sheet, holds the Lists panel\'s numbers (#78)', () => {
  it('draws the panel\'s groups, counts and areas, and the panel\'s total, in the panel\'s order', async () => {
    await load();
    const { pairs, modelUnits } = providers();
    const panel = await runListFederated(PANEL_LIST, pairs, useViewerStore.getState());
    const groups = (panel.groups ?? []).filter((g) => g.level === 0);
    assert.ok(groups.length >= 2, 'the walls are of more than one type');
    assert.equal(panel.summary?.count, 13);

    const sheetId = addListScheduleToSet('Walls by type', WALLS_BY_TYPE);
    const id = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!.viewports![0].viewId;
    const drawn = texts(await printed(id));

    const fmt = (v: number) => sheetNumber('en', v, 2, { kind: 'area' });
    const expected = [
      'Walls by type',
      'Type', 'Count', 'NetSideArea (m²)',
      ...groups.flatMap((g) => [g.label, String(g.count), fmt(g.sums.area!)]),
      'Total', String(panel.summary!.count), fmt(panel.summary!.sums.area!),
    ];
    assert.deepEqual(drawn, expected);

    // And the Lists engine is not the only witness: the hand sum of the model's own quantities.
    const hand = handSums();
    assert.equal(hand.walls, 13);
    assert.ok(Math.abs(hand.area - panel.summary!.sums.area!) < 1e-6, `${hand.area} vs ${panel.summary!.sums.area}`);
    for (const g of groups) {
      const h = hand.byType.get(g.label);
      assert.ok(h, `a type named ${g.label}`);
      assert.equal(h.count, g.count);
      assert.ok(Math.abs(h.area - g.sums.area!) < 1e-6);
    }
    void modelUnits;
  });

  it('is run with the filter of the schedule: a storey and a property test keep only the walls that pass', async () => {
    await load();
    const { pairs, modelUnits } = providers();
    const state = useViewerStore.getState();
    const all = await runListSchedule({ id: 's', name: 'Walls', list: WALLS_BY_TYPE }, pairs, modelUnits, state);
    const byStorey = new Map<string, number>();
    const flat = await runListSchedule({ id: 's', name: 'Walls', list: { filter: { classes: ['IfcWallStandardCase'] }, columns: [{ id: 'storey', source: 'spatial', propertyName: 'Storey' }] } }, pairs, modelUnits, state);
    for (const r of flat.result.rows) byStorey.set(String(r.values[0]), (byStorey.get(String(r.values[0])) ?? 0) + 1);
    assert.ok(byStorey.size >= 2, `the walls are on more than one storey: ${JSON.stringify([...byStorey])}`);
    const [level, n] = [...byStorey][0];
    const cut = await runListSchedule({ id: 's', name: 'Walls', list: { ...WALLS_BY_TYPE, filter: { classes: ['IfcWallStandardCase'], levels: [level] } } }, pairs, modelUnits, state);
    assert.equal(cut.result.summary?.count, n);
    assert.ok(n < (all.result.summary?.count ?? 0), 'the storey cut is smaller than the whole');
    // A property test, against the model's own property sets: the walls of the room Wohnen (ArchiCAD's Raumname), and the rest.
    const store = state.models.get('fzk')!.ifcDataStore!;
    const walls = store.entities.getByType(IfcTypeEnum.IfcWallStandardCase);
    const inRoom = (id: number) => pairs[0].provider.getPropertySets(id).some((s) => s.name === 'ArchiCADProperties' && s.properties.some((p) => p.name === 'Raumname' && p.value === 'Wohnen'));
    const inside = walls.filter(inRoom).length;
    assert.ok(inside > 0 && inside < 13, `walls of Wohnen: ${inside}`);
    const test = (op: 'equals' | 'notEquals') => runListSchedule({ id: 's', name: 'Walls', list: { ...WALLS_BY_TYPE, filter: { classes: ['IfcWallStandardCase'], properties: [{ pset: 'ArchiCADProperties', name: 'Raumname', op, value: 'Wohnen' }] } } }, pairs, modelUnits, state);
    assert.equal((await test('equals')).result.summary?.count ?? 0, inside);
    assert.equal((await test('notEquals')).result.summary?.count ?? 0, 13 - inside, 'notEquals is the exact complement');
    // A class the model does not have keeps nothing; naming no class keeps every element.
    const none = await runListSchedule({ id: 's', name: 'Walls', list: { ...WALLS_BY_TYPE, filter: { classes: ['IfcNoSuchThing'] } } }, pairs, modelUnits, state);
    assert.equal(none.result.rows.length, 0);
    const every = await runListSchedule({ id: 's', name: 'Elements', list: { columns: [TYPE] } }, pairs, modelUnits, state);
    assert.ok(every.result.rows.length > 13);
  });

  it('prints a row per element when nothing is grouped, and leaves out a hidden column', async () => {
    await load();
    const id = addListScheduleToSet('Walls', { filter: { classes: ['IfcWallStandardCase'] }, columns: [TYPE, AREA, { id: 'name', source: 'attribute', propertyName: 'Name', hidden: true }] });
    const sheetId = useProjectStore.getState().sheets.find((s) => s.id === id)!.viewports![0].viewId;
    const drawn = texts(await printed(sheetId));
    assert.deepEqual(drawn.slice(0, 3), ['Walls', 'Type', 'NetSideArea (m²)']);
    assert.equal((drawn.length - 3) / 2, 13, 'a row of two cells per wall, no totals row, no Name');
  });
});

describe('the files hold the table the sheet draws (#80, #316)', () => {
  const csvRows = (csv: string): string[][] => csv.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(','));

  it('writes the CSV and the XLSX of the same rows, figures as numbers', async () => {
    await load();
    const id = addListScheduleToSet('Walls by type', WALLS_BY_TYPE);
    const scheduleId = useProjectStore.getState().sheets.find((s) => s.id === id)!.viewports![0].viewId;
    const drawn = texts(await printed(scheduleId)).slice(1);
    const data = await listScheduleExport(scheduleById(scheduleId)!, WORDS);
    assert.ok(data);
    const rows = csvRows(exportCsv(data));
    // Every cell of the sheet is a cell of the file, in the same place; a figure on the sheet is the file's number to two decimals.
    assert.equal(rows.flat().length, drawn.length);
    rows.flat().forEach((cell, i) => {
      const num = Number(cell);
      if (cell !== '' && Number.isFinite(num) && !/[A-Za-z]/.test(drawn[i])) assert.equal(sheetNumber('en', num, drawn[i].includes('.') ? 2 : 0, { kind: drawn[i].includes('.') ? 'area' : undefined, group: drawn[i].includes('.') ? undefined : false }), drawn[i]);
      else assert.equal(cell, drawn[i]);
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await (await exportXlsx(data, { locale: 'en' })).arrayBuffer());
    const sheet = book.worksheets[0];
    assert.equal(sheet.getRow(1).getCell(1).value, 'Walls by type');
    assert.deepEqual((sheet.getRow(2).values as unknown[]).slice(1), data.tables[0].header);
    const last = sheet.getRow(sheet.rowCount);
    assert.equal(last.getCell(1).value, 'Total');
    assert.equal(typeof last.getCell(2).value, 'number', 'the count is a numeric cell');
    assert.equal(typeof last.getCell(3).value, 'number', 'the area is a numeric cell');
    assert.equal(last.getCell(2).value, 13);
  });

  it('guards a cell that would run as a formula, in the CSV and in the XLSX', async () => {
    text = text.replace("'Leichtbeton 102890359 240'", "'=HYPERLINK(\"http://x\",\"y\")'");
    await load();
    const id = addListScheduleToSet('Walls by type', WALLS_BY_TYPE);
    const scheduleId = useProjectStore.getState().sheets.find((s) => s.id === id)!.viewports![0].viewId;
    const data = await listScheduleExport(scheduleById(scheduleId)!, WORDS);
    assert.ok(data);
    const csv = exportCsv(data);
    assert.ok(!/(^|,|\r\n)=HYPERLINK/.test(csv), 'no CSV cell starts with =');
    assert.match(csv, /'=HYPERLINK/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await (await exportXlsx(data)).arrayBuffer());
    const cells = book.worksheets[0].getColumn(1).values.map((v) => String(v ?? ''));
    assert.ok(cells.some((c) => c.startsWith("'=HYPERLINK")), 'the XLSX cell is guarded');
    assert.ok(!cells.some((c) => c.startsWith('=')));
  });

  it('is the table the sheet would draw: the same function builds both', async () => {
    await load();
    const { pairs, modelUnits } = providers();
    const run = await runListSchedule({ id: 's', name: 'Walls by type', list: WALLS_BY_TYPE }, pairs, modelUnits, useViewerStore.getState());
    const table = listScheduleTable(listTableSourceOf(run, WALLS_BY_TYPE, WORDS), WALLS_BY_TYPE, 'Walls by type', WORDS);
    assert.deepEqual(listExportTable(table).kinds, { 2: 'area' }, 'the area column carries the project\'s decimals in the XLSX; a count names none');
  });
});

describe('the definition is part of the project (#78)', () => {
  it('survives a save and a reopen, and the engine\'s own reader sees the same definition', async () => {
    addListScheduleToSet('Walls by type', WALLS_BY_TYPE);
    const saved = serializeProject(projectDocument());
    const list = parseProjectFile(saved).schedules?.find((s) => s.kind === 'list')?.list;
    assert.deepEqual(list, WALLS_BY_TYPE);
    assert.deepEqual(readProjectFile(saved).schedules.find((s) => s.kind === 'list')?.list, WALLS_BY_TYPE);
  });

  it('leaves a project without list schedules exactly as it was', () => {
    useProjectStore.setState({ schedules: [{ id: 'a', name: 'Joinery', kind: 'all', createdAt: 1, scale: 50 }] });
    const saved = serializeProject(projectDocument());
    assert.deepEqual(parseProjectFile(saved).schedules, [{ id: 'a', name: 'Joinery', kind: 'all', createdAt: 1, scale: 50 }]);
    assert.ok(!saved.includes('"list"'), 'no list field is written');
  });
});
