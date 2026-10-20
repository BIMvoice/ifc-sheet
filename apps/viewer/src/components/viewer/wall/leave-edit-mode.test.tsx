/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { cancelCommand, clickDrawing, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { SteppedSheet } from './SteppedSheet.js';

/**
 * Issue #142: a drawing brought forward (edit mode) is left with a visible
 * button, never by Esc. Esc keeps its local meanings (the running tool, the
 * selection, the chooser) and neither leaves the drawing nor the sheet.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
let backs = 0;

/** The sheet holding the ground plan, stepped into, with the plan in front when `forward`. */
function stepIn(forward: boolean): HTMLElement {
  const { sheets, views } = useProjectStore.getState();
  const plan = views.find((v) => v.kind === 'plan');
  assert.ok(plan);
  const sheet = sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === plan.id));
  assert.ok(sheet);
  return render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} initialFocus={forward ? plan.id : null} onBack={() => { backs += 1; }} onStep={() => {}} />);
}
const button = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
/** Whether the sheet's canvas is showing, i.e. no drawing is in front. */
const onSheet = (ui: HTMLElement): boolean => ui.querySelector('[data-sheet-canvas]') !== null;
const esc = (times: number) => { for (let i = 0; i < times; i += 1) press(document.body, 'Escape'); };

beforeEach(() => {
  resetProject();
  backs = 0;
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ selection: new Set() });
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
});

describe('leaving edit mode (#142)', () => {
  it('keeps the drawing in front through five Esc presses, and the sheet is not left', () => {
    const ui = stepIn(true);
    assert.equal(onSheet(ui), false, 'a drawing is in front');
    esc(5);
    assert.equal(onSheet(ui), false, 'still in front');
    assert.equal(backs, 0, 'the sheet was not left');
  });

  it('leaves edit mode with the button in the header, and the sheet is back', () => {
    const ui = stepIn(true);
    const done = button(ui, 'Back to sheet');
    assert.ok(done, 'the header offers the button');
    click(done);
    assert.equal(onSheet(ui), true);
    assert.equal(button(ui, 'Back to sheet'), undefined, 'the button is for edit mode only');
    assert.equal(backs, 0, 'the sheet itself was not left');
  });

  it('shows the button in place of the Esc hint', () => {
    const ui = stepIn(true);
    assert.equal([...ui.querySelectorAll('kbd')].some((k) => k.textContent === 'Esc'), false);
  });

  it('cancels a running tool with Esc, and only that', () => {
    const ui = stepIn(true);
    act(() => { startDraftCommand('line'); });
    assert.ok(runningCommand());
    esc(1);
    assert.equal(runningCommand(), null, 'the tool ended');
    assert.equal(onSheet(ui), false, 'the drawing is still in front');
    assert.equal(backs, 0);
  });

  it('never leaves the sheet by Esc, drawing in front or not; the Back link does', () => {
    const ui = stepIn(false);
    esc(5);
    assert.equal(backs, 0, 'Esc does not go back to the Wall');
    const back = button(ui, 'Wall');
    assert.ok(back);
    click(back);
    assert.equal(backs, 1);
  });

  it('closes the add-a-drawing chooser with Esc and stays on the sheet', () => {
    const ui = stepIn(false);
    click(button(ui, 'Add a drawing')!);
    assert.equal(button(ui, 'Add a drawing')?.getAttribute('aria-pressed'), 'true');
    esc(1);
    assert.equal(button(ui, 'Add a drawing')?.getAttribute('aria-pressed'), 'false');
    assert.equal(backs, 0);
  });

  it('lets a tool go before it touches the chooser: one Esc, one thing', () => {
    const ui = stepIn(true);
    click(button(ui, 'Add a drawing')!);
    act(() => { startDraftCommand('line'); clickDrawing({ x: 0, y: 0 }, 0.05, false); });
    assert.ok(runningCommand());
    esc(1);
    assert.equal(runningCommand(), null);
    assert.equal(button(ui, 'Add a drawing')?.getAttribute('aria-pressed'), 'true', 'the chooser is still open');
    esc(1);
    assert.equal(button(ui, 'Add a drawing')?.getAttribute('aria-pressed'), 'false');
  });

  it('takes a running tool with it when the button is pressed', () => {
    const ui = stepIn(true);
    act(() => { startDraftCommand('line'); clickDrawing({ x: 0, y: 0 }, 0.05, false); });
    assert.ok(runningCommand());
    click(button(ui, 'Back to sheet')!);
    assert.equal(runningCommand(), null, 'no half-drawn line is left running behind the sheet');
    assert.equal(onSheet(ui), true);
  });
});
