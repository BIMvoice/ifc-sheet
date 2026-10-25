/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Graphics section of a drawing's card and the project drawer's View templates (#44): categories on and off, the template
 * picker with Save as, Detach and Reset overrides, the layers this viewport hides on its sheet, and the drawer's list where a template
 * is renamed, edited once for all its drawings, or deleted.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render, type as typeInto, blur } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import type { SheetViewport } from '@/project/types';
import { resetSectionChoices } from './card-section-state';
import { GraphicsCard } from './GraphicsCard';
import { ViewTemplatesPanel } from './ViewTemplatesPanel';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const state = () => useProjectStore.getState();

beforeEach(() => {
  resetProject();
  resetSectionChoices();
  clearDraftHistory();
  registerLocale('ro', checkCatalogue(ro).catalogue);
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }]);
  startDrawingSet(null, bounds);
  useProjectStore.setState({ draftLayers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }, { id: 'L-dim', name: 'Dimensions', color: '#cc0000', visible: true, locked: false }] });
  clearDraftHistory();
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const plans = () => state().views.filter((v) => v.kind === 'plan');
const slotOf = (viewId: string): { sheet: ReturnType<typeof state>['sheets'][number]; slot: SheetViewport } => {
  const sheet = state().sheets.find((s) => s.viewports?.some((vp) => vp.viewId === viewId))!;
  return { sheet, slot: sheet.viewports!.find((vp) => vp.viewId === viewId)! };
};
/** The card as the viewport card mounts it: the drawing and the sheet read from the project, so an edit redraws it. */
function Card({ viewId }: { viewId: string }) {
  const view = useProjectStore((s) => s.views.find((v) => v.id === viewId))!;
  const sheet = useProjectStore((s) => s.sheets.find((x) => x.viewports?.some((vp) => vp.viewId === viewId)))!;
  return <GraphicsCard sheet={sheet} slot={sheet.viewports!.find((vp) => vp.viewId === viewId)!} view={view} />;
}
const mountCard = (viewId: string) => {
  const ui = render(<Card viewId={viewId} />);
  openSection(ui, 'Graphics');
  return ui;
};
const checkbox = (ui: ParentNode, label: string) => ui.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const buttonText = (ui: ParentNode, text: string | RegExp) => [...ui.querySelectorAll('button')].find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')));
const choose = (select: HTMLSelectElement, value: string): void => {
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
};

describe('the Graphics section of a drawing\'s card', () => {
  it('says which template the drawing follows when closed, and lists the categories with the template\'s look when open', () => {
    const [plan] = plans();
    const ui = render(<Card viewId={plan.id} />);
    assert.match(ui.textContent ?? '', /Template Plans/);
    openSection(ui, 'Graphics');
    assert.equal(checkbox(ui, 'Show Furniture').checked, true);
    assert.equal(ui.querySelector<HTMLSelectElement>('select')!.value, plan.templateId);
  });

  it('turns a category off for this drawing alone, as an override of the template; Reset overrides takes it back', () => {
    const [plan, other] = plans();
    const ui = mountCard(plan.id);
    click(checkbox(ui, 'Show Furniture'));
    assert.deepEqual(state().views.find((v) => v.id === plan.id)!.graphics, { categories: { furniture: { visible: false } } });
    assert.equal(state().views.find((v) => v.id === other.id)!.graphics, undefined, 'another plan is not touched');
    assert.equal(checkbox(ui, 'Show Furniture').checked, false);
    assert.ok(ui.querySelector('[aria-label="Set on this drawing, not by its template"]'), 'the row says it is an override');
    click(buttonText(ui, 'Reset overrides (1)')!);
    assert.equal(state().views.find((v) => v.id === plan.id)!.graphics, undefined);
    assert.equal(checkbox(ui, 'Show Furniture').checked, true);
  });

  it('picks a template of its kind only, and None detaches keeping the look', () => {
    const [plan] = plans();
    const ui = mountCard(plan.id);
    const picker = ui.querySelector<HTMLSelectElement>('select')!;
    assert.deepEqual([...picker.options].map((o) => o.textContent), ['None (own graphics)', 'Plans']);
    click(buttonText(ui, 'Save as template…')!);
    typeInto(ui.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')!, 'Client plans');
    click(buttonText(ui, 'Save')!);
    const saved = state().viewTemplates!.find((t) => t.name === 'Client plans')!;
    assert.equal(state().views.find((v) => v.id === plan.id)!.templateId, saved.id);
    choose(ui.querySelector<HTMLSelectElement>('select')!, '');
    assert.equal(state().views.find((v) => v.id === plan.id)!.templateId, undefined);
  });

  it('Detach is one click and one undo step', () => {
    const [plan] = plans();
    const ui = mountCard(plan.id);
    clearDraftHistory();
    click(buttonText(ui, 'Detach')!);
    assert.equal(state().views.find((v) => v.id === plan.id)!.templateId, undefined);
    assert.equal(undoDrafts(), true);
    assert.equal(state().views.find((v) => v.id === plan.id)!.templateId, plan.templateId);
  });

  it('lists the drafting layers: this viewport hides one on its sheet, the drawing\'s own off-switch greys one out', () => {
    const [plan] = plans();
    const { sheet, slot } = slotOf(plan.id);
    useProjectStore.setState({ views: state().views.map((v) => (v.id === plan.id ? { ...v, hiddenLayers: ['0'] } : v)) });
    const ui = render(<Card viewId={plan.id} />);
    openSection(ui, 'Graphics');
    assert.equal(checkbox(ui, 'Show layer 0 in this viewport').disabled, true, 'the drawing hides it: not this viewport\'s to bring back');
    click(checkbox(ui, 'Show layer Dimensions in this viewport'));
    assert.deepEqual(state().sheets.find((s) => s.id === sheet.id)!.viewports!.find((v) => v.id === slot.id)!.hiddenLayers, ['L-dim']);
    assert.equal(checkbox(ui, 'Show layer Dimensions in this viewport').checked, false, 'the list shows it hidden here');
    assert.equal(state().views.find((v) => v.id === plan.id)!.hiddenLayers?.includes('L-dim'), false);
  });

  it('is in Romanian too', () => {
    act(() => setLocale('ro'));
    const [plan] = plans();
    const ui = render(<Card viewId={plan.id} />);
    assert.match(ui.textContent ?? '', /Grafică/);
    // The template's name is text the project stored when it was made; the words around it are Romanian.
    assert.match(ui.textContent ?? '', /Șablonul Plans/);
  });
});

describe('View templates in the project drawer', () => {
  it('turning furniture off in Plans removes it from every plan, and from nothing else', () => {
    const ui = render(<ViewTemplatesPanel />);
    ui.querySelector('details')!.open = true;
    const planTemplate = [...ui.querySelectorAll('li')].find((li) => (li.querySelector('input') as HTMLInputElement).value === 'Plans')!;
    click(checkbox(planTemplate, 'Show Furniture'));
    const { viewTemplates, views } = state();
    assert.equal(viewTemplates!.find((t) => t.name === 'Plans')!.graphics.categories?.furniture?.visible, false);
    assert.equal(views.every((v) => v.graphics === undefined), true, 'no drawing was written to');
    assert.match(planTemplate.textContent ?? '', /used by 2 drawings/);
  });

  it('renames a template and deletes one; its drawings keep their graphics', () => {
    const ui = render(<ViewTemplatesPanel />);
    const row = (name: string) => [...ui.querySelectorAll('li')].find((li) => (li.querySelector('input') as HTMLInputElement).value === name)!;
    click(checkbox(row('Plans'), 'Show Furniture'));
    const nameInput = row('Plans').querySelector<HTMLInputElement>('input[aria-label="Template name"]')!;
    typeInto(nameInput, 'House plans');
    blur(nameInput);
    assert.deepEqual(state().viewTemplates!.map((t) => t.name), ['House plans', 'Sections', 'Elevations']);
    click(ui.querySelector('button[aria-label^="Delete template House plans"]')!);
    assert.deepEqual(state().viewTemplates!.map((t) => t.name), ['Sections', 'Elevations']);
    for (const plan of plans()) {
      assert.equal(plan.templateId, undefined);
      assert.deepEqual(plan.graphics, { categories: { furniture: { visible: false } } });
    }
  });

  it('says so when there are none', () => {
    useProjectStore.setState({ viewTemplates: [] });
    assert.match(render(<ViewTemplatesPanel />).textContent ?? '', /No view templates yet/);
  });
});
