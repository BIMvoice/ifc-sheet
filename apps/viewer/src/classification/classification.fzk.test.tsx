/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Classification mapping in the app, on AC20-FZK-Haus (#89). The FZK-Haus carries ONE IfcClassificationReference ('000', "Allgemeines") on its
 * seven rooms and none on its walls and doors, so for the walls a copy of the model gets a reference on one wall of the 240 type. Every code below
 * is an EXAMPLE made up for the test: IfcSheet ships no Uniclass or OmniClass table.
 *
 * Done when: a quantities-by-type schedule grouped by classification code shows the mapped codes. Then: the model's own reference wins over the
 * mapping; the tag field and the label placeholder show the code; the mapping survives the project file and the `.bvlib` library; the app and the
 * engine (the command line's read) give the same code to every type; the CSV import reports the rows it does not take.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { RelationshipType } from '@ifc-lite/data';
import { classifiedTypes, type ClassificationMapping } from '@bimvoice/ifcsheet';
import { readBoqElements, storeClassifications, storeSource } from '@bimvoice/ifcsheet/project';
import { cleanup, render } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { startDrawingSet, addScheduleToSet } from '@/project/drawing-set-actions';
import { WallSheet } from '@/components/viewer/wall/WallSheet';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { readScheduleExport, type ExportLabelSet } from '@/components/viewer/wall/schedule-export-read';
import { exportCsv } from '@/joinery/schedule-export';
import { layoutTypeQuantities, typeQuantityTable, type TypeQuantityLabels } from '@bimvoice/ifcsheet';
import { typeQuantitiesOf } from '@/joinery/type-quantities-models';
import { labelElementByGlobalId } from '@/labels/label-element';
import { parseTemplate } from '@/labels/label-template';
import { resolveTemplate } from '@/labels/label-resolve';
import { elementLabel } from '@/tagfields/element-tag';
import { previewElements } from '@/tagfields/preview-elements';
import { newDraft } from '@/drafting/draft-store';
import { refreshElementTags } from '@/project/useElementTagSync';
import { applyCatalogueImport, projectCatalogue } from '@/catalogue/catalogue-store';
import { parseCatalogue, selectKinds, serializeCatalogue } from '@/catalogue/catalogue-file';
import {
  addClassificationMapping, assignClassificationCode, importClassificationCsv, removeClassificationMapping, setClassificationRule, setScheduleClassification, useClassificationOnTags,
} from './classification-actions';

const TYPE_240 = 'Leichtbeton 102890359 240';
const TYPE_300 = 'Leichtbeton 102890359 300';
const TYPE_DOOR = 'Eingangstür';
const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);

async function openFzk(text = readFileSync(FZK, 'latin1')) {
  const store = await parseStep(new Uint8Array(Buffer.from(text, 'latin1')));
  seedModel('fzk', 0, store, 1);
  return store;
}

/** FZK-Haus with an IfcClassificationReference on one wall of the 240 type; returns the model text and the GlobalId of that wall. */
async function fzkWithReferenceOnOneWall(): Promise<{ text: string; guid: string }> {
  const text = readFileSync(FZK, 'latin1');
  const store = await parseStep(new Uint8Array(Buffer.from(text, 'latin1')));
  const typeId = [...(store.entityIndex.byType.get('IFCWALLTYPE') ?? [])].find((id) => store.entities.getName(id) === TYPE_240)!;
  const wallId = store.relationships!.getRelated(typeId, RelationshipType.DefinesByType, 'forward')[0];
  const injected = text.replace(/\nENDSEC;\s*\nEND-ISO-10303-21;\s*$/, `\n#900001= IFCCLASSIFICATION('EXAMPLE','2015',$,'Uniclass 2015',$,$,$);\n#900002= IFCCLASSIFICATIONREFERENCE($,'EXAMPLE-OWN','EXAMPLE: the model says',#900001,$,$);\n#900003= IFCRELASSOCIATESCLASSIFICATION('0EXAMPLEclassification',#12,$,$,(#${wallId}),#900002);\nENDSEC;\nEND-ISO-10303-21;\n`);
  assert.notEqual(injected, text, 'the reference was injected');
  return { text: injected, guid: store.entities.getGlobalId(wallId) };
}

/** The office's table, through the app's own actions: the two wall types share one code, the door type has another, the rooms a class rule. */
function exampleMapping(): string {
  const id = addClassificationMapping('Uniclass', '2015');
  setClassificationRule(id, 'type', TYPE_240, 'EXAMPLE-Ss_25', 'EXAMPLE: wall systems');
  setClassificationRule(id, 'type', TYPE_300, 'EXAMPLE-Ss_25', 'EXAMPLE: wall systems');
  setClassificationRule(id, 'type', TYPE_DOOR, 'EXAMPLE-Ss_32', 'EXAMPLE: door systems');
  return id;
}

const labels: TypeQuantityLabels = {
  locale: 'en', title: 'Quantities by type', type: 'Type', class: 'Class', level: 'Storey', count: 'Count', length: 'Length m', area: 'Area m²', volume: 'Volume m³', noQto: 'No Qto', total: 'Total', noType: '(no type)', noLevel: 'No storey',
  classification: 'Classification', classificationTitle: 'Title', unclassified: 'No classification',
};
const exportLabels = { types: labels } as unknown as ExportLabelSet;

const addTypesSchedule = () => {
  startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
  const sheetId = addScheduleToSet('types', 'Quantities by Uniclass code')!;
  return { sheetId, schedule: useProjectStore.getState().schedules!.find((s) => s.kind === 'types')! };
};

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a quantities-by-type schedule grouped by classification code (the done-when)', () => {
  it('shows the mapped codes, groups the types under them, and puts the types no rule reaches last, under their own heading', async () => {
    await openFzk();
    const id = exampleMapping();
    const { sheetId, schedule } = addTypesSchedule();
    setScheduleClassification(schedule.id, { mapping: id, group: true });
    const chosen = useProjectStore.getState().schedules!.find((s) => s.id === schedule.id)!;

    const data = typeQuantitiesOf(chosen.classification);
    assert.equal(data.grouped, true);
    const coded = data.rows.filter((r) => r.classification);
    assert.deepEqual(
      coded.map((r) => [r.classification!.code, r.typeName]),
      [['EXAMPLE-Ss_25', TYPE_240], ['EXAMPLE-Ss_25', TYPE_300], ['EXAMPLE-Ss_32', TYPE_DOOR]],
      'the types are in code order, the two wall types together',
    );
    assert.ok(coded.every((r) => r.classification!.source === 'mapping'));
    const firstUncoded = data.rows.findIndex((r) => !r.classification);
    assert.ok(firstUncoded > 0 && data.rows.slice(firstUncoded).every((r) => !r.classification), 'the unclassified are last');

    // The table on paper: a heading per code, the code and its title on the type's row, the column headers.
    const layout = layoutTypeQuantities(data, labels);
    const printed = layout.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    for (const word of ['Classification', 'Title', 'EXAMPLE-Ss_25  EXAMPLE: wall systems', 'EXAMPLE-Ss_32  EXAMPLE: door systems', 'No classification', TYPE_240, TYPE_DOOR]) assert.ok(printed.includes(word), `${word} on paper`);
    assert.equal(printed.filter((t) => t === 'EXAMPLE-Ss_25  EXAMPLE: wall systems').length, 1, 'one heading for the two wall types');

    // On the sheet, as drawn.
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    const ui = render(<WallSheet sheet={sheet} width={1000} />);
    const svg = ui.querySelector<SVGSVGElement>(`svg[data-sheet-id="${sheet.id}"]`);
    assert.ok(svg, 'the sheet is drawn');
    const text = sheetSvgText(svg, sheet);
    for (const word of ['EXAMPLE-Ss_25  EXAMPLE: wall systems', 'EXAMPLE-Ss_32  EXAMPLE: door systems', 'Classification']) assert.ok(text.includes(`>${word}<`), `${word} on the sheet`);
  });

  it('writes the same rows to the CSV and the XLSX table: a code and a title on every line, no heading lines, figures as numbers', async () => {
    await openFzk();
    const id = exampleMapping();
    const { schedule } = addTypesSchedule();
    setScheduleClassification(schedule.id, { mapping: id, group: true });
    const exported = await readScheduleExport(useProjectStore.getState().schedules!.find((s) => s.id === schedule.id)!, exportLabels);
    assert.ok(exported);
    const table = exported.tables[0];
    assert.deepEqual(table.header.slice(0, 5), ['Type', 'Class', 'Classification', 'Title', 'Storey']);
    const wall = table.rows.find((r) => r[0] === TYPE_240)!;
    assert.deepEqual(wall.slice(0, 4), [TYPE_240, 'WallType', 'EXAMPLE-Ss_25', 'EXAMPLE: wall systems']);
    assert.equal(typeof wall[5], 'number', 'the count is a number, after the two classification columns');
    assert.ok(!table.rows.some((r) => r[0] === 'EXAMPLE-Ss_25  EXAMPLE: wall systems'), 'the grouping headings are not rows of the file');
    assert.deepEqual(table.numeric, [5, 6, 7, 8, 9]);
    const csv = exportCsv(exported);
    assert.match(csv, new RegExp(`${TYPE_240},WallType,EXAMPLE-Ss_25,EXAMPLE: wall systems,`));
    // Without a classification choice the table is the one it always was.
    const plain = typeQuantityTable(typeQuantitiesOf(undefined), labels);
    assert.deepEqual(plain.header, ['Type', 'Class', 'Storey', 'Count', 'Length m', 'Area m²', 'Volume m³', 'No Qto']);
  });

  it('a schedule that shows the model\'s own codes alone has the rooms\' \'000\' nowhere (rooms are not in the table) and no grouping heading for nothing', async () => {
    await openFzk();
    const { schedule } = addTypesSchedule();
    setScheduleClassification(schedule.id, {});
    const data = typeQuantitiesOf(useProjectStore.getState().schedules!.find((s) => s.id === schedule.id)!.classification);
    assert.equal(data.classified, true);
    assert.equal(data.grouped, undefined);
    assert.ok(data.rows.every((r) => r.classification === null), 'no wall or door of the FZK-Haus carries a reference, and no mapping is chosen');
  });
});

describe('the model\'s own IfcClassificationReference wins over the mapping', () => {
  it('splits the type into the wall that carries a code and the walls the mapping codes, in the schedule and on the tag', async () => {
    const { text, guid } = await fzkWithReferenceOnOneWall();
    await openFzk(text);
    const id = exampleMapping();
    const { schedule } = addTypesSchedule();
    setScheduleClassification(schedule.id, { mapping: id, group: true });
    const rows = typeQuantitiesOf(useProjectStore.getState().schedules!.find((s) => s.id === schedule.id)!.classification).rows.filter((r) => r.typeName === TYPE_240);
    assert.deepEqual(rows.map((r) => [r.classification!.code, r.classification!.source, r.total.count]).sort(), [['EXAMPLE-OWN', 'model', 1], ['EXAMPLE-Ss_25', 'mapping', 4]]);
    assert.equal(rows.find((r) => r.classification!.source === 'model')!.classification!.title, 'EXAMPLE: the model says');
    // The tag of that wall says the model's code; any other wall of the type says the mapping's.
    assert.equal(elementLabel(guid, 'classification'), 'EXAMPLE-OWN');
    assert.equal(elementLabel(guid, 'classificationTitle'), 'EXAMPLE: the model says');
    const other = previewElements('wall').map((e) => e.guid).find((g) => g !== guid && labelElementByGlobalId(g)!.typeName() === TYPE_240)!;
    assert.equal(elementLabel(other, 'classification'), 'EXAMPLE-Ss_25');
  });

  it('the rooms of the FZK-Haus keep their own \'000\' although the mapping has a rule for IfcSpace', async () => {
    await openFzk();
    const id = addClassificationMapping('Uniclass', '2015');
    setClassificationRule(id, 'class', 'IfcSpace', 'EXAMPLE-Sp_10', 'EXAMPLE: spaces');
    const rooms = previewElements('room').map((e) => e.guid);
    assert.equal(rooms.length, 7);
    for (const g of rooms) {
      assert.equal(elementLabel(g, 'classification'), '000');
      assert.equal(elementLabel(g, 'classificationTitle'), 'Allgemeines');
    }
  });
});

describe('the classification on tags and labels', () => {
  it('the TAG tool field and the {Classification} placeholder read the first mapping (the one "used on tags")', async () => {
    await openFzk();
    const uniclass = exampleMapping();
    const office = addClassificationMapping('Office');
    setClassificationRule(office, 'type', TYPE_240, 'OFFICE-W1', 'EXAMPLE: office walls');
    const wall = previewElements('wall').map((e) => e.guid).find((g) => labelElementByGlobalId(g)!.typeName() === TYPE_240)!;
    assert.equal(elementLabel(wall, 'classification'), 'EXAMPLE-Ss_25');
    assert.equal(elementLabel(wall, 'classificationTitle'), 'EXAMPLE: wall systems');
    const template = parseTemplate('{Name}: {Classification} {ClassificationTitle}');
    assert.deepEqual(template.issues, []);
    assert.equal(resolveTemplate(template, labelElementByGlobalId(wall)!, 'en'), `${labelElementByGlobalId(wall)!.attribute('Name')}: EXAMPLE-Ss_25 EXAMPLE: wall systems`);
    // "Use on tags" moves the other system first: the tag follows.
    useClassificationOnTags(office);
    assert.equal(elementLabel(wall, 'classification'), 'OFFICE-W1');
    assert.equal(useProjectStore.getState().classificationMappings![0].id, office);
    assert.equal(useProjectStore.getState().classificationMappings![1].id, uniclass);
  });

  it('a tag already on a sheet takes a changed code, and an element with no code reads "?" as the other fields do', async () => {
    await openFzk();
    const id = exampleMapping();
    const wall = previewElements('wall').map((e) => e.guid).find((g) => labelElementByGlobalId(g)!.typeName() === TYPE_240)!;
    const draft = newDraft('v', '0', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: 'old', height: 2.5 }, { tagOf: wall, tagField: 'classification' });
    useProjectStore.setState({ drafts: [draft] });
    refreshElementTags();
    const text = () => (useProjectStore.getState().drafts[0].shape as { text: string }).text;
    assert.equal(text(), 'EXAMPLE-Ss_25');
    act(() => setClassificationRule(id, 'type', TYPE_240, 'EXAMPLE-CHANGED'));
    refreshElementTags();
    assert.equal(text(), 'EXAMPLE-CHANGED');
    act(() => removeClassificationMapping(id));
    refreshElementTags();
    assert.equal(text(), '?');
  });
});

describe('the mapping travels with the project and with the office library', () => {
  it('survives a project file round trip, with the schedule\'s choice, and a damaged rule is dropped on the way in', async () => {
    const id = exampleMapping();
    const { schedule } = addTypesSchedule();
    setScheduleClassification(schedule.id, { mapping: id, group: true });
    const before = useProjectStore.getState().classificationMappings;
    const file = serializeProject(projectDocument());
    const reopened = parseProjectFile(file);
    assert.deepEqual(reopened.classificationMappings, before);
    assert.deepEqual(reopened.schedules!.find((s) => s.kind === 'types')!.classification, { mapping: id, group: true });
    resetProject();
    loadProjectDocument(reopened);
    assert.deepEqual(useProjectStore.getState().classificationMappings, before);
    // A file with a rule missing its code keeps the rest.
    const damaged = JSON.parse(file);
    damaged.classificationMappings[0].rules.push({ by: 'type', match: 'No code' });
    assert.equal(parseProjectFile(JSON.stringify(damaged)).classificationMappings![0].rules.length, before![0].rules.length);
  });

  it('travels in a .bvlib: exported, read back, refused with its path when malformed, and merged by system under the policy', () => {
    const id = exampleMapping();
    const library = serializeCatalogue(projectCatalogue(), 'office');
    assert.deepEqual(parseCatalogue(library).catalogue.classificationMappings, useProjectStore.getState().classificationMappings);
    // The library dialog exports by kind: the mapping goes with its own kind and with no other.
    assert.equal(selectKinds(projectCatalogue(), new Set(['classificationMappings'])).classificationMappings.length, 1);
    assert.equal(selectKinds(projectCatalogue(), new Set(['layers'])).classificationMappings.length, 0);
    const bad = JSON.parse(library);
    bad.classificationMappings = [{ id: 'x', system: {}, rules: [] }];
    assert.throws(() => parseCatalogue(JSON.stringify(bad)), /\/classificationMappings\/0/);
    const old = JSON.parse(library);
    delete old.classificationMappings;
    assert.deepEqual(parseCatalogue(JSON.stringify(old)).catalogue.classificationMappings, []);

    // Importing into a project that has the system with another code for the door type, and a rule of its own.
    const incoming = parseCatalogue(library).catalogue;
    resetProject();
    const mine = addClassificationMapping('uniclass', ' 2015 ');
    setClassificationRule(mine, 'type', TYPE_DOOR, 'MINE-DOOR');
    setClassificationRule(mine, 'class', 'IfcSlab', 'MINE-SLAB');
    const report = applyCatalogueImport(incoming, 'both');
    const merged = useProjectStore.getState().classificationMappings!;
    assert.equal(merged.length, 1, 'one table per system');
    assert.equal(merged[0].id, mine, 'the project\'s id stays, so schedules that show it keep showing it');
    const code = (by: string, match: string) => merged[0].rules.find((r) => r.by === by && r.match === match)?.code;
    assert.deepEqual([code('type', TYPE_DOOR), code('type', TYPE_240), code('class', 'IfcSlab')], ['MINE-DOOR', 'EXAMPLE-Ss_25', 'MINE-SLAB'], 'both: mine stays where both have a code, the rest joins');
    assert.equal(report.classificationMappings.added, 1);
    applyCatalogueImport(incoming, 'theirs');
    const replaced = useProjectStore.getState().classificationMappings![0];
    assert.equal(replaced.id, mine);
    assert.equal(replaced.rules.find((r) => r.match === 'IfcSlab'), undefined, 'theirs: the incoming rules replace');
    assert.equal(id === mine, false);
  });
});

describe('the app and the engine give the same code to every type', () => {
  it('the schedule\'s rows equal the engine\'s (the command line\'s) read of the same model, code by code, with a model reference in the mix', async () => {
    const { text } = await fzkWithReferenceOnOneWall();
    const store = await openFzk(text);
    const id = exampleMapping();
    const mapping = useProjectStore.getState().classificationMappings!.find((m) => m.id === id) as ClassificationMapping;
    const app = typeQuantitiesOf({ mapping: id }).rows.map((r) => `${r.className}|${r.typeName ?? ''}|${r.classification?.code ?? ''}|${r.classification?.source ?? 'none'}|${r.total.count}`).sort();
    const engine = classifiedTypes(readBoqElements(storeSource('fzk', store), new Set()), [mapping], storeClassifications(new Map([['fzk', store]])))
      .map((r) => `${r.className}|${r.typeName ?? ''}|${r.code}|${r.source}|${r.count}`).sort();
    assert.ok(engine.length > 5);
    assert.deepEqual(app, engine);
    assert.ok(app.includes(`IfcWallType|${TYPE_240}|EXAMPLE-OWN|model|1`));
  });
});

describe('importing codes from a CSV', () => {
  it('takes the good rows and reports every other with its row number; a code already set for the item is replaced', () => {
    const id = addClassificationMapping('Office');
    setClassificationRule(id, 'class', 'IfcWall', 'OLD');
    const csv = [
      'Code;Title;Class;Type;Material',
      'EXAMPLE-1;EXAMPLE: walls;IfcWall;;', // takes, replaces OLD
      'EXAMPLE-2;"EXAMPLE: ""quoted""; title";;T240;', // quoted, with the delimiter and quotes inside
      ';EXAMPLE: no code;IfcSlab;;', // row 4
      'EXAMPLE-4;;;;', // row 5: no target
      'EXAMPLE-5;;slab;;', // row 6: not an IFC class
      'EXAMPLE-6;;;;Concrete',
    ].join('\r\n');
    const report = importClassificationCsv(id, `﻿${csv}`);
    assert.equal(report.imported, 3);
    assert.deepEqual(report.problems.map((p) => [p.row, p.kind]), [[4, 'missingCode'], [5, 'noTarget'], [6, 'badClass']]);
    const rules = useProjectStore.getState().classificationMappings![0].rules;
    assert.deepEqual(rules.map((r) => [r.by, r.match, r.code, r.title ?? '']), [
      ['class', 'IfcWall', 'EXAMPLE-1', 'EXAMPLE: walls'], ['type', 'T240', 'EXAMPLE-2', 'EXAMPLE: "quoted"; title'], ['material', 'Concrete', 'EXAMPLE-6', ''],
    ]);
  });

  it('a file without the columns it needs imports nothing and says why, and comma and tab files read as well as semicolon ones', () => {
    const id = addClassificationMapping('Office');
    assert.deepEqual(importClassificationCsv(id, 'name,class\nx,IfcWall').problems.map((p) => p.kind), ['noCodeColumn']);
    assert.equal(importClassificationCsv(id, 'code,type\nEXAMPLE-A,T1').imported, 1);
    assert.equal(importClassificationCsv(id, 'code\ttype\nEXAMPLE-B\tT2').imported, 1);
    assert.deepEqual(useProjectStore.getState().classificationMappings![0].rules.map((r) => r.code), ['EXAMPLE-A', 'EXAMPLE-B']);
  });

  it('assigns one code to many items at once, the bulk assignment by class', () => {
    const id = addClassificationMapping('Office');
    assignClassificationCode(id, 'type', [TYPE_240, TYPE_300], 'EXAMPLE-BULK', 'EXAMPLE: all walls');
    assert.deepEqual(useProjectStore.getState().classificationMappings![0].rules.map((r) => [r.match, r.code]), [[TYPE_240, 'EXAMPLE-BULK'], [TYPE_300, 'EXAMPLE-BULK']]);
  });

  it('removing a system returns the schedules that showed it to the model\'s own codes', () => {
    const id = exampleMapping();
    const { schedule } = addTypesSchedule();
    setScheduleClassification(schedule.id, { mapping: id, group: true });
    removeClassificationMapping(id);
    assert.deepEqual(useProjectStore.getState().schedules!.find((s) => s.id === schedule.id)!.classification, { group: true });
  });
});
