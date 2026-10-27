/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { germanyItems, generateDefaultSet, germanySetTemplate, type DefaultSet, type GermanyLand } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { permitPackOf, projectDocument, resetProject, setGermanyLand, setPacMode, setPermitPack, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { registerLocale, setLocale } from '@/i18n/registry';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { germanyEn } from '@/i18n/catalogues/germany.en';
import { germanyRo } from '@/i18n/catalogues/germany.ro';
import { germanySection } from './germany';

/** The Germany mode (#372): an opt-in project field and the Land, a drawer switch "Deutschland (Bauantrag)", the checklist with its sources. */

const NAMES = { name: 'Germany', plans: 'Plans', sections: 'Sections', elevations: 'Elevations', site: 'Site', siteNotes: ['Scale note', 'To add note'], setback: 'Abstandsflächenplan', setbackNotes: ['Setback note: to be drawn'] };
const EXTENT = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 6, z: 9 } };

const building = (land: GermanyLand): DefaultSet => generateDefaultSet({
  storeys: [{ name: 'Ground', elevation: 0, globalId: 'g0' }, { name: 'First', elevation: 3, globalId: 'g1' }],
  extent: { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 6, z: 9 } },
  proposalInput: () => null,
}, { setTemplate: germanySetTemplate(NAMES, land), now: 0 })!;

const mount = () => {
  const Section = germanySection.component;
  return render(<Section go={() => undefined} onClose={() => undefined} extent={EXTENT} />);
};
const choose = (ui: HTMLElement, value: string) => act(() => {
  const select = ui.querySelector('[data-germany-land]') as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
});

beforeEach(() => resetProject());
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the Germany mode', () => {
  it('is off in a new project: nothing shown, no Land, no checklist', () => {
    const ui = mount();
    assert.equal(ui.textContent, '');
    assert.equal(ui.querySelectorAll('[data-germany-item]').length, 0);
    assert.equal(ui.querySelector('[data-germany-land]'), null);
    assert.equal(useProjectStore.getState().germanyLand, undefined);
  });

  it('lists the checklist of the chosen Land with its READ / unverified tags, and changes it with the Land', () => {
    const { document: doc } = building('bw');
    useProjectStore.setState({ views: doc.views, sheets: doc.sheets });
    const ui = mount();
    act(() => setPermitPack('germany'));
    assert.equal(useProjectStore.getState().germanyPermit, true);
    assert.match(ui.querySelector('[data-germany-land-note]')?.textContent ?? '', /No Land chosen/);
    const row = (id: string) => ui.querySelector(`[data-germany-item="${id}"]`);
    assert.equal(row('sitePlan')?.getAttribute('data-germany-status'), 'read');
    assert.match(row('sitePlan')?.textContent ?? '', /MBauVorlV.*§ 7.*Drawn at 1:500; the scale is unverified/s, 'no Land: the Lageplan scale is not claimed');

    choose(ui, 'bayern');
    assert.equal(useProjectStore.getState().germanyLand, 'bayern');
    assert.equal(ui.querySelector('[data-germany-land-note]'), null);
    assert.deepEqual([...ui.querySelectorAll('[data-germany-item]')].map((li) => li.getAttribute('data-germany-item')), germanyItems('bayern').map((i) => i.id));
    assert.match(row('sitePlan')?.textContent ?? '', /BayBauVorlV § 7.*Drawn at 1:1000/s);
    assert.doesNotMatch(row('sitePlan')?.textContent ?? '', /unverified/);
    assert.equal(row('setbackSheet'), null);
    assert.match(row('useCalculation')?.textContent ?? '', /BayBauVorlV § 3 no. 7.*To add/s);
    assert.match(row('otherDocuments')?.textContent ?? '', /not read.*Unverified/s);
    assert.equal(row('otherDocuments')?.getAttribute('data-germany-status'), 'unverified');

    choose(ui, 'nrw');
    assert.match(row('sitePlan')?.textContent ?? '', /BauPrüfVO § 3.*Drawn at 1:500/s);
    assert.match(row('useCalculation')?.textContent ?? '', /BauPrüfVO § 3\(2\)/);
    assert.equal(row('nrwFiling')?.getAttribute('data-germany-status'), 'unverified');

    choose(ui, 'bw');
    assert.match(row('sitePlan')?.textContent ?? '', /LBOVVO § 4.*Drawn at 1:500/s);
    assert.doesNotMatch(row('sitePlan')?.textContent ?? '', /unverified/);
    assert.match(row('setbackSheet')?.textContent ?? '', /LBOVVO § 4\(4\)/);
    // The sheet is made again with the Land; what it must show is not drawn by the model.
    assert.deepEqual([row('setbackSheet')?.getAttribute('data-germany-sheet'), row('setbackSheet')?.getAttribute('data-germany-drawn')], ['true', 'false']);
    assert.match(row('setbackSheet')?.textContent ?? '', /Sheet made; its content is to be added.*|To add/s);
    assert.equal(row('nrwFiling'), null);

    choose(ui, 'other');
    assert.match(ui.querySelector('[data-germany-land-note]')?.textContent ?? '', /Nothing was read for this Land/);
    assert.match(row('sitePlan')?.textContent ?? '', /1:500; the scale is unverified/);

    choose(ui, '');
    assert.equal(useProjectStore.getState().germanyLand, undefined);
    act(() => setPermitPack('pacFull'));
    assert.equal(useProjectStore.getState().germanyPermit, undefined);
    assert.equal(ui.querySelectorAll('[data-germany-item]').length, 0);
  });

  it('marks the views the model produces as drawn; the Lageplan sheet is made but its content is to be added', () => {
    const { document: doc } = building('bayern');
    useProjectStore.setState({ views: doc.views, sheets: doc.sheets });
    setPermitPack('germany');
    setGermanyLand('bayern');
    const ui = mount();
    const drawn = [...ui.querySelectorAll('[data-germany-drawn="true"]')].map((li) => li.getAttribute('data-germany-item'));
    assert.deepEqual(drawn, ['plans', 'facades']); // the synthetic model offers no section
    const lageplan = ui.querySelector('[data-germany-item="sitePlan"]')!;
    assert.deepEqual([lageplan.getAttribute('data-germany-drawn'), lageplan.getAttribute('data-germany-sheet'), lageplan.getAttribute('data-germany-state')], ['false', 'true', 'no']);
    assert.match(lageplan.textContent ?? '', /To add.*Sheet made; its content is to be added/s);
    assert.doesNotMatch(lageplan.textContent ?? '', /Drawn from the model/);
    for (const id of ['scaleBar', 'pdfA', 'oneFile', 'fileName', 'designer', 'useCalculation']) assert.equal(ui.querySelector(`[data-germany-item="${id}"]`)?.getAttribute('data-germany-drawn'), 'false', id);
    assert.match(ui.querySelector('[data-germany-item="pdfA"]')?.textContent ?? '', /DBauV § 11/);
  });

  it('keeps the pack and the Land in the project file: saved, reopened, and off saved as absent', () => {
    setPermitPack('germany');
    setGermanyLand('nrw');
    const saved = serializeProject(projectDocument());
    assert.deepEqual([JSON.parse(saved).germanyPermit, JSON.parse(saved).germanyLand], [true, 'nrw']);
    const loaded = parseProjectFile(saved);
    assert.deepEqual([loaded.germanyPermit, loaded.germanyLand, permitPackOf(loaded)], [true, 'nrw', 'germany']);
    resetProject();
    useProjectStore.setState({ germanyPermit: loaded.germanyPermit, germanyLand: loaded.germanyLand });
    const ui = mount();
    assert.equal(ui.querySelectorAll('[data-germany-item]').length > 0, true);
    assert.equal((ui.querySelector('[data-germany-land]') as HTMLSelectElement).value, 'nrw');
    setPermitPack('pacFull');
    setGermanyLand(undefined);
    const off = JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>;
    assert.deepEqual(['germanyPermit' in off, 'germanyLand' in off], [false, false]);
    assert.equal(parseProjectFile(saved.replace(/"germanyLand": "nrw"/, '"germanyLand": "bavaria"')).germanyLand, undefined);
    assert.equal(parseProjectFile(saved.replace(/"germanyPermit": true/, '"germanyPermit": "yes"')).germanyPermit, undefined);
  });

  it('is one choice with the other packs: turning one on turns the others off, in any order', () => {
    const fields = () => { const s = useProjectStore.getState(); return [s.pacMode, s.norwayPermit, s.germanyPermit]; };
    setPermitPack('pacRural');
    setPermitPack('germany');
    assert.deepEqual(fields(), [undefined, undefined, true]);
    setPermitPack('norway');
    assert.deepEqual(fields(), [undefined, true, undefined]);
    setPermitPack('germany');
    assert.deepEqual(fields(), [undefined, undefined, true]);
    setPacMode('rural');
    assert.deepEqual(fields(), ['rural', undefined, undefined]);
    setPermitPack('germany');
    setPacMode('full');
    assert.deepEqual(fields(), [undefined, undefined, undefined]);
  });

  it('keeps the Land when the pack is switched off and on again, and reads a file that holds several packs as Norway first, then Germany', () => {
    setPermitPack('germany');
    setGermanyLand('bw');
    setPermitPack('pacFull');
    assert.equal(useProjectStore.getState().germanyLand, 'bw');
    const both = { ...JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>, germanyPermit: true, norwayPermit: true, pacMode: 'rural' };
    assert.equal(permitPackOf(parseProjectFile(JSON.stringify(both))), 'norway');
    assert.equal(permitPackOf(parseProjectFile(JSON.stringify({ ...both, norwayPermit: undefined }))), 'germany');
    assert.equal(permitPackOf(parseProjectFile(JSON.stringify({ ...both, norwayPermit: undefined, germanyPermit: undefined }))), 'pacRural');
  });

  it('has a label in both languages for every item of every Land and reads in Romanian', () => {
    const ids = new Set(['sitePlan', ...(['bayern', 'nrw', 'bw', 'other'] as const).flatMap((l) => germanyItems(l).map((i) => i.id))]);
    for (const id of ids) {
      assert.ok((germanyEn as Record<string, string>)[`germany.item.${id}`], id);
      assert.ok((germanyRo as Record<string, string>)[`germany.item.${id}`], id);
    }
    for (const land of ['bayern', 'nrw', 'bw', 'other'] as const) {
      assert.ok((germanyEn as Record<string, string>)[`germany.set.siteScale.${land}`], land);
      assert.ok((germanyRo as Record<string, string>)[`germany.set.siteScale.${land}`], land);
      assert.ok((germanyRo as Record<string, string>)[`germany.land.${land}`], land);
    }
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    setPermitPack('germany');
    setGermanyLand('bayern');
    const ui = mount();
    assert.match(ui.textContent ?? '', /Planurile tuturor nivelurilor/);
    assert.match(ui.textContent ?? '', /Neverificat/);
  });

  it('names the Lageplan and the Abstandsflächenplan sheets with the official German term, and the scale only in the notes', () => {
    assert.equal(germanyEn['germany.set.site'], 'Site plan (Lageplan)');
    assert.equal(germanyEn['germany.set.setback'], 'Abstandsflächenplan');
    assert.equal(germanyRo['germany.set.setback'], 'Abstandsflächenplan');
    assert.equal(germanyRo['germany.set.site'], 'Plan de situație (Lageplan)');
    for (const c of [germanyEn, germanyRo] as Record<string, string>[]) {
      assert.doesNotMatch(c['germany.set.site'], /1:\d/);
      assert.match(c['germany.set.siteScale.bayern'], /1:1000/);
      assert.match(c['germany.set.siteScale.nrw'], /1:500/);
      assert.match(c['germany.set.siteScale.bw'], /1:500/);
    }
  });
});
