/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #581 (3 of 8): the material takeoff `ifcsheet build --project` prints is the one the app lays out, on AC20-FZK-Haus through the real
 * pipeline (parser, wasm geometry) with one wall's quantity sets unlinked, so that one row's figures are measured from its meshes
 * and the others are declared. The two hosts fill `ScheduleModel` differently (the app from its stores and renderer, the engine from
 * an opened model) and read the same rule:
 *   - the rows of the app's takeoff and the engine's are equal, are not empty, and hold a measured row and a declared one;
 *   - the texts of the table the app puts on a sheet and the engine's pager prints are equal, in English and in Romanian;
 *   - the engine's table of words is the app's catalogues', key by key, in both languages.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TAKEOFF_WORDS_EN, TAKEOFF_WORDS_RO, layoutMaterialTakeoff, takeoffLabelsOf, takeoffRows, takeoffSayFor, takeoffTable,
  type ProjectSheet, type ScheduleLayout, type TakeoffRow, type TakeoffWordKey,
} from '@bimvoice/ifcsheet';
import { projectSheetOptions, type ProjectSheetSource } from '@bimvoice/ifcsheet/headless';
import { scheduleModelsOf, takeoffElementsOf } from '@bimvoice/ifcsheet/project';
import { en, type TranslationKey } from '@/i18n/en';
import ro from '@/i18n/locales/ro';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { collectTakeoffElements } from '@/joinery/material-takeoff-models';
import { loadedScheduleModels } from '@/joinery/schedule-models';

const sheet = ({ id: 's1', number: 'X-902', name: 'Materials', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'mat', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] }) as unknown as ProjectSheet;
const source = (set: unknown): ProjectSheetSource => ({ set, schedules: [{ id: 'mat', name: 'Materials', kind: 'materials', createdAt: 0 }] }) as unknown as ProjectSheetSource;
const textsOf = (layout: ScheduleLayout): string[] => layout.prims.flatMap((p) => ('text' in p && typeof p.text === 'string' ? [p.text] : []));

/** The model's text without the links from its first wall to its quantity sets. */
function withoutFirstWallQto(text: string): string {
  const walls = [...text.matchAll(/^#(\d+)=\s*IFCWALLSTANDARDCASE\(/gm)].map((m) => m[1]);
  const qto = new Set([...text.matchAll(/^#(\d+)=\s*IFCELEMENTQUANTITY\(/gm)].map((m) => m[1]));
  return text.split('\n').filter((line) => {
    const rel = /^#\d+=\s*IFCRELDEFINESBYPROPERTIES\(.*,\(#(\d+)\),#(\d+)\);/.exec(line);
    return !(rel && rel[1] === walls[0] && qto.has(rel[2]));
  }).join('\n');
}

describe('the material takeoff of the build is the app\'s, on AC20-FZK-Haus (#581)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let dir: string;
  let rows: { app: TakeoffRow[]; engine: TakeoffRow[] };
  let dataStore: never;
  let meshes: never;

  before(async () => {
    registerLocale('ro', ro as never);
    dir = mkdtempSync(join(tmpdir(), 'fzk-one-wall-no-qto-'));
    const path = join(dir, 'AC20-FZK-Haus-one-wall.ifc');
    const text = readFileSync(FZK_HAUS, 'utf8');
    writeFileSync(path, withoutFirstWallQto(text));
    assert.ok(withoutFirstWallQto(text).length < text.length, 'the first wall\'s quantity sets were unlinked');
    await loadPlanModel(path);
    const model = useViewerStore.getState().models.get('m')!;
    dataStore = model.ifcDataStore as never;
    meshes = model.geometryResult!.meshes as never;
    rows = {
      app: takeoffRows(collectTakeoffElements(loadedScheduleModels({ instanced: () => undefined }))),
      engine: takeoffRows(takeoffElementsOf(scheduleModelsOf({ dataStore, meshes }, 'm'))),
    };
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  afterEach(() => setLocale('en'));

  it('has the same rows, and they are not empty', () => {
    assert.ok(rows.app.length >= 3, 'the app reads the model\'s materials');
    assert.deepEqual(rows.engine, rows.app);
    // The unlinked wall is measured, the other twelve are declared, and the rows tell which.
    assert.ok(rows.app.some((r) => r.measuredVolume === true), 'one row carries a measured figure');
    assert.ok(rows.app.some((r) => r.measuredVolume !== true && r.volume !== null), 'and one a declared one');
    // Independent of both readers: the wall material is used by the thirteen IfcWallStandardCase of the model's text.
    const walls = rows.app.find((r) => r.classes.includes('IfcWallStandardCase'));
    assert.equal(walls?.elements, 13);
  });

  it('has the same CSV, with the column that names the measured figures', () => {
    const labels = takeoffLabelsOf(takeoffSayFor('en'), 'en', 'Materials');
    const csv = (r: readonly TakeoffRow[]) => takeoffTable(r, labels);
    assert.deepEqual(csv(rows.engine), csv(rows.app));
    assert.ok(csv(rows.app).header.includes('Measured from geometry'));
  });

  for (const language of ['en', 'ro'] as const) {
    it(`prints the same table texts on a sheet in ${language}`, () => {
      setLocale(language);
      const place = { sheets: [sheet], sheet, vp: sheet.viewports![0] };
      const set = { views: [], sheets: [sheet], drafts: [], draftLayers: [], layerGroups: [], lineTypes: [], textStyles: [], dimStyles: [], hatchPatterns: [], symbols: [], issues: [], revisions: [] };
      const options = projectSheetOptions(source(set), { dataStore, meshes } as never, language, language, 'm');
      const pager = options.schedules!.pages!.get('mat');
      assert.ok(pager, 'the engine prints the materials schedule');
      const engine = textsOf(pager(place));
      // The app's table: `layoutMaterialTakeoff` with the labels its own translation gives.
      const say = (key: TakeoffWordKey, params?: Record<string, string | number>) => resolve(key, params);
      const app = textsOf(layoutMaterialTakeoff(rows.app, takeoffLabelsOf(say, language, 'Materials'), { maxHeight: 1000, page: 0 }));
      assert.ok(app.includes('Leichtbeton 102890359') && app.some((t) => t.endsWith(' *')), 'the app\'s table has rows and a measured mark');
      assert.deepEqual(engine, app);
    });
  }

  for (const [language, words] of [['en', TAKEOFF_WORDS_EN], ['ro', TAKEOFF_WORDS_RO]] as const) {
    it(`${language}: every word of the engine's table reads the same in the app's catalogue`, () => {
      const catalogue = (language === 'en' ? en : ro) as unknown as Record<string, unknown>;
      const keys = Object.keys(words) as TakeoffWordKey[];
      assert.ok(keys.length >= 11);
      const typed: TranslationKey[] = keys;
      assert.equal(typed.length, keys.length);
      for (const key of keys) assert.deepEqual(catalogue[key], words[key], key);
      assert.equal(takeoffSayFor(language)('takeoff.total'), 'Total');
    });
  }

  it('says the unmeasured count with the Romanian plural forms', () => {
    const say = takeoffSayFor('ro');
    assert.match(say('measuredQty.unmeasured', { count: 1 }), /^Un element/);
    assert.match(say('measuredQty.unmeasured', { count: 3 }), /^3 elemente/);
    assert.match(say('measuredQty.unmeasured', { count: 20 }), /^20 de elemente/);
  });
});
