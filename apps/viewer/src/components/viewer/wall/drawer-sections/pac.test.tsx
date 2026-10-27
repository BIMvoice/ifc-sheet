/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { PAC_ITEMS, generateDefaultSet, pacSetTemplate, type DefaultSet } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { projectDocument, resetProject, setPacIntervention, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { registerLocale, setLocale } from '@/i18n/registry';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { titleBlockRoEn } from '@/i18n/catalogues/title-block-ro.en';
import { titleBlockRoRo } from '@/i18n/catalogues/title-block-ro.ro';
import { pacEn } from '@/i18n/catalogues/pac.en';
import { pacRo } from '@/i18n/catalogues/pac.ro';
import { pacSection } from './pac';

/**
 * The permit project (#364): the title block's phase hint names PAC and keeps DTAC as the old name; the drawer
 * lists every item of Anexa 2 point 1 with the scales the text states, and marks drawn what the set holds.
 */

const NAMES = { name: 'PAC', plans: 'Planuri de nivel', facades: 'Fațade', sections: 'Secțiuni principale' };

/** A four-storey building (a basement, the ground floor, two floors above) laid out with the PAC set template. */
function building(): DefaultSet {
  return generateDefaultSet({
    storeys: [{ name: 'Subsol', elevation: -3, globalId: 'g-1' }, { name: 'Parter', elevation: 0, globalId: 'g0' }, { name: 'Etaj 1', elevation: 3, globalId: 'g1' }, { name: 'Etaj 2', elevation: 6, globalId: 'g2' }],
    extent: { min: { x: 0, y: -3, z: 0 }, max: { x: 20, y: 9, z: 10 } },
    proposalInput: () => null,
  }, { setTemplate: pacSetTemplate(NAMES), now: 0 })!;
}

const load = (set: DefaultSet) => useProjectStore.setState({ views: set.document.views, sheets: set.document.sheets });
const mount = () => {
  const Section = pacSection.component;
  return render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
};
const stateOf = (ui: HTMLElement, id: string) => ui.querySelector(`[data-pac-item="${id}"]`)?.getAttribute('data-pac-state');

beforeEach(() => resetProject());
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the phase hint', () => {
  it('names PAC first and DTAC as the old name, in English and in Romanian', () => {
    for (const hint of [titleBlockRoEn['wall.tb.phaseHint'], titleBlockRoRo['wall.tb.phaseHint']]) {
      assert.ok(hint.indexOf('PAC') >= 0 && hint.indexOf('PAC') < hint.indexOf('DTAC'), hint);
      assert.ok(hint.includes('PTh') && hint.includes('DE'), hint);
    }
  });
});

describe('the PAC checklist', () => {
  it('has a label in both languages for every item', () => {
    for (const item of PAC_ITEMS) {
      assert.ok((pacEn as Record<string, string>)[`pac.item.${item.id}`], item.id);
      assert.ok((pacRo as Record<string, string>)[`pac.item.${item.id}`], item.id);
    }
  });

  it('lists the items with the scales the text states and marks drawn what the set holds', () => {
    load(building());
    const ui = mount();
    const row = (id: string) => ui.querySelector(`[data-pac-item="${id}"]`);
    assert.equal(ui.querySelectorAll('[data-pac-item]').length, PAC_ITEMS.length);
    assert.equal(row('plans')?.getAttribute('data-pac-drawn'), 'true');
    assert.equal(row('facades')?.getAttribute('data-pac-drawn'), 'true');
    assert.equal(row('sections')?.getAttribute('data-pac-drawn'), 'false');
    assert.match(row('situationProposed')?.textContent ?? '', /1:1,000, 1:500/);
    assert.match(row('siteLocation')?.textContent ?? '', /1:25,000, 1:10,000, 1:5,000, 1:2,000, 1:1,000/);
    assert.match(row('plans')?.textContent ?? '', /suitable scale/);
  });

  it('names the storeys with no plan on a sheet and does not mark the plans drawn (1.4.3 a: all levels)', () => {
    const set = building();
    const top = set.document.views.find((v) => v.kind === 'plan' && v.level.name === 'Etaj 2')!;
    useProjectStore.setState({ views: set.document.views, sheets: set.document.sheets.map((s) => ({ ...s, viewports: (s.viewports ?? []).filter((vp) => vp.viewId !== top.id) })) });
    const ui = mount();
    assert.equal(ui.querySelector('[data-pac-item="plans"]')?.getAttribute('data-pac-drawn'), 'false');
    assert.match(ui.querySelector('[data-pac-item="plans"] [data-pac-missing]')?.textContent ?? '', /No plan on a sheet for: Etaj 2$/);
  });

  it('marks every item of Anexa 2 point 1.4.4 not applicable for a new building, and asks them of an intervention on an existing one', () => {
    load(building());
    const ui = mount();
    assert.deepEqual(['diagnosis', 'structuralExpertise', 'survey'].map((id) => stateOf(ui, id)), ['na', 'na', 'na']);
    assert.match(ui.querySelector('[data-pac-item="survey"]')?.textContent ?? '', /Not applicable/);
    act(() => setPacIntervention('existing'));
    assert.deepEqual(['diagnosis', 'structuralExpertise', 'survey'].map((id) => stateOf(ui, id)), ['no', 'no', 'no']);
  });

  it('shows "Not applicable" for the items an interior-only intervention does not need, and keeps the rest', () => {
    load(building());
    const ui = mount();
    const select = ui.querySelector('select')!;
    act(() => { select.value = 'interior'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.equal(useProjectStore.getState().pacIntervention, 'interior');
    const states = Object.fromEntries(PAC_ITEMS.map((i) => [i.id, stateOf(ui, i.id)]));
    assert.deepEqual(states, {
      siteLocation: 'no', situationExisting: 'no', situationProposed: 'no', plans: 'yes', roof: 'na', facades: 'na', sections: 'no', context: 'na', utilities: 'no',
      engineeringDrawings: 'no', architectureMemo: 'no', specialtyMemos: 'no', neighbourExpertise: 'no', geotechnical: 'no', calculationBrief: 'no',
      diagnosis: 'no', structuralExpertise: 'no', survey: 'no',
    });
    assert.match(ui.querySelector('[data-pac-item="facades"]')?.textContent ?? '', /Not applicable/);
  });

  it('keeps the works in the project file: saved, reopened, and a new building saved as absent', () => {
    setPacIntervention('interior');
    const saved = serializeProject(projectDocument());
    assert.equal(JSON.parse(saved).pacIntervention, 'interior');
    assert.equal(parseProjectFile(saved).pacIntervention, 'interior');
    setPacIntervention('new');
    assert.equal('pacIntervention' in JSON.parse(serializeProject(projectDocument())), false);
    assert.equal(parseProjectFile(saved.replace('"interior"', '"demolition"')).pacIntervention, undefined);
  });

  it('says beside the button that it records an issue of the set and downloads the PDF and the list, in English and in Romanian', () => {
    const ui = mount();
    assert.match(ui.querySelector('[data-pac-submit]')?.nextElementSibling?.textContent ?? '', /^Records an issue of the set .* the submission PDF and the drawing list as CSV/);
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    assert.match(ui.querySelector('[data-pac-submit]')?.nextElementSibling?.textContent ?? '', /^Înregistrează o emitere a setului .* PDF-ul de depunere și lista planșelor ca CSV/);
  });

  it('reads in Romanian', () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    const Section = pacSection.component;
    const ui = render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
    assert.match(ui.textContent ?? '', /Plan de situație, situația propusă/);
    assert.match(ui.textContent ?? '', /o scară adecvată/);
  });
});

describe('the PAC set template', () => {
  it('asks for no scale, as Anexa 2 names none for architecture', () => {
    const template = pacSetTemplate({ name: 'PAC', plans: 'P', facades: 'F', sections: 'S' });
    assert.deepEqual(template.sheets.map((s) => s.series), ['plans', 'elevations', 'sections']);
    assert.ok(template.sheets.flatMap((s) => s.slots).every((slot) => slot.scale === undefined));
  });
});
