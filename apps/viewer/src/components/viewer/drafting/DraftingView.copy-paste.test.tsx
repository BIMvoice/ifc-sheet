/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #484: copy, paste, duplicate, move, rotate and mirror drafted elements without
 * the command line: Ctrl/Cmd+C, +V and +D in the drafting view, and the bar
 * under the selection. Each is one undo step.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft } from '@/drafting/draft-store';
import { clearClipboard } from '@/drafting/clipboard';
import { cancelCommand, clickDrawing, pressEnter, useDraftingSession } from '@/drafting/session';
import { undoLatest } from '@/project/unified-undo';
import type { EntityShape } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const LINE: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const shapes = (): EntityShape[] => useProjectStore.getState().drafts.map((d) => d.shape);
const ctrl = { ctrlKey: true };

function seedSelectedLine(): string {
  const [id] = editDrafts({ add: [newDraft('p', '0', LINE)] });
  clearDraftHistory();
  act(() => useDraftingSession.setState({ selection: new Set([id]) }));
  return id;
}

beforeEach(() => {
  setPlatform('Win32');
  cancelCommand();
  resetProject();
  clearDraftHistory();
  clearClipboard();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setPlatform(null);
});

describe('Ctrl+C / Ctrl+V on drafted elements (#484)', () => {
  it('copies the selected line and puts it down where the next click lands, in one undo step', () => {
    render(<DraftingView view={plan} />);
    seedSelectedLine();
    press(window, 'c', ctrl);
    assert.equal(shapes().length, 1, 'copying draws nothing');
    press(window, 'v', ctrl);
    assert.equal(useDraftingSession.getState().commandId, 'paste');
    act(() => clickDrawing({ x: 12, y: 7 }, 0.05, false));
    assert.equal(shapes().length, 2);
    // The copy's centre (2,0) lands on the click: the line keeps its length and direction.
    assert.deepEqual(shapes()[1], { type: 'line', a: { x: 10, y: 7 }, b: { x: 14, y: 7 } });
    act(() => undoLatest());
    assert.deepEqual(shapes(), [LINE]);
  });

  it('pastes into another view of the same scale at the size copied', () => {
    render(<DraftingView view={plan} />);
    seedSelectedLine();
    press(window, 'c', ctrl);
    const other = { ...plan, id: 'q' } satisfies ProjectView;
    useProjectStore.setState({ views: [plan, other] });
    cleanup();
    render(<DraftingView view={other} />);
    press(window, 'v', ctrl);
    act(() => clickDrawing({ x: 2, y: 0 }, 0.05, false));
    const pasted = useProjectStore.getState().drafts.find((d) => d.viewId === 'q');
    assert.deepEqual(pasted?.shape, LINE);
  });

  it('Cmd works as Ctrl on a Mac', () => {
    setPlatform('MacIntel');
    render(<DraftingView view={plan} />);
    seedSelectedLine();
    press(window, 'c', { metaKey: true });
    press(window, 'v', { metaKey: true });
    assert.equal(useDraftingSession.getState().commandId, 'paste');
  });

  it('Ctrl+V with nothing copied does nothing, and is left to the browser', () => {
    render(<DraftingView view={plan} />);
    seedSelectedLine();
    let prevented = true;
    act(() => {
      const ev = new window.KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      prevented = ev.defaultPrevented;
    });
    assert.equal(useDraftingSession.getState().commandId, null);
    assert.equal(prevented, false);
  });

  it('ignores the keys in a text field', () => {
    render(<DraftingView view={plan} />);
    seedSelectedLine();
    const field = document.createElement('input');
    document.body.appendChild(field);
    press(field, 'c', ctrl);
    press(field, 'v', ctrl);
    press(field, 'd', ctrl);
    assert.equal(useDraftingSession.getState().commandId, null);
    assert.equal(shapes().length, 1);
    field.remove();
  });

  it('ignores the keys inside a panel that owns them', () => {
    render(<DraftingView view={plan} />);
    seedSelectedLine();
    const panel = document.createElement('div');
    panel.setAttribute('data-owns-keys', '');
    const inner = document.createElement('button');
    panel.appendChild(inner);
    document.body.appendChild(panel);
    press(inner, 'd', ctrl);
    assert.equal(shapes().length, 1);
    panel.remove();
  });

  it('ignores the keys with a dialog open', () => {
    render(<DraftingView view={plan} />);
    seedSelectedLine();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    press(window, 'd', ctrl);
    dialog.remove();
    assert.equal(shapes().length, 1);
  });
});

describe('Ctrl+D (#484)', () => {
  it('duplicates the selection in place, offset, in one undo step, and selects the copy', () => {
    render(<DraftingView view={plan} />);
    const id = seedSelectedLine();
    press(window, 'd', ctrl);
    assert.equal(shapes().length, 2);
    const copy = useProjectStore.getState().drafts[1];
    // 5 paper mm at 1:100 is 0.5 m.
    assert.deepEqual(copy.shape, { type: 'line', a: { x: 0.5, y: 0.5 }, b: { x: 4.5, y: 0.5 } });
    assert.deepEqual([...useDraftingSession.getState().selection], [copy.id]);
    act(() => undoLatest());
    assert.deepEqual(useProjectStore.getState().drafts.map((d) => d.id), [id]);
  });

  it('does nothing without a selection', () => {
    render(<DraftingView view={plan} />);
    press(window, 'd', ctrl);
    assert.equal(shapes().length, 0);
  });
});

describe('the bar under the selection (#484)', () => {
  const button = (ui: HTMLElement, name: string) => ui.querySelector(`[role=toolbar] button[aria-label="${name}"]`) as HTMLButtonElement;

  it('offers Copy, Move, Rotate and Mirror, and each starts its command on the selection', () => {
    const ui = render(<DraftingView view={plan} />);
    seedSelectedLine();
    for (const [name, id] of [['Copy', 'copy'], ['Move', 'move'], ['Rotate', 'rotate'], ['Mirror', 'mirror']] as const) {
      assert.ok(button(ui, name), `${name} button`);
      click(button(ui, name));
      assert.equal(useDraftingSession.getState().commandId, id);
      act(() => cancelCommand());
    }
  });

  it('Move relocates the line in one undo step', () => {
    const ui = render(<DraftingView view={plan} />);
    seedSelectedLine();
    click(button(ui, 'Move'));
    act(() => { clickDrawing({ x: 0, y: 0 }, 0.05, false); clickDrawing({ x: 0, y: 3 }, 0.05, false); });
    assert.deepEqual(shapes(), [{ type: 'line', a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }]);
    act(() => undoLatest());
    assert.deepEqual(shapes(), [LINE]);
  });

  it('Copy places a copy per click and ends with Enter; Rotate and Mirror are one step each', () => {
    const ui = render(<DraftingView view={plan} />);
    seedSelectedLine();
    click(button(ui, 'Copy'));
    act(() => { clickDrawing({ x: 0, y: 0 }, 0.05, false); clickDrawing({ x: 0, y: 5 }, 0.05, false); pressEnter(); });
    assert.equal(shapes().length, 2);
    act(() => undoLatest());
    assert.equal(shapes().length, 1);
    click(button(ui, 'Mirror'));
    act(() => { clickDrawing({ x: 0, y: 1 }, 0.05, false); clickDrawing({ x: 1, y: 1 }, 0.05, false); });
    assert.equal(shapes().length, 2);
    act(() => undoLatest());
    assert.equal(shapes().length, 1);
    click(button(ui, 'Rotate'));
    act(() => { clickDrawing({ x: 0, y: 0 }, 0.05, false); clickDrawing({ x: 0, y: 1 }, 0.05, false); });
    const line = shapes()[0] as { b: { x: number; y: number } };
    assert.ok(Math.abs(line.b.x) < 1e-9 && Math.abs(line.b.y - 4) < 1e-9);
    act(() => undoLatest());
    assert.deepEqual(shapes(), [LINE]);
  });

  it('is absent with nothing selected', () => {
    const ui = render(<DraftingView view={plan} />);
    assert.equal(ui.querySelector('[role=toolbar] button[aria-label="Copy"]'), null);
  });
});
