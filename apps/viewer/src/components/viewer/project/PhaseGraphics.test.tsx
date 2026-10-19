/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The phases section of a view's graphics: what a person does with it reaches the view and the project. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { click, cleanup, render, type } from '@/test/render.js';
import { addProjectView, projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';
import { PhaseGraphics } from './PhaseGraphics.js';

let viewId = '';
const view = () => useProjectStore.getState().views.find((v) => v.id === viewId)!;
const control = (ui: HTMLElement, label: string) => ui.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
const mount = () => render(<PhaseGraphics view={view()} />);

beforeEach(() => {
  resetProject();
  viewId = addProjectView({ kind: 'plan', name: 'Demolition plan', level: { name: 'EG', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 });
});
afterEach(() => cleanup());

describe('PhaseGraphics', () => {
  it('draws by phase only once asked, then starts from a demolition plan', () => {
    assert.equal(view().graphics?.phases, undefined);
    click(control(mount(), 'Draw by phase'));
    assert.deepEqual(view().graphics?.phases?.show, ['existing', 'demolish', 'new', 'temporary']);
    cleanup();
    const ui = mount();
    const preset = control(ui, 'Start from') as unknown as HTMLSelectElement;
    preset.value = 'demolition';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(view().graphics?.phases?.show, ['existing', 'demolish']);
  });

  it('shows or hides one phase, and keeps a style change of the view over the default look', () => {
    click(control(mount(), 'Draw by phase'));
    cleanup();
    click(control(mount(), 'Proposed · Show'));
    assert.deepEqual(view().graphics?.phases?.show, ['existing', 'demolish', 'temporary']);
    cleanup();
    click(control(mount(), 'To demolish · Dashed'));
    assert.deepEqual(view().graphics?.phases?.styles, { demolish: { dashed: false } });
  });

  it('maps a property of the project to the phases, kept in the project document', () => {
    const ui = mount();
    type(control(ui, 'Property set'), 'Faza');
    cleanup();
    const again = mount();
    type(control(again, 'Property'), 'Stare');
    cleanup();
    type(control(mount(), 'Value for To demolish'), 'De desfiintat');
    assert.deepEqual(projectDocument().phaseSource, { mapping: { set: 'Faza', property: 'Stare', values: { 'De desfiintat': 'demolish' } } });
  });
});
