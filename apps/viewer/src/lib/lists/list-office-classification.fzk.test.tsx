/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #351, on AC20-FZK-Haus: a list schedule of the walls grouped by the office classification code shows the mapped codes, and holds the same
 * grouping as the quantities-by-type schedule (#89) for the same mapping. Both resolve through `classificationOf`; the model's own
 * IfcClassificationReference still wins; the CSV carries the code. Every code is an EXAMPLE made up for the test.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RelationshipType } from '@ifc-lite/data';
import { listScheduleTable, readListScheduleDef, type ListScheduleDef } from '@bimvoice/ifcsheet';
import { cleanup } from '@/test/render.js';
import { loadUrbanModel } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addClassificationMapping, setClassificationRule } from '@/classification/classification-actions';
import { typeQuantitiesOf } from '@/joinery/type-quantities-models';
import { exportCsv } from '@/joinery/schedule-export';
import { listScheduleExport } from './list-schedule-export';
import { listTableSourceOf, runListSchedule } from './list-schedule-run';
import { prepareListProviders } from './prepare-providers';

const FZK = resolve(import.meta.dirname, '../../test/__fixtures__/AC20-FZK-Haus.ifc');
const TYPE_240 = 'Leichtbeton 102890359 240';
const TYPE_300 = 'Leichtbeton 102890359 300';
const WORDS = { count: 'Count', total: 'Total', yes: 'Yes', no: 'No' };

const CODE = { id: 'code', source: 'officeClassification', propertyName: 'Code' } as const;
const TITLE = { id: 'title', source: 'officeClassification', propertyName: 'Title' } as const;
/** Walls grouped by the office classification code: the list of the issue's "Done when". */
const WALLS_BY_CODE: ListScheduleDef = { filter: { classes: ['IfcWallStandardCase'] }, columns: [CODE], groupBy: ['code'], totals: false };

const text = readFileSync(FZK, 'utf8');
const load = async (source = text) => { await loadUrbanModel('fzk', new TextEncoder().encode(source), []); };
const reset = () => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map(), ifcDataStore: null }); };

/** The office's table, through the app's own actions: the two wall types have each a code. */
function exampleMapping(): string {
  const id = addClassificationMapping('Uniclass', '2015');
  setClassificationRule(id, 'type', TYPE_240, 'EXAMPLE-Ss_25_10', 'EXAMPLE: thick walls');
  setClassificationRule(id, 'type', TYPE_300, 'EXAMPLE-Ss_25_20', 'EXAMPLE: thickest walls');
  return id;
}

async function table(list: ListScheduleDef) {
  const { pairs, modelUnits } = prepareListProviders(useViewerStore.getState(), {});
  const run = await runListSchedule({ id: 's', name: 'Walls', list }, pairs, modelUnits, useViewerStore.getState());
  return listScheduleTable(listTableSourceOf(run, list, WORDS), list, 'Walls', WORDS);
}

/** The model text with an IfcClassificationReference on one wall of the 240 type, and that wall's express id. */
function withReferenceOnOneWall(): string {
  const store = useViewerStore.getState().models.get('fzk')!.ifcDataStore!;
  const typeId = [...(store.entityIndex.byType.get('IFCWALLTYPE') ?? [])].find((id) => store.entities.getName(id) === TYPE_240)!;
  const wallId = store.relationships!.getRelated(typeId, RelationshipType.DefinesByType, 'forward')[0];
  const injected = text.replace(/\nENDSEC;\s*\nEND-ISO-10303-21;\s*$/, `\n#900001= IFCCLASSIFICATION('EXAMPLE','2015',$,'Uniclass 2015',$,$,$);\n#900002= IFCCLASSIFICATIONREFERENCE($,'EXAMPLE-OWN','EXAMPLE: the model says',#900001,$,$);\n#900003= IFCRELASSOCIATESCLASSIFICATION('0EXAMPLEclassification',#12,$,$,(#${wallId}),#900002);\nENDSEC;\nEND-ISO-10303-21;\n`);
  assert.notEqual(injected, text, 'the reference was injected');
  return injected;
}

beforeEach(reset);
afterEach(() => cleanup());

describe('a list schedule of the walls grouped by the office classification code (the done-when)', () => {
  it('shows the mapped codes, and the groups the quantities-by-type schedule gives for the same mapping', async () => {
    await load();
    const mapping = exampleMapping();
    const t = await table(WALLS_BY_CODE);
    assert.deepEqual(t.header, ['Code', 'Count']);
    const listed = new Map(t.rows.map((r) => [String(r[0]), Number(r[1])]));
    assert.ok(listed.get('EXAMPLE-Ss_25_10')! > 0 && listed.get('EXAMPLE-Ss_25_20')! > 0, `both wall types have their code: ${JSON.stringify([...listed])}`);
    assert.equal([...listed.values()].reduce((a, b) => a + b, 0), 13, 'every wall is in one group');

    // The other witness: the type schedule (#89) with the same mapping, its wall rows summed by code.
    const data = typeQuantitiesOf({ mapping, group: true });
    const typed = new Map<string, number>();
    for (const r of data.rows.filter((row) => row.className === 'IfcWallType' || row.className.startsWith('IfcWall'))) {
      const code = r.classification?.code ?? '';
      typed.set(code, (typed.get(code) ?? 0) + r.total.count);
    }
    assert.deepEqual([...typed].sort(), [...listed].map(([code, n]) => [code === '' ? '' : code, n] as [string, number]).sort(), 'the list and the type schedule group the walls alike');
  });

  it('puts the title beside the code, and a wall no rule reaches has an empty cell', async () => {
    await load();
    exampleMapping();
    const t = await table({ filter: { classes: ['IfcWallStandardCase'] }, columns: [CODE, TITLE], groupBy: ['code', 'title'], totals: false });
    assert.deepEqual(t.header.slice(0, 2), ['Code', 'Title']);
    assert.ok(t.rows.some((r) => r[0] === 'EXAMPLE-Ss_25_10' && r[1] === 'EXAMPLE: thick walls'));
    const none = await table({ filter: { classes: ['IfcWallStandardCase'] }, columns: [CODE] });
    assert.equal(none.rows.length, 13);
    assert.ok(none.rows.every((r) => r[0] === 'EXAMPLE-Ss_25_10' || r[0] === 'EXAMPLE-Ss_25_20'), 'the walls are of the two types');
  });

  it('names a mapping by id, and without a mapping shows nothing of the office\'s', async () => {
    await load();
    const first = exampleMapping();
    const second = addClassificationMapping('Office');
    setClassificationRule(second, 'type', TYPE_240, 'OFFICE-W1');
    const of = (mappingId?: string) => table({ filter: { classes: ['IfcWallStandardCase'] }, columns: [{ ...CODE, ...(mappingId ? { psetName: mappingId } : {}) }], groupBy: ['code'], totals: false });
    assert.ok((await of(first)).rows.some((r) => r[0] === 'EXAMPLE-Ss_25_10'));
    assert.ok((await of()).rows.some((r) => r[0] === 'EXAMPLE-Ss_25_10'), 'absent: the project\'s first, as tags');
    const other = (await of(second)).rows.map((r) => r[0]);
    assert.ok(other.includes('OFFICE-W1') && !other.includes('EXAMPLE-Ss_25_10'));
    useProjectStore.setState({ classificationMappings: [] });
    const bare = (await of()).rows;
    assert.equal(bare.length, 1, 'one group: the walls without a code');
    assert.equal(bare[0][1], 13);
    assert.ok(!String(bare[0][0]).includes('EXAMPLE') && !String(bare[0][0]).includes('OFFICE'), 'no mapping, no code');
  });
});

describe('the model\'s own reference still wins (as in classificationOf)', () => {
  it('splits the type into the wall that carries a code and the walls the mapping codes, as the type schedule does', async () => {
    await load();
    const injected = withReferenceOnOneWall();
    reset();
    await load(injected);
    const mapping = exampleMapping();
    const listed = new Map((await table(WALLS_BY_CODE)).rows.map((r) => [String(r[0]), Number(r[1])]));
    assert.equal(listed.get('EXAMPLE-OWN'), 1);
    const typed = typeQuantitiesOf({ mapping, group: true }).rows.filter((r) => r.typeName === TYPE_240);
    assert.deepEqual(typed.map((r) => [r.classification!.code, r.total.count]).sort(), [['EXAMPLE-OWN', 1], ['EXAMPLE-Ss_25_10', listed.get('EXAMPLE-Ss_25_10')]]);
    const title = await table({ filter: { classes: ['IfcWallStandardCase'] }, columns: [CODE, TITLE], groupBy: ['code', 'title'], totals: false });
    assert.ok(title.rows.some((r) => r[0] === 'EXAMPLE-OWN' && r[1] === 'EXAMPLE: the model says'));
  });
});

describe('the files carry the code', () => {
  it('writes the code and the title to the CSV', async () => {
    await load();
    exampleMapping();
    const list: ListScheduleDef = { filter: { classes: ['IfcWallStandardCase'] }, columns: [CODE, TITLE], groupBy: ['code', 'title'], totals: false };
    const data = await listScheduleExport({ id: 's', name: 'Walls', kind: 'list', createdAt: 0, list }, WORDS);
    assert.ok(data);
    const csv = exportCsv(data);
    assert.match(csv, /EXAMPLE-Ss_25_10,EXAMPLE: thick walls,/);
    assert.match(csv, /EXAMPLE-Ss_25_20,EXAMPLE: thickest walls,/);
  });
});

describe('the definition keeps the column', () => {
  it('reads a saved office classification column back, with its mapping id', () => {
    const list = readListScheduleDef({ columns: [{ id: 'code', source: 'officeClassification', propertyName: 'Code', psetName: 'm1' }], groupBy: ['code'], totals: false });
    assert.deepEqual(list.columns, [{ id: 'code', source: 'officeClassification', propertyName: 'Code', psetName: 'm1' }]);
    assert.deepEqual(list.groupBy, ['code']);
  });
});
