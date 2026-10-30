/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #581 (2 of 8): the finishes schedule `ifcsheet build --project` prints is the one the app lays out, on rooms-with-finishes.ifc
 * (AC20-FZK-Haus has no IfcCovering, so a test on it would compare two empty tables). The two hosts fill `ScheduleModel` differently
 * (the app from its stores, the engine from an opened model) and read the same rule:
 *   - the rows of the app's schedule (CSV and XLSX) and the engine's are equal, and are not empty;
 *   - the texts of the table the app puts on a sheet and the engine's pager prints are equal, in English and in Romanian;
 *   - the engine's table of words is the app's catalogues', key by key, in both languages.
 * The fixture has no geometry, so the engine side is handed the parsed store; a finishes schedule reads no mesh.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FINISHES_WORDS_EN, FINISHES_WORDS_RO, finishLabelsOf, finishRows, finishesSayFor, layoutRoomFinishes, roomFinishes, type FinishesWordKey, type ProjectSheet, type ScheduleLayout,
} from '@bimvoice/ifcsheet';
import { projectSheetOptions, type ProjectSheetSource } from '@bimvoice/ifcsheet/headless';
import { roomInputsOf, scheduleModelsOf } from '@bimvoice/ifcsheet/project';
import { en, type TranslationKey } from '@/i18n/en';
import ro from '@/i18n/locales/ro';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { collectRoomInputs } from '@/joinery/room-finishes-models';
import { resetProject } from './project-store';

const FIXTURE = new URL('../test/__fixtures__/rooms-with-finishes.ifc', import.meta.url);
const sheet = ({ id: 's1', number: 'X-901', name: 'Finishes', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'fin', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] }) as unknown as ProjectSheet;
const source = (set: unknown): ProjectSheetSource => ({ set, schedules: [{ id: 'fin', name: 'Room finishes', kind: 'finishes', createdAt: 0 }] }) as unknown as ProjectSheetSource;

const textsOf = (layout: ScheduleLayout): string[] => layout.prims.flatMap((p) => ('text' in p && typeof p.text === 'string' ? [p.text] : []));

async function load() {
  const store = await parseStep(new Uint8Array(readFileSync(FIXTURE)));
  useViewerStore.setState({ models: new Map([['fx', { id: 'fx', name: 'fx', ifcDataStore: store, visible: true } as never]]) });
  return store;
}

beforeEach(() => resetProject());

describe('the finishes schedule of the build is the app\'s, on rooms-with-finishes.ifc (#581)', () => {
  it('has the same rows, and they are not empty', async () => {
    const store = await load();
    const app = finishRows(roomFinishes(collectRoomInputs()));
    const engine = finishRows(roomFinishes(roomInputsOf(scheduleModelsOf({ dataStore: store }, 'fx'))));
    assert.ok(app.length >= 3, 'the app reads the fixture\'s rooms');
    assert.ok(app.some((row) => row.some((cell) => typeof cell === 'number')), 'and an area');
    assert.deepEqual(engine, app);
    // Independent of both readers: the first room of the fixture, read off its STEP text.
    assert.deepEqual(app[0], ['101', 'Living room', 'Level 1', 'Oak parquet', 24.5, 'Plaster, painted white', 52, 'Suspended plasterboard', 24.8]);
  });

  for (const language of ['en', 'ro'] as const) {
    it(`prints the same table texts on a sheet in ${language}`, async () => {
      const store = await load();
      const rooms = roomFinishes(collectRoomInputs());
      const catalogue = (language === 'en' ? en : ro) as unknown as Record<string, string>;
      const say = (key: FinishesWordKey) => catalogue[key];
      const place = { sheets: [sheet], sheet, vp: sheet.viewports![0] };
      const set = { views: [], sheets: [sheet], drafts: [], draftLayers: [], layerGroups: [], lineTypes: [], textStyles: [], dimStyles: [], hatchPatterns: [], symbols: [], issues: [], revisions: [] };
      const options = projectSheetOptions(source(set), { dataStore: store, meshes: [] } as never, language, language, 'fx');
      const pager = options.schedules!.pages!.get('fin');
      assert.ok(pager, 'the engine prints the finishes schedule');
      const engine = textsOf(pager(place));
      // The app's table: `layoutRoomFinishes` with the labels its own catalogue gives.
      const app = textsOf(layoutRoomFinishes(rooms, finishLabelsOf(say, language, 'Room finishes'), { maxHeight: 1000, page: 0 }));
      assert.ok(app.includes('Oak parquet'), 'the app\'s table has rows');
      assert.deepEqual(engine, app);
    });
  }

  for (const [language, words] of [['en', FINISHES_WORDS_EN], ['ro', FINISHES_WORDS_RO]] as const) {
    it(`${language}: every word of the engine's table reads the same in the app's catalogue`, () => {
      const catalogue = (language === 'en' ? en : ro) as unknown as Record<string, unknown>;
      const keys = Object.keys(words) as FinishesWordKey[];
      assert.ok(keys.length >= 8);
      const typed: TranslationKey[] = keys;
      assert.equal(typed.length, keys.length);
      for (const key of keys) assert.equal(catalogue[key], words[key], key);
      assert.equal(finishesSayFor(language)('finishes.floor'), words['finishes.floor']);
    });
  }
});
