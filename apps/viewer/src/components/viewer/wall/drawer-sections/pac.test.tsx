/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { PAC_ITEMS, PAC_RURAL_ITEMS, pacRuralSetTemplate, pacSetTemplate } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { registerLocale, setLocale } from '@/i18n/registry';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { titleBlockRoEn } from '@/i18n/catalogues/title-block-ro.en';
import { titleBlockRoRo } from '@/i18n/catalogues/title-block-ro.ro';
import { pacEn } from '@/i18n/catalogues/pac.en';
import { pacRo } from '@/i18n/catalogues/pac.ro';
import { pacSection } from './pac';
import type { ProjectSheet } from '@/project/types';

/**
 * The permit project (#364): the title block's phase hint names PAC and keeps DTAC as the old name; the drawer
 * lists every item of Anexa 2 point 1 with the scales the text states, and marks drawn what the set holds.
 */

const sheet = (series: ProjectSheet['series']): ProjectSheet => ({ id: `s-${series}`, number: 'A-1', name: 'x', series, createdAt: 0, viewports: [] });

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
    useProjectStore.setState({ sheets: [sheet('plans'), sheet('sections')] });
    const Section = pacSection.component;
    const ui = render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
    const row = (id: string) => ui.querySelector(`[data-pac-item="${id}"]`);
    assert.equal(ui.querySelectorAll('[data-pac-item]').length, PAC_ITEMS.length);
    assert.equal(row('plans')?.getAttribute('data-pac-drawn'), 'true');
    assert.equal(row('facades')?.getAttribute('data-pac-drawn'), 'false');
    assert.match(row('situationProposed')?.textContent ?? '', /1:1,000, 1:500/);
    assert.match(row('siteLocation')?.textContent ?? '', /1:25,000, 1:10,000, 1:5,000, 1:2,000, 1:1,000/);
    assert.match(row('plans')?.textContent ?? '', /suitable scale/);
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

describe('the simplified PAC checklist (Anexa 3)', () => {
  it('has a label in both languages for every item', () => {
    for (const item of PAC_RURAL_ITEMS) {
      assert.ok((pacEn as Record<string, string>)[`pac.item.${item.id}`], item.id);
      assert.ok((pacRo as Record<string, string>)[`pac.item.${item.id}`], item.id);
    }
  });

  it('switches from Anexa 2 to Anexa 3 and shows the point numbers and the 1:50 of the text', () => {
    const Section = pacSection.component;
    const ui = render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
    assert.equal(ui.querySelectorAll('[data-pac-item]').length, PAC_ITEMS.length);
    const toggle = ui.querySelector('[data-pac-mode="rural"]') as HTMLElement;
    act(() => toggle.click());
    const row = (id: string) => ui.querySelector(`[data-pac-item="${id}"]`);
    assert.equal(ui.querySelectorAll('[data-pac-item]').length, PAC_RURAL_ITEMS.length);
    assert.match(row('rural.fencePlans')?.textContent ?? '', /Anexa 3, 1 f\), 8 c\)/);
    assert.match(row('rural.plans')?.textContent ?? '', /Anexa 3, 1 e\), 8 a\).*Scale 1:50/);
    assert.match(row('rural.situationExisting')?.textContent ?? '', /Anexa 3, 1 b\), 2.*Scale 1:1,000, 1:500/);
  });

  it('asks the set for 1:50 on every drawing slot', () => {
    const template = pacRuralSetTemplate({ name: 'PAC', plans: 'P', facades: 'F', sections: 'S' });
    assert.ok(template.sheets.flatMap((s) => s.slots).every((slot) => slot.scale === 50));
  });
});
