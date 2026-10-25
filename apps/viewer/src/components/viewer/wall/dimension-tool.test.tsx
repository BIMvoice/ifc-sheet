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
import { cancelCommand, clickDrawing, patchDraftSettings, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { paperOf } from '@/project/sheets';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { SteppedSheet } from './SteppedSheet.js';

/**
 * Issue #141: the Wall's dimension tool is continuous. After the first
 * dimension each click adds the next one in the chain, and Esc ends the chain
 * and the tool and does nothing else: the drawing stays forward.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const TOL = 0.05;
const dimensions = () => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'dimension' ? [d.shape] : []));

let backs = 0;

/** The sheet that holds the ground plan, stepped into, with the plan chosen by a click on its viewport (as a user does before picking a tool). */
function stepIn(): HTMLElement {
  const { sheets, views } = useProjectStore.getState();
  const plan = views.find((v) => v.kind === 'plan');
  assert.ok(plan);
  const sheet = sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === plan.id));
  assert.ok(sheet);
  const ui = render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} onBack={() => { backs += 1; }} onStep={() => {}} />);
  // The canvas fits the whole sheet on arrival (SheetCanvas): the same arithmetic gives the viewport's centre on screen.
  const paper = paperOf(sheet);
  const vp = (sheet.viewports ?? []).find((v) => v.viewId === plan.id)!;
  const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
  assert.ok(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const k = Math.min((width - 24) / paper.w, (height - 24) / paper.h);
  const at = { clientX: (width - paper.w * k) / 2 + vp.x * k, clientY: (height - paper.h * k) / 2 + vp.y * k };
  for (const type of ['pointerdown', 'pointerup']) act(() => { canvas.dispatchEvent(new window.PointerEvent(type, { ...at, bubbles: true, button: 0, pointerId: 1 })); });
  return ui;
}

/** Pick the Dimension tool on the rail, as a user does. */
function pickDimension(ui: HTMLElement): void {
  const button = [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Dimension');
  assert.ok(button, 'the rail offers the Dimension tool');
  click(button);
}

beforeEach(() => {
  resetProject();
  backs = 0;
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ selection: new Set() });
  patchDraftSettings({ dimContinuous: true });
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
});

describe('the Wall\'s dimension tool (#141)', () => {
  it('chains: three points and a line make one dimension, each further point the next, on the same line', () => {
    const ui = stepIn();
    pickDimension(ui);
    assert.ok(runningCommand(), 'the tool is running on the drawing in front');
    act(() => {
      clickDrawing({ x: 0, y: 0 }, TOL, false);
      clickDrawing({ x: 4, y: 0 }, TOL, false);
      clickDrawing({ x: 2, y: -1 }, TOL, false);
      clickDrawing({ x: 7, y: 0 }, TOL, false);
      clickDrawing({ x: 9, y: 0 }, TOL, false);
    });
    const chain = dimensions();
    assert.equal(chain.length, 3);
    assert.deepEqual(chain.map((d) => [d.a.x, d.b.x]), [[0, 4], [4, 7], [7, 9]]);
    assert.ok(chain.every((d) => d.at.y === chain[0].at.y), 'one dimension line');
    assert.ok(runningCommand(), 'still running: the chain waits for the next point');
    assert.match(ui.textContent ?? '', /Esc to stop/);
  });

  it('ends on one Esc, and only the tool: the drawing stays forward and the sheet is not left', () => {
    const ui = stepIn();
    pickDimension(ui);
    assert.ok(!ui.querySelector('[data-sheet-canvas]'), 'the tool brought the drawing forward');
    act(() => {
      clickDrawing({ x: 0, y: 0 }, TOL, false);
      clickDrawing({ x: 4, y: 0 }, TOL, false);
      clickDrawing({ x: 2, y: -1 }, TOL, false);
    });
    assert.ok(runningCommand());
    press(document.body, 'Escape');
    assert.equal(runningCommand(), null, 'the tool ended');
    assert.equal(backs, 0, 'the sheet was not left');
    assert.ok(!ui.querySelector('[data-sheet-canvas]'), 'the drawing is still in front: the sheet canvas has not come back');
  });

  it('chains even after a SINGLE typed earlier in the session: the Wall turns it on', () => {
    patchDraftSettings({ dimContinuous: false });
    const ui = stepIn();
    pickDimension(ui);
    act(() => {
      clickDrawing({ x: 0, y: 0 }, TOL, false);
      clickDrawing({ x: 4, y: 0 }, TOL, false);
      clickDrawing({ x: 2, y: -1 }, TOL, false);
      clickDrawing({ x: 7, y: 0 }, TOL, false);
    });
    assert.equal(dimensions().length, 2);
    assert.ok(runningCommand());
  });

  it('stays active after Enter ends a chain, so a new chain starts without picking it again; Esc then ends it', () => {
    const ui = stepIn();
    pickDimension(ui);
    act(() => {
      clickDrawing({ x: 0, y: 0 }, TOL, false);
      clickDrawing({ x: 4, y: 0 }, TOL, false);
      clickDrawing({ x: 2, y: -1 }, TOL, false);
    });
    press(document.body, 'Enter');
    assert.ok(runningCommand(), 'a fresh dimension command is waiting for its first point');
    const pressed = [...ui.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent?.trim());
    assert.ok(pressed.includes('Dimension'), 'the rail still holds the tool');
    act(() => {
      clickDrawing({ x: 0, y: 5 }, TOL, false);
      clickDrawing({ x: 3, y: 5 }, TOL, false);
      clickDrawing({ x: 1, y: 6 }, TOL, false);
    });
    assert.equal(dimensions().length, 2, 'the second chain placed its own dimension');
    press(document.body, 'Escape');
    assert.equal(runningCommand(), null);
    assert.ok(![...ui.querySelectorAll('button[aria-pressed="true"]')].some((b) => b.textContent?.trim() === 'Dimension'), 'Esc let go of the tool');
    assert.equal(backs, 0);
  });

  it('ends the chain and lets go of the tool from the card\'s Done button, with no Esc (#166)', () => {
    const ui = stepIn();
    pickDimension(ui);
    act(() => {
      clickDrawing({ x: 0, y: 0 }, TOL, false);
      clickDrawing({ x: 4, y: 0 }, TOL, false);
      clickDrawing({ x: 2, y: -1 }, TOL, false);
    });
    const done = [...ui.querySelectorAll('aside button')].find((b) => b.textContent?.trim() === 'Done');
    assert.ok(done, 'the tool\'s card offers Done');
    act(() => click(done));
    assert.equal(runningCommand(), null, 'the chain is over and no new one started');
    assert.equal(dimensions().length, 1, 'what was placed stays');
    assert.ok(![...ui.querySelectorAll('button[aria-pressed="true"]')].some((b) => b.textContent?.trim() === 'Dimension'), 'the rail let go of the tool');
    assert.equal(backs, 0);
  });

  it('lets go of the tool when another command ends: only a finished dimension chain restarts', () => {
    const ui = stepIn();
    pickDimension(ui);
    act(() => { assert.ok(startDraftCommand('line'), 'a different command takes over from the dimension'); });
    act(() => cancelCommand());
    assert.equal(runningCommand(), null, 'the dimension did not restart after a line ended');
    assert.ok(![...ui.querySelectorAll('button[aria-pressed="true"]')].some((b) => b.textContent?.trim() === 'Dimension'), 'the rail let go of the tool');
  });

  it('takes Esc before the drafting keys even when the drawing arrives with the sheet: one Esc ends only the tool', () => {
    // The drawing's key listener mounts in the same commit as the sheet's. A child's passive effect runs before its parent's, so
    // only a layout effect keeps the sheet's listener first: it must see the tool still running.
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan');
    const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === plan?.id));
    assert.ok(plan && sheet);
    const ui = render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} initialFocus={plan.id} onBack={() => { backs += 1; }} onStep={() => {}} />);
    act(() => { assert.ok(startDraftCommand('dimaligned'), 'the dimension tool starts on the drawing in front'); });
    assert.ok(runningCommand());
    press(document.body, 'Escape');
    assert.equal(runningCommand(), null, 'the tool ended');
    assert.equal(backs, 0, 'the sheet was not left');
    assert.ok(!ui.querySelector('[data-sheet-canvas]'), 'the drawing is still in front');
  });

  it('closes the Paper card on Esc, and does not leave the sheet (main\'s papering state in the Esc chain)', () => {
    const ui = stepIn();
    // Choosing the drawing in stepIn brings its card; the sheet-level Paper button sits with the sheet's controls.
    const paper = [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Paper');
    assert.ok(paper, 'the sheet offers the Paper button');
    click(paper);
    assert.ok(ui.querySelector('aside[aria-label="Paper"]'), 'the Paper card is open');
    press(document.body, 'Escape');
    assert.ok(!ui.querySelector('aside[aria-label="Paper"]'), 'Esc closed the Paper card');
    assert.equal(backs, 0, 'and only that');
  });
});
