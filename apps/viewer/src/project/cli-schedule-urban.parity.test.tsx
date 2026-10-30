/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #581 (5 of 8): the urban indicators `ifcsheet build --project` prints are the ones the app lays out, on AC20-FZK-Haus through the real
 * pipeline (parser, wasm geometry). The two hosts fill `ScheduleModel` differently (the app from its stores and renderer, the engine from
 * an opened model) and read the same rule, under three site areas: one typed over a plot drawn on the site plan, the plot alone, and none (the
 * model states no site area, so POT and CUT are not given):
 *   - the measured areas (storeys with their footprints, rooms, the model's site area) and the indicators are equal and not empty: Ac, Ad
 *     and Au have figures, and POT and CUT follow the site area chosen;
 *   - the CSV tables and the texts of the table the app puts on a sheet and the engine's pager prints are equal, in English and in Romanian;
 *   - the engine's table of words is the app's catalogues', key by key, in both languages.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  URBAN_WORDS_EN, URBAN_WORDS_RO, layoutUrban, urbanLabelsOf, urbanSayFor, urbanTable,
  type DraftEntity, type ProjectSheet, type ScheduleLayout, type UrbanSay, type UrbanWordKey,
} from '@bimvoice/ifcsheet';
import { projectSheetOptions, type ProjectSheetSource } from '@bimvoice/ifcsheet/headless';
import { sheetUrbanOf, urbanResultOf } from '@bimvoice/ifcsheet/urban';
import { en, type TranslationKey } from '@/i18n/en';
import ro from '@/i18n/locales/ro';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { modelLevels } from '@/project/model-levels';
import { collectUrbanAreas } from '@/urban/urban-models';
import { urbanLabelsOf as appLabelsOf, urbanResultOf as appResultOf } from '@/components/viewer/urban/useUrban';
import type { ProjectView } from '@/project/types';

const SITE_PLAN = { id: 'site', name: 'Site plan', kind: 'plan', site: true, createdAt: 0, cutHeight: 1.2, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] } } as unknown as ProjectView;
const PLOT: DraftEntity = { id: 'plot-1', viewId: 'site', layerId: 'plot-boundary', params: {}, shape: { type: 'polyline', pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }], closed: true } } as DraftEntity;
interface Scenario { siteArea?: number; plot: boolean; source: 'typed' | 'plot' | 'model' | null }
const SCENARIOS: Record<string, Scenario> = {
  typed: { siteArea: 700, plot: true, source: 'typed' },
  plot: { plot: true, source: 'plot' },
  none: { plot: false, source: null },
};

const sheet = ({ id: 's1', number: 'X-904', name: 'Urban', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'ur', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] }) as unknown as ProjectSheet;
const setOf = (plot: boolean) => ({ views: plot ? [SITE_PLAN] : [], sheets: [sheet], drafts: plot ? [PLOT] : [], draftLayers: [], layerGroups: [], lineTypes: [], textStyles: [], dimStyles: [], hatchPatterns: [], symbols: [], issues: [], revisions: [] });
const sourceOf = (s: Scenario): ProjectSheetSource => ({
  set: setOf(s.plot), schedules: [{ id: 'ur', name: 'Urban', kind: 'urban', createdAt: 0 }], ...(s.siteArea ? { siteArea: s.siteArea } : {}),
}) as unknown as ProjectSheetSource;
/** The app's translation of the engine's keys: what the app's own `t` says. */
const say: UrbanSay = (key, params) => resolve(key, params);
const textsOf = (layout: ScheduleLayout): string[] => layout.prims.flatMap((p) => ('text' in p && typeof p.text === 'string' ? [p.text] : []));

describe('the urban indicators of the build are the app\'s, on AC20-FZK-Haus (#581)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let opened: never;
  let app: ReturnType<typeof collectUrbanAreas>;

  before(async () => {
    registerLocale('ro', ro as never);
    await loadPlanModel(FZK_HAUS);
    const model = useViewerStore.getState().models.get('m')!;
    opened = { dataStore: model.ifcDataStore, meshes: model.geometryResult!.meshes, storeys: modelLevels('m') } as never;
    app = collectUrbanAreas();
  });
  after(() => useProjectStore.setState({ siteArea: undefined } as never));
  afterEach(() => setLocale('en'));

  const appResult = (s: Scenario) => appResultOf(app, { siteArea: s.siteArea, views: s.plot ? [SITE_PLAN] : [], drafts: s.plot ? [PLOT] : [], urbanSettings: undefined });

  it('measures the same areas, and they are not empty', () => {
    const engine = sheetUrbanOf(opened, 'm').areas;
    assert.deepEqual(engine, app);
    // Rows: two storeys with a footprint, the rooms of the model, and the figures the rules make of them (hand figures in urban-fzk.test.ts).
    assert.equal(app.storeys.length, 2);
    assert.ok(app.storeys.every((s) => s.footprint !== null), 'every storey is outlined');
    assert.ok(app.spaces.length >= 7, 'the rooms Au sums');
  });

  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(`reads the same indicators on the site area of the ${name} scenario`, () => {
      const { result, site } = appResult(scenario);
      assert.equal(site.source, scenario.source);
      assert.ok(result.ac !== null && result.ac > 100 && result.ad !== null && result.au !== null && result.au > 100, 'Ac, Ad and Au have figures');
      assert.equal(result.pot !== null, scenario.source !== null, 'POT follows the site area chosen');
      if (scenario.siteArea) assert.equal(site.area, scenario.siteArea);
      else if (scenario.plot) assert.equal(site.area, 600);
    });
  }

  it('has the same CSV tables, the engine\'s from its own read and its own words', () => {
    const read = sheetUrbanOf(opened, 'm').areas;
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      for (const language of ['en', 'ro'] as const) {
        setLocale(language);
        const engine = urbanResultOf(read, { siteArea: scenario.siteArea, views: scenario.plot ? [SITE_PLAN] : [], drafts: scenario.plot ? [PLOT] : [] });
        const mine = urbanTable(engine.result, urbanLabelsOf(urbanSayFor(language), language, 'Urban', read, engine.site));
        const { result, site } = appResult(scenario);
        const t = say as never;
        const theirs = urbanTable(result, appLabelsOf(t, language, 'Urban', app, site));
        assert.deepEqual(mine, theirs, `${name} ${language}`);
        assert.ok(mine.rows.length > 8 && mine.notes!.length >= 4);
      }
    }
  });

  for (const language of ['en', 'ro'] as const) {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      it(`prints the same table texts on a sheet in ${language}, ${name}`, () => {
        setLocale(language);
        const place = { sheets: [sheet], sheet, vp: sheet.viewports![0] };
        const options = projectSheetOptions(sourceOf(scenario), opened, language, language, 'm');
        const pager = options.schedules!.pages!.get('ur');
        assert.ok(pager, 'the engine prints the urban schedule');
        const printed = textsOf(pager(place));
        // The app's table: `layoutUrban` with the labels its own translation gives.
        const { result, site } = appResult(scenario);
        const t = say as never;
        const appTexts = textsOf(layoutUrban(result, appLabelsOf(t, language, 'Urban', app, site), { maxHeight: 1000, page: 0 }));
        assert.ok(appTexts.length > 30 && appTexts.some((x) => /POT/.test(x)), 'the app\'s table has rows');
        assert.deepEqual(printed, appTexts);
      });
    }
  }

  it('reads the rooms the app sums Au over', () => {
    const read = sheetUrbanOf(opened, 'm');
    assert.equal(read.rooms.length, app.spaces.length);
    assert.deepEqual(read.rooms.map((r) => [r.level, r.area, r.category]), app.spaces.map((s) => [s.storey, s.area, s.category]));
  });

  for (const [language, words] of [['en', URBAN_WORDS_EN], ['ro', URBAN_WORDS_RO]] as const) {
    it(`${language}: every word of the engine's table reads the same in the app's catalogue`, () => {
      const catalogue = (language === 'en' ? en : ro) as unknown as Record<string, unknown>;
      const keys = Object.keys(words) as UrbanWordKey[];
      assert.equal(keys.length, 36);
      const typed: TranslationKey[] = keys;
      assert.equal(typed.length, keys.length);
      for (const key of keys) assert.deepEqual(catalogue[key], words[key], key);
    });
  }
});
