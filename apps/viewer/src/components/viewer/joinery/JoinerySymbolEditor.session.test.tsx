/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #448: the plan symbol editor is a guest on the app's one drafting session. Whatever the user had open under it, two undo steps, a
 * selection and a running `line`, is exactly as it was after Save, Cancel or Reset, and what is drawn in the editor never enters the
 * user's undo history; an error thrown inside the editor gives the session back too.
 */

import '@/test/setup-dom.js';
import { Component, useState, type ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { defaultDoorSpec, type JoinerySpec } from '@ifc-lite/create';
import { typeEntryId } from '@bimvoice/ifcsheet/project';
import { editDrafts, newDraft, undoDrafts } from '@/drafting/draft-store';
import { attachDraftingView, clickDrawing, runningCommand, setDraftSelection, startDraftCommand, useDraftingSession, cancelCommand } from '@/drafting/session';
import { useProjectStore } from '@/project/project-store';
import { joinerySymbolViewId } from '@/joinery/view-draft-id';
import { JoinerySymbolEditor } from './JoinerySymbolEditor';

const entryId = typeEntryId('type-guid');
const spec: JoinerySpec = { ...defaultDoorSpec(), id: entryId, mark: 'D1', width: 0.9 };
const VIEW = joinerySymbolViewId(entryId);
const MAIN = 'plan-1';
const stroke = (x: number) => ({ type: 'line' as const, a: { x, y: 0 }, b: { x, y: 1 } });
const mine = () => useProjectStore.getState().drafts.filter((d) => d.viewId === MAIN);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });

/** The user's drawing: two undo steps, one entity selected, `line` running with its first point clicked. */
function userDrawing() {
  attachDraftingView(MAIN, 'down', () => [], 1);
  editDrafts({ add: [newDraft(MAIN, '0', stroke(0))] });
  editDrafts({ add: [newDraft(MAIN, '0', stroke(1))] });
  setDraftSelection(new Set([mine()[0].id]));
  assert.equal(startDraftCommand('line'), true);
  clickDrawing({ x: 5, y: 5 }, 0.01, false);
  return { selection: useDraftingSession.getState().selection, command: runningCommand()!, history: useDraftingSession.getState().history };
}

/** Opens the editor, draws a symbol line in it with the drafting tools, and returns once the drawing is on the symbol's view. */
async function openAndDraw(handlers: { onSave?: (b: unknown) => void }, close: () => void) {
  render(<JoinerySymbolEditor spec={spec} block={null} onSave={handlers.onSave ?? (() => {})} onClose={close} />);
  await settle();
  assert.equal(useDraftingSession.getState().viewId, VIEW, 'the editor took the session');
  assert.equal(startDraftCommand('line'), true);
  clickDrawing({ x: -0.4, y: 0 }, 0.01, false);
  clickDrawing({ x: 0.4, y: 0 }, 0.01, false);
  cancelCommand();
  assert.equal(useProjectStore.getState().drafts.filter((d) => d.viewId === VIEW).length, 1, 'drew in the editor');
}

function assertUntouched(before: ReturnType<typeof userDrawing>) {
  const s = useDraftingSession.getState();
  assert.equal(s.viewId, MAIN);
  assert.deepEqual([...s.selection], [...before.selection], 'selection');
  assert.equal(s.commandId, 'line', 'the command is still active');
  assert.equal(runningCommand(), before.command, 'the very same command, with its state');
  assert.deepEqual(s.history, before.history, 'history lines');
  assert.equal(useProjectStore.getState().drafts.some((d) => d.viewId === VIEW), false, 'no symbol entity is left');
  assert.equal(mine().length, 2);
  assert.equal(undoDrafts(), true, 'undo reverts the user\'s step');
  assert.equal(mine().length, 1);
  assert.equal(undoDrafts(), true, 'and the one before it');
  assert.equal(mine().length, 0);
  assert.equal(undoDrafts(), false, 'the symbol\'s strokes were never steps of the user\'s history');
}

beforeEach(() => {
  useProjectStore.setState({
    drafts: [], dirty: false,
    draftLayers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }],
  });
  undoDrafts(); undoDrafts(); undoDrafts();
});
afterEach(() => {
  cleanup();
  cancelCommand();
  attachDraftingView(null, 'down', () => []);
});

describe('the plan symbol editor over a drafting session in use', () => {
  for (const [name, button] of [['Save', 'save'], ['Cancel', 'cancel'], ['Reset', 'reset']] as const) {
    it(`${name}: the undo history, the selection and the running command are as they were`, async () => {
      const before = userDrawing();
      await openAndDraw({}, () => cleanup());
      click(document.querySelector(`[data-symbol-${button}]`)!);
      await settle();
      assertUntouched(before);
    });
  }

  it('an error thrown by the save handler still closes the editor and gives the session back', async () => {
    const before = userDrawing();
    let closed = 0;
    await openAndDraw({ onSave: () => { throw new Error('boom'); } }, () => { closed++; cleanup(); });
    const caught: unknown[] = [];
    const onError = (e: ErrorEvent) => { caught.push(e.error); e.preventDefault(); };
    window.addEventListener('error', onError);
    try { click(document.querySelector('[data-symbol-save]')!); } catch (e) { caught.push(e); }
    window.removeEventListener('error', onError);
    await settle();
    assert.equal(closed, 1);
    assert.ok(caught.some((e) => (e as Error)?.message === 'boom'), 'the error was thrown');
    assertUntouched(before);
  });

  it('an error that unmounts the editor gives the session back', async () => {
    const before = userDrawing();
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch() {}
      render() { return this.state.failed ? null : this.props.children; }
    }
    let blow: () => void = () => {};
    const Bomb = () => {
      const [on, setOn] = useState(false);
      blow = () => setOn(true);
      if (on) throw new Error('render boom');
      return null;
    };
    const realError = console.error;
    console.error = () => {};
    try {
      render(<Boundary><JoinerySymbolEditor spec={spec} block={null} onSave={() => {}} onClose={() => {}} /><Bomb /></Boundary>);
      await settle();
      assert.equal(useDraftingSession.getState().viewId, VIEW);
      act(() => blow());
      await settle();
    } finally { console.error = realError; }
    assert.equal(document.querySelector('[data-symbol-editor]'), null, 'the editor is gone');
    assertUntouched(before);
  });
});
