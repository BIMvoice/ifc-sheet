/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #581 (4 of 8): the quantities by type `ifcsheet build --project` prints are the ones the app lays out, on AC20-FZK-Haus through the
 * real pipeline (parser, wasm geometry) with one wall's quantity sets unlinked, so that wall's type carries a figure measured from its
 * meshes, and with an IfcClassificationReference on that wall, so the model's own code wins over the mapping's for it. The two hosts fill
 * `ScheduleModel` differently (the app from its stores and renderer, the engine from an opened model) and read the same rule:
 *   - the rows are equal, are not empty, hold a measured figure, and the classified and grouped reads carry the mapping's codes and the model's;
 *   - the CSV tables and the texts of the table the app puts on a sheet and the engine's pager prints are equal, in English and in Romanian;
 *   - the engine's table of words is the app's catalogues', key by key, in both languages.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TYPES_WORDS_EN, TYPES_WORDS_RO, layoutTypeQuantities, typeLabelsOf, typeQuantityTable, typesSayFor, type TypesSay,
  type ClassificationMapping, type ProjectSheet, type ScheduleClassification, type ScheduleLayout, type TypeQuantities, type TypesWordKey,
} from '@bimvoice/ifcsheet';
import { projectSheetOptions, type ProjectSheetSource } from '@bimvoice/ifcsheet/headless';
import { scheduleModelsOf, typeQuantitiesOver } from '@bimvoice/ifcsheet/project';
import { en, type TranslationKey } from '@/i18n/en';
import ro from '@/i18n/locales/ro';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { typeQuantitiesOf } from '@/joinery/type-quantities-models';

const TYPE_240 = 'Leichtbeton 102890359 240';
const MAPPING: ClassificationMapping = {
  id: 'm1', system: { name: 'Uniclass', edition: '2015' },
  rules: [
    { by: 'type', match: TYPE_240, code: 'EXAMPLE-Ss_25', title: 'EXAMPLE: wall systems' },
    { by: 'type', match: 'Eingangstür', code: 'EXAMPLE-Ss_32', title: 'EXAMPLE: door systems' },
  ],
};
const CHOICES: Record<string, ScheduleClassification | undefined> = { plain: undefined, classified: { mapping: 'm1' }, grouped: { mapping: 'm1', group: true } };

const sheet = ({ id: 's1', number: 'X-903', name: 'Types', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'ty', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] }) as unknown as ProjectSheet;
const source = (set: unknown, choice?: ScheduleClassification): ProjectSheetSource => ({
  set, schedules: [{ id: 'ty', name: 'Types', kind: 'types', createdAt: 0, ...(choice ? { classification: choice } : {}) }], classificationMappings: [MAPPING],
}) as unknown as ProjectSheetSource;
const textsOf = (layout: ScheduleLayout): string[] => layout.prims.flatMap((p) => ('text' in p && typeof p.text === 'string' ? [p.text] : []));

/** The model's text without the links from its first wall to its quantity sets, and with a classification reference on that wall. */
function firstWallUnlinkedAndClassified(text: string): string {
  const walls = [...text.matchAll(/^#(\d+)=\s*IFCWALLSTANDARDCASE\(/gm)].map((m) => m[1]);
  const qto = new Set([...text.matchAll(/^#(\d+)=\s*IFCELEMENTQUANTITY\(/gm)].map((m) => m[1]));
  const kept = text.split('\n').filter((line) => {
    const rel = /^#\d+=\s*IFCRELDEFINESBYPROPERTIES\(.*,\(#(\d+)\),#(\d+)\);/.exec(line);
    return !(rel && rel[1] === walls[0] && qto.has(rel[2]));
  }).join('\n');
  return kept.replace(/\nENDSEC;\s*\nEND-ISO-10303-21;\s*$/, `\n#900001= IFCCLASSIFICATION('EXAMPLE','2015',$,'Uniclass 2015',$,$,$);\n#900002= IFCCLASSIFICATIONREFERENCE($,'EXAMPLE-OWN','EXAMPLE: the model says',#900001,$,$);\n#900003= IFCRELASSOCIATESCLASSIFICATION('0EXAMPLEclassification',#12,$,$,(#${walls[0]}),#900002);\nENDSEC;\nEND-ISO-10303-21;\n`);
}

describe('the quantities by type of the build are the app\'s, on AC20-FZK-Haus (#581)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let dir: string;
  let app: Record<string, TypeQuantities>;
  let engine: Record<string, TypeQuantities>;
  let dataStore: never;
  let meshes: never;

  before(async () => {
    registerLocale('ro', ro as never);
    dir = mkdtempSync(join(tmpdir(), 'fzk-one-wall-types-'));
    const path = join(dir, 'AC20-FZK-Haus-one-wall.ifc');
    const text = readFileSync(FZK_HAUS, 'utf8');
    const changed = firstWallUnlinkedAndClassified(text);
    assert.ok(changed.includes('EXAMPLE-OWN') && changed.length !== text.length, 'the first wall lost its quantity sets and has its own reference');
    writeFileSync(path, changed);
    await loadPlanModel(path);
    useProjectStore.setState({ classificationMappings: [MAPPING] } as never);
    const model = useViewerStore.getState().models.get('m')!;
    dataStore = model.ifcDataStore as never;
    meshes = model.geometryResult!.meshes as never;
    app = {};
    engine = {};
    for (const [name, choice] of Object.entries(CHOICES)) {
      app[name] = typeQuantitiesOf(choice);
      engine[name] = typeQuantitiesOver(scheduleModelsOf({ dataStore, meshes }, 'm', 'm'), [MAPPING], choice);
    }
  });
  after(() => { rmSync(dir, { recursive: true, force: true }); useProjectStore.setState({ classificationMappings: [] } as never); });
  afterEach(() => setLocale('en'));

  it('has the same rows, plain, classified and grouped, and they are not empty', () => {
    for (const name of Object.keys(CHOICES)) {
      assert.ok(app[name].rows.length >= 5, `${name}: the app reads the model's types`);
      assert.deepEqual(engine[name], app[name], name);
    }
    // The unlinked wall's type has a measured figure (the engine's measuring, through `ScheduleModel.meshesOf`), the others declared ones.
    const walls = app.plain.rows.filter((r) => r.className === 'IfcWallType');
    assert.ok(walls.some((r) => (r.total.measuredVolume ?? 0) > 0 || (r.total.measuredArea ?? 0) > 0), 'a type carries a measured figure');
    assert.ok(app.plain.rows.some((r) => r.total.volume !== null && (r.total.measuredVolume ?? 0) === 0), 'and one a declared figure');
    // Classification: the mapping's code for the types it names, the model's own for the wall that carries a reference (`ScheduleModel.classification`).
    const codes = app.classified.rows.map((r) => `${r.typeName ?? ''}|${r.classification?.code ?? ''}|${r.classification?.source ?? ''}`);
    assert.ok(codes.some((c) => c.startsWith(`${TYPE_240}|EXAMPLE-Ss_25`)), 'the mapping classifies the 240 type');
    assert.ok(codes.some((c) => c.endsWith('|EXAMPLE-OWN|model')), 'the model\'s own reference wins on the wall that has one');
    assert.equal(app.grouped.grouped, true);
  });

  it('has the same CSV tables', () => {
    for (const name of Object.keys(CHOICES)) {
      const labels = typeLabelsOf(typesSayFor('en'), 'en', 'Types');
      assert.deepEqual(typeQuantityTable(engine[name], labels), typeQuantityTable(app[name], labels), name);
    }
    assert.ok(typeQuantityTable(app.plain, typeLabelsOf(typesSayFor('en'), 'en', 'Types')).header.includes('Measured from geometry'));
  });

  for (const language of ['en', 'ro'] as const) {
    for (const [name, choice] of Object.entries(CHOICES)) {
      it(`prints the same table texts on a sheet in ${language}, ${name}`, () => {
        setLocale(language);
        const place = { sheets: [sheet], sheet, vp: sheet.viewports![0] };
        const set = { views: [], sheets: [sheet], drafts: [], draftLayers: [], layerGroups: [], lineTypes: [], textStyles: [], dimStyles: [], hatchPatterns: [], symbols: [], issues: [], revisions: [] };
        const options = projectSheetOptions(source(set, choice), { dataStore, meshes } as never, language, language, 'm');
        const pager = options.schedules!.pages!.get('ty');
        assert.ok(pager, 'the engine prints the types schedule');
        const printed = textsOf(pager(place));
        // The app's table: `layoutTypeQuantities` with the labels its own translation gives.
        const say = (key: Parameters<TypesSay>[0], params?: Record<string, string | number>) => resolve(key, params);
        const appTexts = textsOf(layoutTypeQuantities(app[name], typeLabelsOf(say, language, 'Types'), { maxHeight: 1000, page: 0 }));
        assert.ok(appTexts.includes(TYPE_240) && appTexts.some((t) => t.endsWith(' *')), 'the app\'s table has rows and a measured mark');
        assert.deepEqual(printed, appTexts);
      });
    }
  }

  for (const [language, words] of [['en', TYPES_WORDS_EN], ['ro', TYPES_WORDS_RO]] as const) {
    it(`${language}: every word of the engine's table reads the same in the app's catalogue`, () => {
      const catalogue = (language === 'en' ? en : ro) as unknown as Record<string, unknown>;
      const keys = Object.keys(words) as TypesWordKey[];
      assert.equal(keys.length, 14);
      const typed: TranslationKey[] = keys;
      assert.equal(typed.length, keys.length);
      for (const key of keys) assert.deepEqual(catalogue[key], words[key], key);
      assert.equal(typesSayFor(language)('typeQty.total'), 'Total');
    });
  }
});
