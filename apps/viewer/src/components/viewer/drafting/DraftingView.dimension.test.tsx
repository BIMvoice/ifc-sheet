/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #494 in the real drafting view: the dimension-alignment toggle is a toolbar
 * button over the same setting as ALIGN, and Delete on a picked witness point
 * removes that point from its chain (one undo step) while Delete on a whole
 * dimension still erases it.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { dimensionLayout } from '@/drafting/annotation';
import { chainOf, chainPoints } from '@/drafting/dimension-chain-edit';
import { baseDraftSettings, cancelCommand, clickDrawing, patchDraftSettings, pressEnter, runningCommand, startDraftCommand, submitCommandLine, useDraftingSession } from '@/drafting/session';
import type { ProjectView } from '@/project/types';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const click = (x: number, y: number) => clickDrawing({ x, y }, 0.05, false);
const drafts = () => useProjectStore.getState().drafts;
const xs = () => chainPoints(chainOf(drafts(), drafts()[0].id)).map((p) => p.x);
const lineY = () => {
  const last = drafts().at(-1)?.shape;
  return last?.type === 'dimension' ? dimensionLayout(last).lines[2].a.y : NaN;
};
const alignButton = (ui: HTMLElement) => [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Align dimensions') as HTMLButtonElement;

/** A chain 0-4-9-12 on a line at y = 1. */
function seedChain(): void {
  startDraftCommand('dimaligned');
  click(0, 0); click(4, 0); click(2, 1); click(9, 0); click(12, 0);
  pressEnter();
}

beforeEach(() => {
  cancelCommand();
  patchDraftSettings({ dimAlign: true, dimContinuous: true });
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
});

describe('the dimension alignment toolbar toggle', () => {
  it('reflects the setting and flips it, and a new dimension line then snaps or not', () => {
    const ui = render(<DraftingView view={plan} />);
    const button = alignButton(ui);
    assert.ok(button, 'the toolbar has the button');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    act(() => button.click());
    assert.equal(baseDraftSettings().dimAlign, false);
    assert.equal(alignButton(ui).getAttribute('aria-pressed'), 'false');

    seedChain();
    startDraftCommand('dimaligned');
    click(14, 0); click(17, 0); click(15.5, 1.1);
    assert.ok(Math.abs(lineY() - 1.1) < 1e-9, 'off: the line stays where it was put');
    assert.ok(undoDrafts());
    act(() => alignButton(ui).click());
    assert.equal(baseDraftSettings().dimAlign, true);
    startDraftCommand('dimaligned');
    click(14, 0); click(17, 0); click(15.5, 1.1);
    assert.ok(Math.abs(lineY() - 1) < 1e-9, 'on: the line snaps onto the existing one');
  });

  // Review of #531: the ALIGN keyword wrote the setting without the toolbar following it.
  it('follows the ALIGN keyword typed into a dimension command, both ways', () => {
    const ui = render(<DraftingView view={plan} />);
    assert.equal(alignButton(ui).getAttribute('aria-pressed'), 'true');
    act(() => { startDraftCommand('dimaligned'); });
    act(() => submitCommandLine('ALIGN', null));
    assert.equal(baseDraftSettings().dimAlign, false);
    assert.equal(alignButton(ui).getAttribute('aria-pressed'), 'false', 'the button shows off after ALIGN');
    act(() => submitCommandLine('ALIGN', null));
    assert.equal(baseDraftSettings().dimAlign, true);
    assert.equal(alignButton(ui).getAttribute('aria-pressed'), 'true', 'and on again');
  });

  // The typed line refreshes the session after the keyword; the setting itself must also tell the toolbar, whoever writes it.
  it('follows a command writing the ALIGN setting without a typed line after it', () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('dimaligned'); });
    assert.equal(alignButton(ui).getAttribute('aria-pressed'), 'true');
    act(() => { runningCommand()?.onKeyword?.('ALIGN'); });
    assert.equal(baseDraftSettings().dimAlign, false);
    assert.equal(alignButton(ui).getAttribute('aria-pressed'), 'false');
  });

  it('is a labelled button that changes the setting when pressed', () => {
    const ui = render(<DraftingView view={plan} />);
    const button = alignButton(ui);
    assert.ok(button, 'found by its accessible name');
    assert.equal(button.getAttribute('aria-label') ?? button.textContent, 'Align dimensions');
    const before = baseDraftSettings().dimAlign;
    act(() => button.click());
    assert.equal(baseDraftSettings().dimAlign, !before, 'pressing it changes dimAlign');
    assert.equal(alignButton(ui).getAttribute('aria-pressed'), String(!before));
  });
});

describe('Delete on a dimension chain', () => {
  it('removes a picked witness point, as one undo step', () => {
    render(<DraftingView view={plan} />);
    seedChain();
    const before = drafts();
    click(4, 0.5);
    press(document.body, 'Delete');
    assert.deepEqual(xs(), [0, 9, 12]);
    assert.ok(undoDrafts());
    assert.deepEqual(xs(), [0, 4, 9, 12]);
    assert.equal(drafts().length, before.length);
  });

  it('still deletes a whole dimension picked away from its points', () => {
    render(<DraftingView view={plan} />);
    seedChain();
    const count = drafts().length;
    click(2, 1);
    press(document.body, 'Delete');
    assert.equal(drafts().length, count - 1);
    assert.deepEqual(xs(), [4, 9, 12]);
  });
});
