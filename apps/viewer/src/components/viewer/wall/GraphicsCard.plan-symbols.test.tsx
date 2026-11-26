/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Use plan symbols from the model" (#831, #903) in the Graphics section of a plan's card on its sheet: the place a user sets how a
 * drawing is drawn. It was only in the Model workspace's Visibility / Graphics dialog, which a user of the sheets never opens.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { resetSectionChoices } from './card-section-state';
import { GraphicsCard } from './GraphicsCard';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const state = () => useProjectStore.getState();

beforeEach(() => {
  resetProject();
  resetSectionChoices();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }]);
  startDrawingSet(null, bounds);
  clearDraftHistory();
});
afterEach(() => cleanup());

function Card({ viewId }: { viewId: string }) {
  const view = useProjectStore((s) => s.views.find((v) => v.id === viewId))!;
  const sheet = useProjectStore((s) => s.sheets.find((x) => x.viewports?.some((vp) => vp.viewId === viewId)))!;
  return <GraphicsCard sheet={sheet} slot={sheet.viewports!.find((vp) => vp.viewId === viewId)!} view={view} />;
}
const planSymbolsBox = (ui: ParentNode) =>
  [...ui.querySelectorAll('label')].find((l) => l.textContent === 'Use plan symbols from the model')?.querySelector<HTMLInputElement>('input[type="checkbox"]');

describe('Use plan symbols from the model, in a drawing\'s Graphics section', () => {
  it('a plan\'s card turns it off and on again, written to the view as the dialog writes it', () => {
    const plan = state().views.find((v) => v.kind === 'plan')!;
    const ui = render(<Card viewId={plan.id} />);
    openSection(ui, 'Graphics');
    const box = planSymbolsBox(ui);
    assert.ok(box, 'the plan\'s Graphics section has the setting');
    assert.equal(box.checked, true, 'on by default');
    click(box);
    assert.equal(state().views.find((v) => v.id === plan.id)!.graphics?.usePlanSymbols, false);
    assert.equal(planSymbolsBox(ui)!.checked, false);
    click(planSymbolsBox(ui)!);
    assert.equal(state().views.find((v) => v.id === plan.id)!.graphics?.usePlanSymbols, undefined);
  });

  it('is not offered on an elevation, which draws no plan symbols', () => {
    const elevation = state().views.find((v) => v.kind === 'elevation' && state().sheets.some((s) => s.viewports?.some((vp) => vp.viewId === v.id)));
    assert.ok(elevation, 'the drawing set places an elevation on a sheet');
    const ui = render(<Card viewId={elevation.id} />);
    openSection(ui, 'Graphics');
    assert.equal(planSymbolsBox(ui), undefined);
  });
});
