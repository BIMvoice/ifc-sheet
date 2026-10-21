/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { attachDraftingView, cancelCommand, clickDrawing, constrainFrom, pressEnter, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { defaultViews } from '@/project/view-defaults';
import type { ModelExtent } from '@/project/drawing-set';
import { SteppedSheet } from './SteppedSheet.js';

/**
 * #146: the Ortho lock has a button on the Wall (the drafting toolbar that
 * carries it is hidden there), it shows on the tool's card, and it holds what
 * is drawn on the sheet's paper and on a drawing brought forward.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const TOL = 0.05;

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ ortho: false, orthoHeld: false });
  existing = useProjectStore.getState().drafts.length;
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
});

const named = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
/** What the drawing set already holds before the test draws anything. */
let existing = 0;
const shapes = () => useProjectStore.getState().drafts.slice(existing).map((d) => d.shape);

function mount(focus: string | null = null): HTMLElement {
  const sheet = useProjectStore.getState().sheets[1];
  return render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} initialFocus={focus} onBack={() => {}} onStep={() => {}} />);
}

describe('the Ortho button on the Wall (#146)', () => {
  it('is on the rail, named, keyboard-reachable, and toggles the session lock the F8 key toggles', () => {
    const ui = mount();
    const button = named(ui, 'Ortho');
    assert.ok(button, 'the rail has an Ortho button');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.match(button.getAttribute('aria-label') ?? '', /Ortho/);
    assert.equal(button.getAttribute('aria-keyshortcuts'), 'F8');
    assert.match(button.getAttribute('title') ?? '', /F8/);
    click(button);
    assert.equal(useDraftingSession.getState().ortho, true);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    click(button);
    assert.equal(useDraftingSession.getState().ortho, false);
  });

  it('draws a horizontal line from a skewed click on the sheet\'s paper once it is on, and a skewed one before', () => {
    const ui = mount();
    act(() => click(named(ui, 'Line')!));
    assert.ok(runningCommand(), 'the line tool is running on the sheet');
    act(() => { clickDrawing({ x: 10, y: 10 }, TOL, false); clickDrawing({ x: 50, y: 14 }, TOL, false); pressEnter(); });
    assert.deepEqual(shapes()[0], { type: 'line', a: { x: 10, y: 10 }, b: { x: 50, y: 14 } }, 'off, the click is kept as it is');

    cleanup();
    cancelCommand();
    const again = mount();
    act(() => click(named(again, 'Ortho')!));
    act(() => click(named(again, 'Line')!));
    act(() => { clickDrawing({ x: 10, y: 20 }, TOL, false); clickDrawing({ x: 50, y: 24 }, TOL, false); pressEnter(); });
    assert.deepEqual(shapes()[1], { type: 'line', a: { x: 10, y: 20 }, b: { x: 50, y: 20 } });
  });

  it('keeps every segment of a polyline on the sheet horizontal or vertical', () => {
    const ui = mount();
    act(() => click(named(ui, 'Ortho')!));
    act(() => click(named(ui, 'Polyline')!));
    act(() => {
      for (const p of [{ x: 0, y: 0 }, { x: 40, y: 3 }, { x: 43, y: 30 }]) clickDrawing(p, TOL, false);
      pressEnter();
    });
    assert.deepEqual(shapes()[0], { type: 'polyline', pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }], closed: false });
  });

  it('keeps a dimension on a drawing brought forward horizontal, and its line perpendicular', () => {
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    const ui = mount(plan.id);
    act(() => click(named(ui, 'Ortho')!));
    act(() => { attachDraftingView(plan.id, 'down', () => []); startDraftCommand('dimaligned'); });
    act(() => { clickDrawing({ x: 0, y: 0 }, TOL, false); clickDrawing({ x: 10, y: 3 }, TOL, false); clickDrawing({ x: 11, y: 2 }, TOL, false); pressEnter(); });
    const dim = shapes().find((s) => s.type === 'dimension');
    assert.ok(dim && dim.type === 'dimension');
    assert.deepEqual([dim.a, dim.b], [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    assert.equal(dim.at.x, 10, 'the dimension line is placed straight off the second point');
  });

  it('says so on the tool\'s card while a tool is chosen and the lock is on', () => {
    const ui = mount();
    act(() => click(named(ui, 'Line')!));
    assert.equal(ui.textContent?.includes('Ortho is on'), false);
    act(() => click(named(ui, 'Ortho')!));
    assert.equal(ui.textContent?.includes('Ortho is on'), true);
  });

  it('says so on the card while Ctrl holds the lock, with the toggle off', () => {
    const ui = mount();
    act(() => click(named(ui, 'Line')!));
    assert.equal(ui.textContent?.includes('Ortho is on'), false);
    act(() => useDraftingSession.setState({ orthoHeld: true }));
    assert.equal(useDraftingSession.getState().ortho, false);
    assert.equal(ui.textContent?.includes('Ortho is on'), true);
  });
});

describe('the ortho lock for a grip drag (#146)', () => {
  it('constrains a dragged point to the horizontal or vertical through where it started, only while locked', () => {
    const from = { x: 5, y: 5 };
    assert.deepEqual(constrainFrom(from, { x: 9, y: 6 }), { x: 9, y: 6 });
    useDraftingSession.setState({ ortho: true });
    assert.deepEqual(constrainFrom(from, { x: 9, y: 6 }), { x: 9, y: 5 });
    assert.deepEqual(constrainFrom(from, { x: 6, y: 9 }), { x: 5, y: 9 });
    useDraftingSession.setState({ ortho: false, orthoHeld: true });
    assert.deepEqual(constrainFrom(from, { x: 9, y: 6 }), { x: 9, y: 5 });
  });
});
