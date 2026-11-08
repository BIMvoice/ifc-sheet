/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168: in a drawing, the handle above a selection turns it by dragging (one undo step, Esc puts it back), and the
 * selection bar's two flip buttons mirror it about its centre at once, keeping the original when asked.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft } from '@/drafting/draft-store';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import { drawingToScreen, type ViewTransform } from '@/drafting/frame';
import { turnHandleOf } from '@/drafting/turn-selection';
import { undoLatest } from '@/project/unified-undo';
import type { EntityShape, Pt } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const LINE: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const SLOPE: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 2 } };
const shapes = (): EntityShape[] => useProjectStore.getState().drafts.map((d) => d.shape);
// An empty drawing opens at 1 m = 40 px about the work plane's origin (the canvas has no size here).
const T: ViewTransform = { scale: 40, x: 0, y: 0 };
const near = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9;

function fireAt(el: Element, type: string, s: Pt, init: MouseEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: s.x, clientY: s.y, button: 0, ...init }));
  });
}

function mount(shape: EntityShape): HTMLElement {
  const host = render(<DraftingView view={plan} />);
  const [id] = editDrafts({ add: [newDraft('p', '0', shape)] });
  clearDraftHistory();
  act(() => useDraftingSession.setState({ selection: new Set([id]) }));
  return host;
}

/** The handle's screen point, and that point turned 90° counter-clockwise on screen about the selection's centre. */
function handlePoints(): { at: Pt; turned: Pt } {
  const handle = turnHandleOf(useDraftingSession.getState().selection, useProjectStore.getState().drafts, T, 'down')!;
  const c = drawingToScreen(handle.centre, T, 'down');
  return { at: handle.at, turned: { x: c.x + (handle.at.y - c.y), y: c.y - (handle.at.x - c.x) } };
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

describe('turning a selection by its handle in a drawing (#168)', () => {
  it('shows the handle, turns the line 90° about its centre with the angle beside the cursor, in one undo step', () => {
    const host = mount(LINE);
    assert.ok(host.querySelector('[data-turn-handle]'), 'the handle shows on the selection');
    const canvas = host.querySelector('[data-drafting-canvas]')!;
    const { at, turned } = handlePoints();
    fireAt(canvas, 'pointerdown', at);
    fireAt(canvas, 'pointermove', turned);
    assert.equal(host.querySelector('[data-turn-angle]')?.textContent, '90°');
    assert.deepEqual(shapes(), [LINE], 'nothing is changed before the release');
    fireAt(canvas, 'pointerup', turned);
    const line = shapes()[0];
    assert.ok(line.type === 'line', JSON.stringify(line));
    // Upright through the centre (2, 0), the end that was on the right now at the top of the screen.
    assert.ok([line.a, line.b].some((p) => near(p, { x: 2, y: 2 })) && [line.a, line.b].some((p) => near(p, { x: 2, y: -2 })), JSON.stringify(line));
    assert.ok(drawingToScreen(line.b, T, 'down').y < drawingToScreen(line.a, T, 'down').y);
    assert.equal(useDraftingSession.getState().selection.size, 1, 'it stays selected');
    act(() => undoLatest());
    assert.deepEqual(shapes(), [LINE]);
  });

  it('Esc during the turn puts it back', () => {
    const host = mount(LINE);
    const canvas = host.querySelector('[data-drafting-canvas]')!;
    const { at, turned } = handlePoints();
    fireAt(canvas, 'pointerdown', at);
    fireAt(canvas, 'pointermove', turned);
    press(window, 'Escape');
    fireAt(canvas, 'pointerup', turned);
    assert.deepEqual(shapes(), [LINE]);
    assert.equal(useDraftingSession.getState().selection.size, 1);
  });
});

describe('the flip buttons on the selection bar (#168)', () => {
  const button = (ui: HTMLElement, name: string) => ui.querySelector(`[role=toolbar] button[aria-label="${name}"]`) as HTMLButtonElement;

  it('Flip left to right mirrors the line about its centre, in one undo step', () => {
    const ui = mount(SLOPE);
    click(button(ui, 'Flip left to right'));
    assert.deepEqual(shapes(), [{ type: 'line', a: { x: 4, y: 0 }, b: { x: 0, y: 2 } }]);
    act(() => undoLatest());
    assert.deepEqual(shapes(), [SLOPE]);
    click(button(ui, 'Flip up and down'));
    assert.deepEqual(shapes(), [{ type: 'line', a: { x: 0, y: 2 }, b: { x: 4, y: 0 } }]);
  });

  it('with "Keep the original" leaves the line and adds the mirrored copy, which is selected', () => {
    const ui = mount(SLOPE);
    const keep = [...ui.querySelectorAll('[role=toolbar] label')].find((l) => l.textContent === 'Keep the original')?.querySelector('input');
    assert.ok(keep);
    click(keep);
    click(button(ui, 'Flip left to right'));
    assert.deepEqual(shapes(), [SLOPE, { type: 'line', a: { x: 4, y: 0 }, b: { x: 0, y: 2 } }]);
    const copy = useProjectStore.getState().drafts[1];
    assert.deepEqual([...useDraftingSession.getState().selection], [copy.id]);
    act(() => undoLatest());
    assert.deepEqual(shapes(), [SLOPE]);
  });
});
