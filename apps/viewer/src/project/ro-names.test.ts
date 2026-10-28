/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_NAMES_EN, nameOf, nameResolverFor, unknownLanguageMessage, type EngineNameKey } from '@bimvoice/ifcsheet/names';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import { sectionMarkOf, sectionViewName } from '@/drafting/section-symbol';
import { startDrawingSet } from './drawing-set-actions';
import { detailViewName } from './detail';
import type { ModelExtent } from './drawing-set';
import { parseProjectFile, serializeProject } from './project-file';
import { projectDocument, resetProject, useProjectStore } from './project-store';
import { defaultViews } from './view-defaults';
import type { ProjectLevel } from './types';

/**
 * The names the app gives what it creates (#53): in the active language at
 * creation, stored as plain text, never translated again.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Erdgeschoss', elevation: 0, storeyGlobalIds: ['L0'] }];

const start = () => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
  const { name, sheets, views } = useProjectStore.getState();
  return { project: name, sheets: sheets.map((s) => s.name), views: views.map((v) => v.name) };
};

beforeEach(() => registerLocale('ro', checkCatalogue(ro).catalogue));
afterEach(() => setLocale('en'));

describe('Generated names', () => {
  it('are Romanian when the set is started under ro, and keep the storey name from the model', () => {
    setLocale('ro');
    const made = start();
    assert.deepEqual(made.sheets, ['Planuri', 'Fațade sud și nord', 'Fațade est și vest', 'Secțiuni']);
    assert.deepEqual(made.views.filter((n) => n.startsWith('Fațada')).sort(), ['Fațada est', 'Fațada nord', 'Fațada sud', 'Fațada vest']);
    assert.ok(made.views.includes('Erdgeschoss'));
    assert.ok(made.views.some((n) => /^Secțiunea [A-Z]-[A-Z]$/.test(n)), made.views.join(', '));
    assert.equal(made.project, 'Proiect fără titlu');
    assert.equal(sectionViewName('A'), 'Secțiunea A-A');
    assert.equal(detailViewName(2, 'Fațada sud'), 'Detaliu 2 - Fațada sud');
  });

  it('are byte-identical to what main made under en', () => {
    const made = start();
    assert.deepEqual(made.sheets, ['Floor plans', 'Elevations, south and north', 'Elevations, east and west', 'Sections']);
    assert.deepEqual(made.views.filter((n) => n.endsWith('Elevation')).sort(), ['East Elevation', 'North Elevation', 'South Elevation', 'West Elevation']);
    assert.equal(made.project, 'Untitled project');
    assert.equal(sectionViewName('A'), 'Section A-A');
    assert.equal(detailViewName(1, 'Plan'), 'Detail 1 - Plan');
  });

  it('read back as the same section mark in either language', () => {
    assert.equal(sectionMarkOf('Section B-B'), 'B');
    assert.equal(sectionMarkOf('Secțiunea B-B'), 'B');
  });

  it('are not translated when the language changes or an English project is loaded under ro', () => {
    const english = start();
    setLocale('ro');
    const after = useProjectStore.getState();
    assert.deepEqual({ project: after.name, sheets: after.sheets.map((s) => s.name), views: after.views.map((v) => v.name) }, english);

    const file = serializeProject(projectDocument());
    resetProject();
    const loaded = parseProjectFile(file);
    assert.equal(loaded.name, 'Untitled project');
    assert.deepEqual(loaded.sheets.map((s) => s.name), english.sheets);
    assert.deepEqual(loaded.views.map((v) => v.name), english.views);
  });

  it('are the engine\'s names in every language, key by key, so the app and a command-line build write the same text', () => {
    const keys = Object.keys(ENGINE_NAMES_EN) as EngineNameKey[];
    const params = { n: 2, mark: 'B' };
    for (const language of ['en', 'ro'] as const) {
      setLocale(language);
      for (const key of keys) assert.equal(resolve(key, params), nameResolverFor(language)(key, params), `${language} ${key}`);
    }
  });

  it('record the language they were made in, once, when the set is started', () => {
    setLocale('ro');
    start();
    assert.equal(useProjectStore.getState().language, 'ro');
    assert.equal(projectDocument().language, 'ro');
    // Started again under another language, the project keeps the language its names were made in.
    setLocale('en');
    useProjectStore.setState({ sheets: [] });
    startDrawingSet(null, HOUSE);
    assert.equal(useProjectStore.getState().language, 'ro');
    resetProject();
    assert.equal(useProjectStore.getState().language, undefined);
    start();
    assert.equal(useProjectStore.getState().language, 'en');
  });

  it('follow the language the project recorded, not the interface language, once there is one (an English project under ro)', () => {
    setLocale('ro');
    resetProject();
    useProjectStore.setState({ language: 'en' });
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
    // What the command line writes for a project that records en: the same text, sheets, views and details alike.
    assert.equal(nameOf('names.sheet.plans'), 'Floor plans');
    assert.equal(nameOf('names.viewTemplate.plan'), 'Plans');
    assert.equal(sectionViewName('A'), 'Section A-A');
    assert.equal(detailViewName(1, 'Plan'), 'Detail 1 - Plan');
    startDrawingSet(null, HOUSE);
    const { sheets, views, language } = useProjectStore.getState();
    assert.deepEqual(sheets.map((s) => s.name), ['Floor plans', 'Elevations, south and north', 'Elevations, east and west', 'Sections']);
    assert.ok(views.some((v) => v.name === 'North Elevation'), views.map((v) => v.name).join(', '));
    assert.equal(language, 'en');
    // A project that records none is named in the interface language, and records it.
    resetProject();
    assert.equal(nameOf('names.sheet.plans'), 'Planuri');
    assert.equal(sectionViewName('A'), 'Secțiunea A-A');
  });

  it('read the project language with the command line\'s validator: ro/en are kept, anything else is ignored with its message', () => {
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(String(args[0]));
    try {
      const read = (language: unknown) => parseProjectFile(serializeProject({ ...projectDocument(), language: language as never })).language;
      assert.equal(read('ro'), 'ro');
      assert.equal(read('en'), 'en');
      assert.equal(read('de'), undefined);
      assert.equal(read('ro-RO'), undefined);
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warned, [`[project] ${unknownLanguageMessage('de')}`, `[project] ${unknownLanguageMessage('ro-RO')}`]);
  });
});
