/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168: in a drawing, press on a drafted element that is selected and drag: the selection moves with the cursor and
 * the release is one undo step. Alt-drag drops a copy, Esc puts it back, a plain click still selects.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft } from '@/drafting/draft-store';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import { drawingToScreen } from '@/drafting/frame';
import { undoLatest } from '@/project/unified-undo';
import type { EntityShape, Pt } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const LINE: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const shapes = (): EntityShape[] => useProjectStore.getState().drafts.map((d) => d.shape);
// An empty drawing opens at 1 m = 40 px about the work plane's origin (the canvas has no size here).
const screen = (p: Pt): Pt => drawingToScreen(p, { scale: 40, x: 0, y: 0 }, 'down');

function fire(el: Element, type: string, at: Pt, init: MouseEventInit = {}): void {
  const s = screen(at);
  act(() => {
    el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: s.x, clientY: s.y, button: 0, ...init }));
  });
}

function mount(): Element {
  const host = render(<DraftingView view={plan} />);
  const [id] = editDrafts({ add: [newDraft('p', '0', LINE)] });
  clearDraftHistory();
  act(() => useDraftingSession.setState({ selection: new Set([id]) }));
  return host.querySelector('[data-drafting-canvas]')!;
}

beforeEach(() => {
  setPlatform('Win32');
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, orthoHeld: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setPlatform(null);
});

describe('dragging a selection in a drawing (#168)', () => {
  it('moves the selected line 1 m with the cursor, in one undo step', () => {
    const canvas = mount();
    fire(canvas, 'pointerdown', { x: 2, y: 0 });
    fire(canvas, 'pointermove', { x: 2.5, y: 0 });
    fire(canvas, 'pointermove', { x: 3, y: 0 });
    assert.deepEqual(shapes(), [LINE], 'nothing is changed before the release');
    fire(canvas, 'pointerup', { x: 3, y: 0 });
    assert.deepEqual(shapes(), [{ type: 'line', a: { x: 1, y: 0 }, b: { x: 5, y: 0 } }]);
    assert.equal(useDraftingSession.getState().selection.size, 1, 'it stays selected');
    act(() => undoLatest());
    assert.deepEqual(shapes(), [LINE]);
  });

  it('with Alt leaves the line where it was and drops a copy 1 m away', () => {
    const canvas = mount();
    fire(canvas, 'pointerdown', { x: 2, y: 0 }, { altKey: true });
    fire(canvas, 'pointermove', { x: 2, y: 1 }, { altKey: true });
    fire(canvas, 'pointerup', { x: 2, y: 1 }, { altKey: true });
    assert.deepEqual(shapes(), [LINE, { type: 'line', a: { x: 0, y: 1 }, b: { x: 4, y: 1 } }]);
    act(() => undoLatest());
    assert.deepEqual(shapes(), [LINE]);
  });

  it('Esc during the drag puts it back and keeps the selection', () => {
    const canvas = mount();
    fire(canvas, 'pointerdown', { x: 2, y: 0 });
    fire(canvas, 'pointermove', { x: 3, y: 0 });
    press(window, 'Escape');
    fire(canvas, 'pointerup', { x: 3, y: 0 });
    assert.deepEqual(shapes(), [LINE]);
    assert.equal(useDraftingSession.getState().selection.size, 1);
  });

  it('a click without a drag still selects, and moves nothing', () => {
    const canvas = mount();
    fire(canvas, 'pointerdown', { x: 2, y: 0 });
    fire(canvas, 'pointerup', { x: 2, y: 0 });
    assert.deepEqual(shapes(), [LINE]);
    assert.equal(useDraftingSession.getState().selection.size, 1);
  });
});
