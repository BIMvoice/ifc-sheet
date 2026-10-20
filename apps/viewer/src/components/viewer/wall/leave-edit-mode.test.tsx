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
import { paperOf } from '@/project/sheets';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectSheet } from '@/project/types';
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

/** A pointer event on the sheet canvas at the centre of the viewport that shows `viewId` (the canvas fits the whole sheet on arrival). */
function clickViewport(ui: HTMLElement, sheet: ProjectSheet, viewId: string, type: 'pointerdown' | 'pointerup' | 'dblclick'): void {
  const paper = paperOf(sheet);
  const vp = (sheet.viewports ?? []).find((v) => v.viewId === viewId)!;
  const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
  assert.ok(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const k = Math.min((width - 24) / paper.w, (height - 24) / paper.h);
  const at = { clientX: (width - paper.w * k) / 2 + vp.x * k, clientY: (height - paper.h * k) / 2 + vp.y * k };
  const event = type === 'dblclick' ? new window.MouseEvent('dblclick', { ...at, bubbles: true }) : new window.PointerEvent(type, { ...at, bubbles: true, button: 0, pointerId: 1 });
  act(() => { canvas.dispatchEvent(event); });
}

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

  it('puts focus on the sheet canvas when the button unmounts, not on <body>', () => {
    const ui = stepIn(true);
    const done = button(ui, 'Back to sheet');
    assert.ok(done);
    act(() => done.focus());
    assert.equal(document.activeElement, done, 'the button had focus');
    click(done);
    const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
    assert.ok(canvas, 'the sheet is back');
    assert.ok(document.activeElement === canvas, 'focus is on the sheet canvas');
    assert.ok(document.activeElement !== document.body);
  });

  it('closes the title block card with Esc and stays on the sheet', () => {
    const ui = stepIn(false);
    click(button(ui, 'Title block')!);
    assert.equal(button(ui, 'Title block')?.getAttribute('aria-pressed'), 'true');
    esc(1);
    assert.equal(button(ui, 'Title block')?.getAttribute('aria-pressed'), 'false', 'the card closed');
    assert.equal(backs, 0);
  });

  it('closes the Paper card with Esc and stays on the sheet (main\'s papering state)', () => {
    const ui = stepIn(false);
    click(button(ui, 'Paper')!);
    assert.equal(button(ui, 'Paper')?.getAttribute('aria-pressed'), 'true');
    assert.ok(ui.querySelector('aside[aria-label="Paper"]'), 'the Paper card is open');
    esc(1);
    assert.equal(button(ui, 'Paper')?.getAttribute('aria-pressed'), 'false', 'the card closed');
    assert.ok(!ui.querySelector('aside[aria-label="Paper"]'));
    assert.equal(backs, 0);
  });

  it('keeps the chosen drawing under Esc while one is in front: only the button lets go', () => {
    const ui = stepIn(false);
    // Choose the plan with a click on its viewport, bring it forward with a tool, as a user does.
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === plan.id))!;
    clickViewport(ui, sheet, plan.id, 'pointerdown');
    clickViewport(ui, sheet, plan.id, 'pointerup');
    click(button(ui, 'Dimension')!);
    assert.equal(onSheet(ui), false, 'the drawing is in front');
    esc(1); // ends the tool
    assert.equal(runningCommand(), null);
    esc(2);
    click(button(ui, 'Dimension')!);
    assert.ok(runningCommand(), 'the drawing is still chosen: the tool starts on it again');
  });

  it('forgets a tool picked before the button: nothing is pressed when the drawing comes forward again', () => {
    const ui = stepIn(true);
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === plan.id))!;
    // The pick finds the drawing not yet attached, so the tool is set and its command waits.
    act(() => useDraftingSession.setState({ viewId: null }));
    click(button(ui, 'Line')!);
    assert.equal(button(ui, 'Line')?.getAttribute('aria-pressed'), 'true', 'the tool is picked');
    assert.equal(runningCommand(), null, 'and its command is still waiting');
    click(button(ui, 'Back to sheet')!);
    assert.equal(onSheet(ui), true);
    clickViewport(ui, sheet, plan.id, 'dblclick');
    assert.equal(onSheet(ui), false, 'the drawing is in front again');
    assert.equal(runningCommand(), null, 'the waiting command did not start on the new visit');
    assert.deepEqual([...ui.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent?.trim()), [], 'no tool is held');
  });
});
