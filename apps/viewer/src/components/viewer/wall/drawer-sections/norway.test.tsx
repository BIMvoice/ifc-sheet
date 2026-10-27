/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { NORWAY_ITEMS, generateDefaultSet, norwaySetTemplate, type DefaultSet } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { permitPackOf, projectDocument, resetProject, setNorwayPermit, setPacMode, setPermitPack, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { registerLocale, setLocale } from '@/i18n/registry';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { norwayEn } from '@/i18n/catalogues/norway.en';
import { norwayRo } from '@/i18n/catalogues/norway.ro';
import { norwaySection } from './norway';

/** The Norway mode (#372): an opt-in project field, a drawer switch "Norge (byggesak)", the checklist with its sources. */

const NAMES = { name: 'Norway', plans: 'Plans', sections: 'Sections', facades: 'Facades', site: 'Site', siteNotes: ['Scale note', 'To add note'] };

const building = (): DefaultSet => generateDefaultSet({
  storeys: [{ name: 'Ground', elevation: 0, globalId: 'g0' }, { name: 'First', elevation: 3, globalId: 'g1' }],
  extent: { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 6, z: 9 } },
  proposalInput: () => null,
}, { setTemplate: norwaySetTemplate(NAMES), now: 0 })!;

const mount = () => {
  const Section = norwaySection.component;
  return render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
};
const toggle = (ui: HTMLElement) => act(() => { (ui.querySelector('[data-norway-switch]') as HTMLInputElement).click(); });

beforeEach(() => resetProject());
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the Norway mode', () => {
  it('is off in a new project: the switch only, no checklist', () => {
    const ui = mount();
    assert.equal((ui.querySelector('[data-norway-switch]') as HTMLInputElement).checked, false);
    assert.equal(ui.querySelectorAll('[data-norway-item]').length, 0);
    assert.match(ui.textContent ?? '', /Norge \(byggesak\)/);
  });

  it('switches on from the drawer and lists every item with its source and READ / unverified status', () => {
    const { document: doc } = building();
    useProjectStore.setState({ views: doc.views, sheets: doc.sheets });
    const ui = mount();
    toggle(ui);
    assert.equal(useProjectStore.getState().norwayPermit, true);
    assert.equal(ui.querySelectorAll('[data-norway-item]').length, NORWAY_ITEMS.length);
    const row = (id: string) => ui.querySelector(`[data-norway-item="${id}"]`)!;
    assert.deepEqual(NORWAY_ITEMS.map((i) => row(i.id).getAttribute('data-norway-status')), ['read', 'read', 'read', 'read', 'read', 'read', 'read', 'read', 'read', 'read', 'read', 'unverified']);
    assert.deepEqual(NORWAY_ITEMS.filter((i) => row(i.id).getAttribute('data-norway-drawn') === 'true').map((i) => i.id), ['plans', 'facades', 'sitePlan']); // the synthetic model offers no section
    assert.match(row('plans').textContent ?? '', /SAK10 § 5-4 \(3\) m.*Drawn at 1:100/);
    assert.match(row('sitePlan').textContent ?? '', /Drawn at 1:500; the scale is unverified.*Read in the official text/);
    assert.doesNotMatch(row('sitePlan').textContent ?? '', /Unverified/);
    // The views are drawn; what they must show is for the person to add.
    for (const id of ['roomUse', 'floorHeights', 'facadeTerrain', 'mainDimensions', 'siteDistances', 'terrainLines']) assert.equal(row(id).getAttribute('data-norway-drawn'), 'false', id);
    assert.doesNotMatch(row('plans').textContent ?? '', /room/i);
    assert.match(row('eaveRidgeHeights').textContent ?? '', /not in force.*Unverified/);
    assert.match(ui.textContent ?? '', /1:500 is the usual one and is a default here, not a rule/);
    toggle(ui);
    assert.equal(useProjectStore.getState().norwayPermit, undefined);
    assert.equal(ui.querySelectorAll('[data-norway-item]').length, 0);
  });

  it('keeps the mode in the project file: saved, reopened, and off saved as absent', () => {
    setNorwayPermit(true);
    const saved = serializeProject(projectDocument());
    assert.equal(JSON.parse(saved).norwayPermit, true);
    assert.equal(parseProjectFile(saved).norwayPermit, true);
    resetProject();
    useProjectStore.setState({ norwayPermit: parseProjectFile(saved).norwayPermit });
    assert.equal(mount().querySelector('[data-norway-switch]') !== null && (mount().querySelector('[data-norway-switch]') as HTMLInputElement).checked, true);
    setNorwayPermit(false);
    assert.equal('norwayPermit' in JSON.parse(serializeProject(projectDocument())), false);
    assert.equal(parseProjectFile(saved.replace('"norwayPermit": true', '"norwayPermit": "yes"').replace('"norwayPermit":true', '"norwayPermit":"yes"')).norwayPermit, undefined);
  });

  it('has a label in both languages for every item and reads in Romanian', () => {
    for (const item of NORWAY_ITEMS) {
      assert.ok((norwayEn as Record<string, string>)[`norway.item.${item.id}`], item.id);
      assert.ok((norwayRo as Record<string, string>)[`norway.item.${item.id}`], item.id);
    }
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    setNorwayPermit(true);
    const ui = mount();
    assert.match(ui.textContent ?? '', /Planurile tuturor nivelurilor/);
    assert.match(ui.textContent ?? '', /Neverificat/);
  });

  it('is one choice with the PAC modes: turning one on turns the other off, in either order', () => {
    setPermitPack('pacRural');
    assert.deepEqual([useProjectStore.getState().pacMode, useProjectStore.getState().norwayPermit], ['rural', undefined]);
    setNorwayPermit(true);
    assert.deepEqual([useProjectStore.getState().pacMode, useProjectStore.getState().norwayPermit], [undefined, true]);
    setPacMode('rural');
    assert.deepEqual([useProjectStore.getState().pacMode, useProjectStore.getState().norwayPermit], ['rural', undefined]);
    setNorwayPermit(true);
    setPacMode('full');
    assert.deepEqual([useProjectStore.getState().pacMode, useProjectStore.getState().norwayPermit], [undefined, undefined]);
    setPacMode('rural');
    setNorwayPermit(false);
    assert.equal(useProjectStore.getState().pacMode, 'rural', 'switching Norway off leaves the rural pack alone');
    const saved = JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>;
    assert.deepEqual([saved.pacMode, 'norwayPermit' in saved], ['rural', false]);
  });

  it('switching Norway on in the drawer turns the rural PAC pack off, and the file keeps only Norway', () => {
    setPacMode('rural');
    const ui = mount();
    toggle(ui);
    const saved = JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>;
    assert.deepEqual([saved.norwayPermit, 'pacMode' in saved], [true, false]);
    assert.equal(ui.querySelectorAll('[data-norway-item]').length, NORWAY_ITEMS.length);
  });

  it('reads a project file that holds both as Norway, and loads old files with either field', () => {
    const both = { ...JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>, norwayPermit: true, pacMode: 'rural' };
    const doc = parseProjectFile(JSON.stringify(both));
    assert.equal(permitPackOf(doc), 'norway');
    assert.equal(permitPackOf(parseProjectFile(JSON.stringify({ ...both, norwayPermit: undefined }))), 'pacRural');
    assert.equal(permitPackOf(parseProjectFile(JSON.stringify({ ...both, pacMode: undefined }))), 'norway');
    assert.equal(permitPackOf(parseProjectFile(JSON.stringify({ ...both, pacMode: undefined, norwayPermit: undefined }))), 'pacFull');
  });

  it('names the situasjonsplan sheet plainly in both languages; the scale and to-add notes are separate lines', () => {
    assert.equal(norwayEn['norway.set.site'], 'Site plan (situasjonsplan)');
    assert.equal(norwayRo['norway.set.site'], 'Plan de situație (situasjonsplan)');
    for (const c of [norwayEn, norwayRo] as Record<string, string>[]) {
      assert.doesNotMatch(c['norway.set.site'], /1:500/);
      assert.match(c['norway.set.siteScale'], /1:500/);
      assert.match(c['norway.set.siteToAdd'], /tomt, avstander og terreng/);
    }
  });
});
