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
import { attachDraftingView, cancelCommand, clickDrawing, endCommand, pressEnter, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { defaultViews } from '@/project/view-defaults';
import type { ModelExtent } from '@/project/drawing-set';
import { SteppedSheet } from './SteppedSheet.js';
import { ViewportCard } from './ViewportCard.js';

/**
 * #166: Esc is never the only way out. Each mode that used to end only on Esc
 * has a visible control that ends it: a tool's card and its rail button, the
 * command line while a command runs, a chosen drawing's card.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ ortho: false, orthoHeld: false });
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
});

const named = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const doneButtons = (ui: HTMLElement) => [...ui.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Done');
/** The Done on the tool's own card (the aside), not the command line's. */
const cardDone = (ui: HTMLElement) => [...ui.querySelectorAll('aside button')].find((b) => b.textContent?.trim() === 'Done')!;

function mount(focus: string | null = null): HTMLElement {
  const sheet = useProjectStore.getState().sheets[1];
  return render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} initialFocus={focus} onBack={() => {}} onStep={() => {}} />);
}

describe('a drawing tool without Esc', () => {
  it('the tool card has a Done button that ends the running tool and lets the rail go', () => {
    const ui = mount();
    act(() => click(named(ui, 'Polyline')!));
    assert.ok(runningCommand());
    assert.equal(named(ui, 'Polyline')!.getAttribute('aria-pressed'), 'true');
    act(() => click(cardDone(ui)));
    assert.equal(runningCommand(), null);
    assert.equal(named(ui, 'Polyline')!.getAttribute('aria-pressed'), 'false');
  });

  it('keeps what a polyline has drawn when Done ends it, as Enter does', () => {
    const ui = mount();
    const before = useProjectStore.getState().drafts.length;
    act(() => click(named(ui, 'Polyline')!));
    act(() => { for (const p of [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }]) clickDrawing(p, 0.05, false); });
    act(() => click(cardDone(ui)));
    assert.equal(runningCommand(), null);
    assert.equal(useProjectStore.getState().drafts.length, before + 1);
  });

  it('pressing the lit tool\'s own button again ends it (the button says it is pressed)', () => {
    const ui = mount();
    act(() => click(named(ui, 'Line')!));
    act(() => click(named(ui, 'Line')!));
    assert.equal(runningCommand(), null);
    assert.equal(named(ui, 'Line')!.getAttribute('aria-pressed'), 'false');
  });
});

describe('a command without Esc or Enter', () => {
  it('shows Done on the command line only while a command runs, and ends it', () => {
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    const ui = mount(plan.id);
    act(() => { attachDraftingView(plan.id, 'down', () => []); });
    assert.equal(doneButtons(ui).length, 0, 'idle: no Done');
    act(() => { startDraftCommand('line'); });
    assert.equal(doneButtons(ui).length, 1);
    act(() => click(doneButtons(ui)[0]));
    assert.equal(runningCommand(), null);
    assert.equal(doneButtons(ui).length, 0);
  });

  it('does nothing on an idle line (Enter there would repeat the last command)', () => {
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    mount(plan.id);
    act(() => { attachDraftingView(plan.id, 'down', () => []); startDraftCommand('line'); cancelCommand(); });
    act(() => endCommand());
    assert.equal(runningCommand(), null);
    act(() => pressEnter());
    assert.ok(runningCommand(), 'Enter repeats the last command, so endCommand must not have');
  });
});

describe('a chosen drawing without Esc', () => {
  it('has a Done button on its card that lets the drawing go', () => {
    const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).length > 0)!;
    const slot = sheet.viewports![0];
    const chosen: Array<string | null> = [];
    const ui = render(<ViewportCard sheet={sheet} slot={slot} onOpen={() => {}} onChoose={(id) => chosen.push(id)} />);
    act(() => click(named(ui, 'Done')!));
    assert.deepEqual(chosen, [null]);
  });
});
