/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Note tool's in-place box (#168, found in the app walk of 2026-11-08): it sits where the words print, on the side of the
 * leader's end they print on, and no key typed between the click that opens it and its focus is lost. Empty words are no note.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advance, cleanup, press, render, type as typeInto } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store';
import { cancelCommand, clickDrawing, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import type { ProjectView } from '@/project/types';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const click = (x: number, y: number) => act(() => clickDrawing({ x, y }, 0.05, false));
const drafts = () => useProjectStore.getState().drafts;
const editorIn = (ui: HTMLElement) => ui.querySelector<HTMLTextAreaElement>('textarea[aria-label="New text"]');
const px = (v: string) => parseFloat(v);

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
  localStorage.clear();
});

/** The printed label of the one leader on the sheet: where its text starts (screen), which way it runs, and where the leader ends. */
function printed(ui: HTMLElement) {
  const text = [...ui.querySelectorAll('svg text')].find((t) => t.textContent === 'Steel');
  assert.ok(text, 'the note is printed');
  // The leader's own group: its line is the first path beside the label.
  const d = text.parentElement?.parentElement?.querySelector('path')?.getAttribute('d');
  assert.ok(d, 'the leader line is drawn');
  const end = d.split('L').at(-1)!.split(' ').map(Number);
  return { x: Number(text.getAttribute('x')), anchor: text.getAttribute('text-anchor'), endX: end[0], endY: end[1] };
}

describe('Note: the box sits where the words print', () => {
  for (const [name, tip, end, side] of [['to the right of', [0, 0], [3, 1], 'start'], ['to the left of', [3, 0], [0, 1], 'end']] as const) {
    it(`a leader running ${side === 'start' ? 'rightward' : 'leftward'}: the box is ${name} its end, as the printed words are`, async () => {
      const ui = render(<DraftingView view={plan} />);
      act(() => { startDraftCommand('leader'); });
      click(tip[0], tip[1]);
      click(end[0], end[1]);
      click(end[0], end[1]);
      await advance(0);
      const box = editorIn(ui);
      assert.ok(box, 'the box is open');
      const at = { left: px(box.style.left), top: px(box.style.top) };
      typeInto(box, 'Steel');
      press(box, 'Enter');
      const done = printed(ui);
      assert.equal(done.anchor, side, 'the words run away from the end');
      assert.equal(at.left, done.x, 'the box starts (or ends) where the words start (or end)');
      assert.equal(at.top, done.endY, 'the box is centred on the line of the words');
      assert.ok(box.className.includes(side === 'start' ? '-translate-y-1/2' : '-translate-x-full'), 'its edge is the one on the end');
    });
  }
});

describe('Note: no key is lost before the box has the focus', () => {
  it('keys typed right after the second click, before the box is focused, are in the box and in the note', async () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(2, 1);
    const box = editorIn(ui);
    assert.ok(box, 'the box is open');
    assert.notEqual(document.activeElement, box, 'not yet focused: the press is still going on');
    for (const k of ['S', 't', 'e', 'e', 'l', 'x']) press(document.body, k);
    press(document.body, 'Backspace');
    await advance(0);
    assert.equal(document.activeElement, box);
    assert.equal(box.value, 'Steel');
    press(box, 'Enter');
    const shape = drafts()[0]?.shape;
    assert.equal(shape?.type === 'leader' ? shape.text : null, 'Steel');
  });

  it('Esc before the focus cancels the note', () => {
    render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(2, 1);
    press(document.body, 'Escape');
    assert.equal(drafts().length, 0);
    assert.equal(runningCommand(), null);
  });
});

describe('Note: empty words are no note', () => {
  it('Enter on an empty box, early or late, draws nothing and keeps the box; Esc then cancels', async () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(2, 1);
    press(document.body, 'Enter');
    await advance(0);
    press(editorIn(ui)!, 'Enter');
    assert.equal(drafts().length, 0, 'no leader without words');
    assert.ok(editorIn(ui), 'the box waits for them');
    assert.ok(runningCommand());
    press(editorIn(ui)!, 'Escape');
    assert.equal(drafts().length, 0);
    assert.equal(runningCommand(), null);
  });
});
