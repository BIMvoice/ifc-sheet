/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #581 (8 of 8): the joinery schedules (door, window, all) `ifcsheet build --project` prints are the ones the app lays out. Three models go
 * through the real pipeline (parser, wasm geometry): AC20-FZK-Haus, the same with the two attic windows whose size the IFC does not state, and the
 * bloc-p4 sample. The app side is the app's own code (`scheduleDataOf` over the stores, its `entryViews`, `layoutJoineryOnSheet`, the
 * labels of its catalogue); the engine side is the pager `projectSheetOptionsWithViews` makes from the saved project and the opened model.
 * Four schedules are placed: a door schedule, a window schedule (one cell typed over, one type's name), an `all` schedule that is a
 * sub-report with a text row, and a wide window schedule in a small viewport box that runs over several pages. A comparison that holds
 * for empty tables is no comparison, so each case also states what it must hold:
 *   - rows: the entries are equal, and are not empty;
 *   - typed cells: the cell typed over prints and is marked pickable and overridden in both, and the text row prints;
 *   - thumbnails: the cards draw views cut from the meshes (plan lines and the section), the same ones in both;
 *   - page fit: the small box takes several pages, each page equal, with the same fit box and floor;
 *   - the measured size: the windows the IFC gives no size print `≈` in both;
 *   - the engine's table of words is the app's catalogues', key by key, in both languages.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JOINERY_WORDS_EN, JOINERY_WORDS_RO, joineryLabelsOf, joinerySayFor, setJoineryOverride,
  type JoineryCellOverride, type JoineryWordKey, type ProjectSchedule, type ProjectSheet, type ScheduleLayout,
} from '@bimvoice/ifcsheet';
import { openModel, projectSheetOptionsWithViews, type OpenedModel, type ProjectSheetSource } from '@bimvoice/ifcsheet/headless';
import type { ElementViews } from '@bimvoice/ifcsheet/project';
import { en } from '@/i18n/en';
import ro from '@/i18n/locales/ro';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { resetProject, useProjectStore } from './project-store';
import { entryViews } from '@/joinery/element-views-source';
import { scheduleData } from '@/joinery/schedule-data';
import { configureElementType } from '@/joinery/type-config-actions';
import { elementFacts } from '@/joinery/mapped-joinery';
import { invalidateJoineryReads } from '@/joinery/element-spec';
import type { ElementFacts } from '@/joinery/symbol-mapping';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { layoutJoineryOnSheet } from './schedule-fit';
import { scheduleMinBox } from '@/joinery/schedule-layout';

const BLOC = new URL('../../public/samples/bloc-p4.ifc', import.meta.url).pathname;
const SMALL = { w: 150, h: 70 };

const schedule = (id: string, kind: ProjectSchedule['kind'], extra: Partial<ProjectSchedule> = {}): ProjectSchedule => ({ id, name: `Schedule ${id}`, kind, createdAt: 0, ...extra });
const viewport = (viewId: string, box: { w: number; h: number } | null, page = 0) => ({ id: `vp-${viewId}-${page}`, viewId, x: 200, y: 140, scale: 50, width: box?.w ?? 0, height: box?.h ?? 0, center: null, ...(page ? { page } : {}) });
const sheetWith = (viewports: ReturnType<typeof viewport>[]) => ({ id: 's1', number: 'X-904', name: 'Joinery', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports }) as unknown as ProjectSheet;
const EMPTY_SET = { views: [], drafts: [], draftLayers: [], layerGroups: [], lineTypes: [], textStyles: [], dimStyles: [], hatchPatterns: [], symbols: [], issues: [], revisions: [] };

/** A primitive as compared: every shape, to a micrometre. */
const rounded = (x: unknown) => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)));
const textsOf = (layout: ScheduleLayout): string[] => layout.prims.flatMap((p) => ('text' in p && typeof p.text === 'string' ? [p.text] : []));

/** Two layouts equal to a micrometre; a difference is reported by its texts and counts, never by a diff of the whole (it is thousands of primitives). */
function sameLayout(engine: ScheduleLayout, app: ScheduleLayout, what: string): void {
  if (JSON.stringify(rounded(engine)) === JSON.stringify(rounded(app))) return;
  assert.deepEqual(textsOf(engine), textsOf(app), `${what}: texts`);
  assert.equal(engine.prims.length, app.prims.length, `${what}: primitives`);
  const at = engine.prims.findIndex((p, i) => JSON.stringify(rounded(p)) !== JSON.stringify(rounded(app.prims[i])));
  assert.fail(`${what}: the layouts differ${at >= 0 ? ` from primitive ${at}: ${JSON.stringify(rounded(engine.prims[at]))} against ${JSON.stringify(rounded(app.prims[at]))}` : ' outside their primitives'}`);
}

/** FZK's two attic windows without their OverallHeight and OverallWidth, so their size is measured from the body (#485); the type they form is one whose every element lacks it. */
function atticWindowsUnsized(text: string): string {
  const line = /^(#\d+=\s*IFCWINDOW\('[^']*',#\d+,'OG-Fenster-[12]',\$,\$,#\d+,#\d+,'[^']*',)1\.,1\.(,\$,\$,\$\);)$/gm;
  assert.equal([...text.matchAll(line)].length, 2, 'the two windows to strip are in the fixture');
  return text.replace(line, '$1$,$$$2');
}

describe('the joinery schedules of the build are the app\'s (#581)', { skip: planModelMissing(FZK_HAUS) || !existsSync(BLOC) && 'bloc-p4.ifc not found' }, () => {
  let dir: string;
  const models: Record<string, { path: string; engine?: OpenedModel }> = {};

  before(async () => {
    registerLocale('ro', ro as never);
    dir = mkdtempSync(join(tmpdir(), 'fzk-joinery-'));
    const unsized = join(dir, 'AC20-FZK-Haus-unsized-window.ifc');
    writeFileSync(unsized, atticWindowsUnsized(readFileSync(FZK_HAUS, 'utf8')));
    models.fzk = { path: FZK_HAUS };
    models.unsized = { path: unsized };
    models.bloc = { path: BLOC };
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => resetProject());
  afterEach(() => setLocale('en'));

  /** What both hosts are given: the four schedules on one sheet, a cell typed over, a text row and the opening-line convention. */
  /** Configures the type of every window and door (each type once): tilt-and-turn sashes with a transom row and glazing bars, swinging doors (#582, #580). */
  function configureTypes(): void {
    for (const [kind, operations, opening] of [['window', ['tilt-turn-left', 'tilt-turn-right'], { fanlight: true, bars: { horizontal: 2, vertical: 1 } }], ['door', ['swing-left'], { fanlight: false }]] as const) {
      const seen = new Set<string>();
      for (const o of scheduleData(kind).entries.flatMap((e) => e.occurrences)) {
        const f: ElementFacts | null = elementFacts('m', o.expressId);
        if (!f?.typeGlobalId || seen.has(f.typeGlobalId)) continue;
        seen.add(f.typeGlobalId);
        configureElementType(f, { operations: [...operations], ...opening }, {});
      }
      assert.ok(seen.size >= 1, `the ${kind}s have types to configure`);
    }
    invalidateJoineryReads();
  }

  function scenario(openingLines: 'handle' | 'hinge', configured: boolean) {
    if (configured) configureTypes();
    const windows = scheduleData('window');
    const all = scheduleData('all');
    assert.ok(windows.entries.length >= 1 && all.entries.length >= 2, 'the model has windows and doors');
    const first = windows.entries[0];
    const typed: JoineryCellOverride[] = setJoineryOverride(undefined, first, 'name', 'Typed over', first.name, windows.entries);
    const schedules = [
      schedule('d1', 'door'),
      schedule('w1', 'window', { scale: 50 }),
      schedule('a1', 'all', { textRows: [{ id: 't1', label: 'Maker', cells: Object.fromEntries(all.entries.map((e) => [e.key, { text: `Made ${e.mark}`, about: e.name }])) }] }),
      schedule('w2', 'all', { sub: { parent: 'a1', filter: { kinds: ['window'] } } }),
      schedule('wide', 'window', { scale: 20 }),
    ];
    const sheets = [sheetWith([viewport('d1', null), viewport('w1', null), viewport('a1', null), viewport('w2', null), viewport('wide', SMALL), viewport('wide', SMALL, 1)])];
    useProjectStore.setState({ schedules, joineryOverrides: typed, sheets, openingLines } as never);
    return { schedules, sheets, typed, first };
  }

  const sourceOf = (s: ReturnType<typeof scenario>): ProjectSheetSource => {
    const p = useProjectStore.getState();
    return { set: { ...EMPTY_SET, sheets: s.sheets }, schedules: s.schedules, joineryTypes: p.joineryTypes ?? [], joineryMapping: p.joineryMapping, symbolFlips: p.symbolFlips, joineryOverrides: s.typed, openingLines: p.openingLines } as unknown as ProjectSheetSource;
  };

  for (const [name, openingLines, configured] of [['fzk', 'handle', false], ['fzk', 'hinge', true], ['unsized', 'handle', false], ['bloc', 'handle', false]] as const) {
    for (const language of ['en', 'ro'] as const) {
      if (language === 'ro' && (name === 'bloc' || configured)) continue;
      it(`${name} (${configured ? `configured, ${openingLines}` : openingLines}): prints the same cards on a sheet in ${language}`, { timeout: 600_000 }, async () => {
        await loadPlanModel(models[name].path);
        const engineModel = (models[name].engine ??= await openModel(new Uint8Array(readFileSync(models[name].path))));
        setLocale(language);
        const s = scenario(openingLines, configured);
        const options = await projectSheetOptionsWithViews(sourceOf(s), engineModel, language, language, 'm');
        const pages = options.schedules!.pages!;
        const sheet = s.sheets[0];
        const say = (key: JoineryWordKey) => resolve(key);
        const appLayout = async (id: string, vp: (typeof sheet.viewports & object)[number]): Promise<ScheduleLayout> => {
          const sched = s.schedules.find((x) => x.id === id)!;
          const data = scheduleDataOf(sched);
          const scale = sched.scale ?? 50;
          return layoutJoineryOnSheet({ data, labels: joineryLabelsOf(say, language, sched.name), scale, views: await entryViews(data, scale), continued: language === 'ro' ? 'continuare' : 'continued', sheets: s.sheets, sheet, vp });
        };
        const place = (vp: (typeof sheet.viewports & object)[number]) => ({ continued: language === 'ro' ? 'continuare' : 'continued', sheets: s.sheets, sheet, vp });
        const compared: Record<string, { app: ScheduleLayout; engine: ScheduleLayout }> = {};
        for (const vp of sheet.viewports!) {
          const pager = pages.get(vp.viewId);
          assert.ok(pager, `the engine prints the schedule ${vp.viewId}`);
          const app = await appLayout(vp.viewId, vp);
          const engine = pager(place(vp));
          sameLayout(engine, app, `${vp.viewId} page ${vp.page ?? 0}`);
          compared[`${vp.viewId}.${vp.page ?? 0}`] = { app, engine };
        }
        // Rows: every schedule has cards and prints their marks.
        for (const id of ['d1', 'w1', 'a1', 'w2']) assert.ok(compared[`${id}.0`].app.prims.length > 40, `${id}: the app's table has rows`);
        assert.ok(textsOf(compared['a1.0'].engine).some((t) => /^[DW]\d/.test(t)), 'a mark is printed');
        // Typed cells: the cell typed over prints, is pickable and marked overridden, and so is the text row.
        const w1 = compared['w1.0'];
        assert.ok(textsOf(w1.engine).includes('Typed over'), 'the typed cell prints');
        assert.ok(w1.engine.cells!.some((c) => c.column === 'name' && c.overridden === true), 'and is marked overridden');
        assert.ok(textsOf(compared['w2.0'].engine).some((t) => t.startsWith('Made W')) && !textsOf(compared['w2.0'].engine).some((t) => /^D\d/.test(t)), 'the sub-report prints its text row and only its windows');
        // Thumbnails: views cut from the meshes (a view's primitives carry their view; the section is drawn beside the plan).
        const views: ReadonlyMap<string, ElementViews> = await entryViews(scheduleDataOf(s.schedules[1]), 50);
        assert.ok(views.size >= 1, 'the app cuts views');
        assert.ok(w1.engine.prims.some((p) => 'view' in p && p.view === 'plan') && w1.engine.prims.some((p) => 'view' in p && p.view === 'section'), 'a plan and a section are drawn');
        // Page fit: the small box takes several pages, each placed at the same box with the same floor.
        const [wide0, wide1] = [compared['wide.0'], compared['wide.1']];
        assert.ok((wide0.engine.pages ?? 1) >= 2, 'the small box runs over several pages');
        // The floor a resize may shrink the box to holds the views' room (the section beside the front view), not the cards' bare size.
        const bare = scheduleMinBox(scheduleDataOf(s.schedules[4]), { scale: 20 });
        assert.ok(wide0.engine.fit!.min.width > bare.width && wide0.engine.fit!.min.height > bare.height, 'the floor counts the views');
        assert.notDeepEqual(rounded(wide0.engine.prims), rounded(wide1.engine.prims), 'and the pages differ');
        assert.equal(JSON.stringify(rounded(wide1.engine.fit)), JSON.stringify(rounded(wide1.app.fit)), 'the fit box and its floor');
        assert.ok(wide1.engine.fit && wide1.engine.fit.box.w === SMALL.w && wide1.engine.fit.box.h === SMALL.h && wide1.engine.fit.min.width > 0);
        // The measured size: marked, in both.
        if (name === 'unsized') assert.ok(textsOf(compared['w1.0'].engine).some((t) => t.includes('≈')) && textsOf(compared['w1.0'].app).some((t) => t.includes('≈')), 'the measured size is marked ≈');
        else assert.ok(!textsOf(compared['w1.0'].engine).some((t) => t.includes('≈')), 'a stated size is not marked');
      });
    }
  }

  it('the engine leaves a joinery schedule of a model with none out, and says so', async () => {
    await loadPlanModel(FZK_HAUS);
    const engineModel = (models.fzk.engine ??= await openModel(new Uint8Array(readFileSync(FZK_HAUS))));
    const said: string[] = [];
    const s = scenario('handle', false);
    // The same model with every window class filtered away: the schedule of the filter's kind has no row.
    const source = sourceOf(s);
    const none = { ...source, schedules: [schedule('x', 'door', { sub: { parent: 'd1', filter: { kinds: ['window'] } } })], set: { ...source.set, sheets: [sheetWith([viewport('x', null)])] } } as unknown as ProjectSheetSource;
    const options = await projectSheetOptionsWithViews(none, engineModel, 'en', 'en', 'm', (left) => said.push(left.what));
    assert.equal(options.schedules!.pages!.has('x'), false);
    assert.deepEqual(said, ['the door schedule "Schedule x" (the model has no door)']);
  });

  for (const [language, words] of [['en', JOINERY_WORDS_EN], ['ro', JOINERY_WORDS_RO]] as const) {
    it(`${language}: every word of the engine's table reads the same in the app's catalogue`, () => {
      const catalogue = (language === 'en' ? en : ro) as unknown as Record<string, unknown>;
      const keys = Object.keys(words) as JoineryWordKey[];
      assert.ok(keys.length >= 29);
      for (const key of keys) assert.equal(catalogue[key], words[key], key);
      assert.equal(joinerySayFor(language)('schedule.row.sill'), words['schedule.row.sill']);
    });
  }
});
