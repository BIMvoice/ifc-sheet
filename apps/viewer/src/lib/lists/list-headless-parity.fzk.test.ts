/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #78, headless: the list schedule run by the engine over its own provider (`createHeadlessListProvider`, what `ifcsheet list` and the MCP
 * tools use) gives EXACTLY what the app gives for the same definition on AC20-FZK-Haus: the provider answers every question the app's provider
 * answers the same, and the rows, groups, totals, table and CSV that follow are equal. The walls by type: groups 136.2761 and 54.1895, total 190.4655.
 * The command line is run as a process and its CSV is compared with the app's file.
 */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { IfcTypeEnum } from '@ifc-lite/data';
import { listExportTable, listScheduleTable, listWordsFor, type ListScheduleDef } from '@bimvoice/ifcsheet';
import { createHeadlessListProvider, listScheduleCsv } from '@bimvoice/ifcsheet/headless';
import { runListScheduleHeadless } from '@bimvoice/ifcsheet/list-projection';
import { loadUrbanModel } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { exportCsv } from '@/joinery/schedule-export';
import { listScheduleExport } from './list-schedule-export';
import { listTableSourceOf, runListSchedule } from './list-schedule-run';
import { prepareListProviders } from './prepare-providers';

const FZK = resolve(import.meta.dirname, '../../test/__fixtures__/AC20-FZK-Haus.ifc');
const BIN = resolve(import.meta.dirname, '../../../../../packages/ifcsheet/dist/bin.js');
const WORDS = { ...listWordsFor('en') };
const TODAY = new Date(0);

const TYPE = { id: 'type', source: 'attribute', propertyName: 'Type' } as const;
const AREA = { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' } as const;
const WALLS_BY_TYPE: ListScheduleDef = { filter: { classes: ['IfcWallStandardCase'] }, columns: [TYPE, AREA], groupBy: ['type'], sum: ['area'] };
/** Columns that read every source the provider answers: attributes, a property, the Type fallback, material, classification, the spatial levels. */
const EVERY_SOURCE: ListScheduleDef = {
  columns: [
    { id: 'name', source: 'attribute', propertyName: 'Name' }, { id: 'class', source: 'attribute', propertyName: 'Class' }, { id: 'type', source: 'attribute', propertyName: 'Type' },
    { id: 'guid', source: 'attribute', propertyName: 'GlobalId' }, { id: 'desc', source: 'attribute', propertyName: 'Description' }, { id: 'otype', source: 'attribute', propertyName: 'ObjectType' },
    { id: 'tag', source: 'attribute', propertyName: 'Tag' }, { id: 'predef', source: 'attribute', propertyName: 'PredefinedType' },
    { id: 'room', source: 'property', psetName: 'ArchiCADProperties', propertyName: 'Raumname' }, { id: 'fire', source: 'property', psetName: 'Pset_WallCommon', propertyName: 'FireRating' },
    { id: 'tvolume', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetVolume' }, { id: 'material', source: 'material', propertyName: 'Name' },
    { id: 'storey', source: 'spatial', propertyName: 'Storey' }, { id: 'building', source: 'spatial', propertyName: 'Building' }, { id: 'site', source: 'spatial', propertyName: 'Site' },
    { id: 'project', source: 'spatial', propertyName: 'Project' }, { id: 'container', source: 'spatial', propertyName: 'Container' },
  ],
};

/** AC20-FZK-Haus with a property set and a quantity set on the type of its eight 300 mm walls ONLY (the fixture's types carry none the Lists engine reads): the Type fallback has something to find. */
function withTypeSets(text: string): string {
  const entities = [
    "#990001= IFCPROPERTYSINGLEVALUE('TypeOnlyRating',$,IFCLABEL('TYPE-R60'),$);",
    "#990002= IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaaa',#12,'Pset_TypeOnly',$,(#990001));",
    "#990003= IFCQUANTITYAREA('TypeOnlyArea',$,$,2.5);",
    "#990004= IFCELEMENTQUANTITY('0bbbbbbbbbbbbbbbbbbbbb',#12,'Qto_TypeOnly',$,$,(#990003));",
  ].join('\n');
  const patched = text.replace("'Leichtbeton 102890359 300',$,$,$,(", "'Leichtbeton 102890359 300',$,$,(#990002,#990004),(").replace(/\nENDSEC;\s*END-ISO-10303-21;\s*$/, `\n${entities}\nENDSEC;\nEND-ISO-10303-21;\n`);
  if (patched === text || !patched.includes('#990004')) throw new Error('the fixture could not be patched');
  return patched;
}

const TYPE_ONLY: ListScheduleDef = {
  filter: { classes: ['IfcWallStandardCase'] },
  columns: [TYPE, { id: 'rating', source: 'property', psetName: 'Pset_TypeOnly', propertyName: 'TypeOnlyRating' }, { id: 'tarea', source: 'quantity', psetName: 'Qto_TypeOnly', propertyName: 'TypeOnlyArea' }],
  groupBy: ['type', 'rating'], sum: ['tarea'],
};

const DEFINITIONS: Record<string, ListScheduleDef> = {
  'values defined once on the type (the Type fallback)': TYPE_ONLY,
  'walls by type': WALLS_BY_TYPE,
  'every source, a row per element': EVERY_SOURCE,
  'every class by class and storey': { columns: [{ id: 'class', source: 'attribute', propertyName: 'Class' }, { id: 'storey', source: 'spatial', propertyName: 'Storey' }, { id: 'vol', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetVolume' }], groupBy: ['class', 'storey'], sum: ['vol'] },
  'a storey and a property cut': { filter: { classes: ['IfcWallStandardCase'], levels: ['Erdgeschoss'], properties: [{ pset: 'ArchiCADProperties', name: 'Raumname', op: 'notEquals', value: 'Wohnen' }] }, columns: [TYPE, AREA], groupBy: ['type'], sum: ['area'] },
  'no totals row, a hidden column': { filter: { classes: ['IfcWallStandardCase'] }, columns: [TYPE, AREA, { id: 'name', source: 'attribute', propertyName: 'Name', hidden: true }], groupBy: ['type'], sum: ['area'], totals: false },
  'a class the model lacks': { filter: { classes: ['IfcNoSuchThing'] }, columns: [TYPE] },
};

const state = () => useViewerStore.getState();
async function load(): Promise<void> {
  useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null });
  await loadUrbanModel('fzk', new TextEncoder().encode(withTypeSets(readFileSync(FZK, 'utf8'))), []);
}
beforeEach(load);

/** The headless side: the engine's provider over the SAME parsed store the app's provider reads. */
function headless() {
  const model = state().models.get('fzk')!;
  return createHeadlessListProvider(model.ifcDataStore!, model.name);
}

describe('the headless provider answers every question the app\'s provider answers (#78)', () => {
  it('is equal on every element of AC20-FZK-Haus, method by method', () => {
    const app = prepareListProviders(state(), {}).pairs[0].provider;
    const head = headless();
    const ids = app.getAllEntityIds!();
    assert.ok(ids.length > 50, `the model has elements: ${ids.length}`);
    assert.deepEqual(head.getAllEntityIds!(), ids);
    for (const type of [IfcTypeEnum.IfcWallStandardCase, IfcTypeEnum.IfcWindow, IfcTypeEnum.IfcDoor, IfcTypeEnum.IfcSlab, IfcTypeEnum.IfcSpace]) assert.deepEqual(head.getEntitiesByType(type), app.getEntitiesByType(type));
    const methods = [
      'getEntityName', 'getEntityGlobalId', 'getEntityDescription', 'getEntityObjectType', 'getEntityPredefinedType', 'getEntityTag', 'getEntityTypeName',
      'getEntityDefiningTypeName', 'getPropertySets', 'getQuantitySets', 'getTypePropertySets', 'getTypeQuantitySets', 'getMaterialNames', 'getClassifications',
      'getStoreyName', 'getAggregateParents', 'getContainerName', 'getBuildingName', 'getSiteName', 'getWorldPosition',
    ] as const;
    for (const id of ids) for (const m of methods) assert.deepEqual((head[m] as (i: number) => unknown)?.(id), (app[m] as (i: number) => unknown)?.(id), `${m}(#${id})`);
    assert.equal(head.getProjectName!(), app.getProjectName!());
    assert.equal(head.getModelName!(), app.getModelName!());
    // The comparison reads something: the walls have a type with quantities and properties of its own, a storey, a building.
    const wall = app.getEntitiesByType(IfcTypeEnum.IfcWallStandardCase)[0];
    assert.ok(app.getEntityDefiningTypeName!(wall) !== '' && app.getStoreyName!(wall) !== '' && app.getBuildingName!(wall) !== '' && app.getQuantitySets(wall).length > 0);
    // And the Type fallback has sets to compare: the type of the 300 mm walls carries a property set and a quantity set of its own.
    const onType = ids.filter((id) => (app.getTypePropertySets!(id).length > 0) && (app.getTypeQuantitySets!(id).length > 0));
    assert.equal(onType.length, 8, 'the eight 300 mm walls read the sets of their type');
  });
});

describe('the headless run gives the app\'s rows, groups, totals and files (#78)', () => {
  for (const [label, list] of Object.entries(DEFINITIONS)) {
    it(`is equal for ${label}`, async () => {
      const { pairs, modelUnits } = prepareListProviders(state(), {});
      const schedule = { id: 's', name: 'Schedule', list };
      const app = await runListSchedule(schedule, pairs, modelUnits, state(), { today: TODAY });
      const head = runListScheduleHeadless(schedule, [{ modelId: 'fzk', provider: headless() }], modelUnits, { unitDisplayOverrides: state().unitDisplayOverrides, today: TODAY });
      assert.deepEqual(head.result.rows, app.result.rows);
      assert.deepEqual(head.result.groups, app.result.groups);
      assert.deepEqual(head.result.summary, app.result.summary);
      assert.deepEqual(head.model, app.model);
      const appTable = listScheduleTable(listTableSourceOf(app, list, WORDS), list, 'Schedule', WORDS);
      const headTable = listScheduleTable(listTableSourceOf(head, list, WORDS), list, 'Schedule', WORDS);
      assert.deepEqual(headTable, appTable);
      assert.equal(listScheduleCsv(headTable, 'en'), exportCsv({ title: 'Schedule', tables: [listExportTable(appTable)] }));
    });
  }

  it('reads a value defined once on the type for every wall of the type', async () => {
    const { modelUnits } = prepareListProviders(state(), {});
    const head = runListScheduleHeadless({ id: 's', name: 'Type only', list: TYPE_ONLY }, [{ modelId: 'fzk', provider: headless() }], modelUnits);
    const leaves = (head.result.groups ?? []).filter((g) => g.level === 1 && g.path?.[1] === 'TYPE-R60');
    assert.equal(leaves.length, 1);
    assert.equal(leaves[0].count, 8);
    assert.equal(leaves[0].sums.tarea, 20);
  });

  it('is the walls by type of the issue: groups 136.2761 and 54.1895, total 190.4655, 13 walls', async () => {
    const { modelUnits } = prepareListProviders(state(), {});
    const head = runListScheduleHeadless({ id: 's', name: 'Walls', list: WALLS_BY_TYPE }, [{ modelId: 'fzk', provider: headless() }], modelUnits);
    const groups = (head.result.groups ?? []).filter((g) => g.level === 0);
    assert.deepEqual(groups.map((g) => Number(g.sums.area.toFixed(4))).sort((a, b) => b - a), [136.2761, 54.1895]);
    assert.equal(head.result.summary?.count, 13);
    assert.equal(Number(head.result.summary!.sums.area.toFixed(4)), 190.4655);
  });

  it('writes the CSV the app writes when the command line is run on the saved project', async (t) => {
    if (!existsSync(BIN)) { t.skip('the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`'); return; }
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-list-parity-'));
    try {
      const file = join(dir, 'p.ifclite-project.json');
      writeFileSync(file, JSON.stringify({ format: 'ifclite-project', version: 1, schedules: [{ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 1, list: WALLS_BY_TYPE }] }));
      const cli = (await promisify(execFile)(process.execPath, [BIN, 'list', FZK, '--project', file, '--csv'], { maxBuffer: 64 * 1024 * 1024 })).stdout;
      const data = await listScheduleExport({ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 1, list: WALLS_BY_TYPE }, { ...WORDS });
      assert.ok(data);
      assert.equal(cli, exportCsv(data));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
