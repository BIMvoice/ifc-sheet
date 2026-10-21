/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { registerLocale, setLocale } from '@/i18n/registry';
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
});
