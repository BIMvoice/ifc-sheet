/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The class and material mapping in the view template list (#31): add a rule, edit its weight, fill and names, remove it; the swatch
 * is the one styler's answer; a change is written to the template (one undo step), so the drawings that follow it change with it.
 * Texts in both languages come from catalogue files.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render, type as typeInto, blur } from '@/test/render.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { styleRulesEn } from '@/i18n/catalogues/style-rules.en';
import { styleRulesRo } from '@/i18n/catalogues/style-rules.ro';
import { ViewTemplatesPanel } from './ViewTemplatesPanel';

const state = () => useProjectStore.getState();
const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const plansRules = () => state().viewTemplates!.find((t) => t.name === 'Plans')!.graphics.styleRules;

function mount() {
  const ui = render(<ViewTemplatesPanel />);
  ui.querySelector('details')!.open = true;
  const row = () => [...ui.querySelectorAll('li')].find((li) => (li.querySelector('input') as HTMLInputElement | null)?.value === 'Plans')!;
  const inRow = <T extends Element>(selector: string) => row().querySelector<T>(selector)!;
  return { ui, row, inRow };
}
function choose(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => { setter.call(select, value); select.dispatchEvent(new window.Event('change', { bubbles: true })); });
}

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  registerLocale('ro', checkCatalogue(ro).catalogue);
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }]);
  startDrawingSet(null, bounds);
  clearDraftHistory();
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

describe('the class and material mapping of a view template', () => {
  it('adds a class rule, edits it, and removes it; the template carries it and no drawing is written to', () => {
    const { inRow } = mount();
    typeInto(inRow<HTMLInputElement>('input[aria-label="Class or material to map"]'), 'IfcWall');
    click([...inRow<HTMLElement>('button')!.parentElement!.parentElement!.querySelectorAll('button')].find((b) => b.textContent === 'Add rule')!);
    assert.deepEqual(plansRules()?.map((r) => [r.by, r.match, r.style]), [['class', ['IfcWall'], {}]]);

    choose(inRow<HTMLSelectElement>('select[aria-label="Cut weight of IfcWall"]'), 'heavy');
    typeInto(inRow<HTMLInputElement>('input[aria-label="Fill of IfcWall"]'), '#999999');
    assert.deepEqual(plansRules()?.[0].style, { lineWeight: 'heavy', fillColor: '#999999' });
    assert.equal(state().views.every((v) => v.graphics === undefined), true);

    click(inRow<HTMLElement>('button[aria-label="No fill for IfcWall"]'));
    assert.deepEqual(plansRules()?.[0].style, { lineWeight: 'heavy' });

    const names = inRow<HTMLInputElement>('input[aria-label="IFC class names, separated by ;"]');
    typeInto(names, 'IfcWall; IfcCurtainWall');
    blur(names);
    assert.deepEqual(plansRules()?.[0].match, ['IfcWall', 'IfcCurtainWall']);

    click(inRow<HTMLElement>('button[aria-label="Remove the rule for IfcWall; IfcCurtainWall"]'));
    assert.equal(plansRules(), undefined, 'a template with no rules is saved as it was before the mapping');
  });

  it('the swatch is what the one styler says: a heavy grey wall', () => {
    const { inRow } = mount();
    typeInto(inRow<HTMLInputElement>('input[aria-label="Class or material to map"]'), 'IfcWall');
    click([...inRow<HTMLElement>('button')!.parentElement!.parentElement!.querySelectorAll('button')].find((b) => b.textContent === 'Add rule')!);
    choose(inRow<HTMLSelectElement>('select[aria-label="Cut weight of IfcWall"]'), 'heavy');
    typeInto(inRow<HTMLInputElement>('input[aria-label="Fill of IfcWall"]'), '#999999');
    const swatch = inRow<SVGElement>('svg[aria-label="How IfcWall draws"]');
    assert.deepEqual([swatch.getAttribute('data-fill'), swatch.getAttribute('data-weight')], ['#999999', '0.7']);
  });

  it('a material rule offers a fill and a hatch, not a line', () => {
    const { inRow } = mount();
    choose(inRow<HTMLSelectElement>('select[aria-label="Kind of rule"]'), 'material');
    typeInto(inRow<HTMLInputElement>('input[aria-label="Class or material to map"]'), 'Concrete');
    click([...inRow<HTMLElement>('button')!.parentElement!.parentElement!.querySelectorAll('button')].find((b) => b.textContent === 'Add rule')!);
    assert.equal(plansRules()?.[0].by, 'material');
    assert.equal(inRow('select[aria-label="Cut weight of Concrete"]'), null);
    assert.equal(inRow('input[aria-label="Line colour of Concrete"]'), null);
    choose(inRow<HTMLSelectElement>('select[aria-label="Hatch of Concrete"]'), 'LINES45');
    assert.equal(plansRules()?.[0].style.cutHatch, 'LINES45');
  });

  it('one undo step per change', () => {
    const { inRow } = mount();
    typeInto(inRow<HTMLInputElement>('input[aria-label="Class or material to map"]'), 'IfcSlab');
    click([...inRow<HTMLElement>('button')!.parentElement!.parentElement!.querySelectorAll('button')].find((b) => b.textContent === 'Add rule')!);
    assert.equal(plansRules()?.length, 1);
    act(() => { undoDrafts(); });
    assert.equal(plansRules(), undefined);
  });

  it('has its texts in English and Romanian from catalogue files, the same keys in both', () => {
    assert.deepEqual(Object.keys(styleRulesRo).sort(), Object.keys(styleRulesEn).sort());
    act(() => setLocale('ro'));
    const { ui } = mount();
    assert.match(ui.textContent ?? '', /Asociere după clasă și material/);
  });
});
