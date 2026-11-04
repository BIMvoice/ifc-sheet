/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #666: dragging on empty space of a drafting view selects several elements at once. Left to right takes what is wholly
 * inside the box (window), right to left what it touches (crossing), Alt + drag what a freehand loop encloses (lasso),
 * and Shift adds to the selection. The middle button still pans.
 */
import '@/test/setup-dom.js';
import { useRef, useState } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory, editDrafts, newDraft } from '@/drafting/draft-store';
import { attachDraftingView, cancelCommand, useDraftingSession } from '@/drafting/session';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import type { Pt } from '@/drafting/types';
import type { ViewTransform } from '@/drafting/frame';
import { useDraftingPointer } from './useDraftingPointer.js';

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const { state, handlers } = useDraftingPointer({ containerRef: ref, transform, setTransform, axis: 'down', entityShapes: [], references: null });
  return (
    <div ref={ref} data-testid="surface" {...handlers}>
      <output data-testid="lasso">{state.lasso?.length ?? 0}</output>
      <output data-testid="pan">{transform.x},{transform.y}</output>
    </div>
  );
}

function fire(el: Element, type: string, p: Pt, init: MouseEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, ...init }));
  });
}

/** Presses at the first point, moves through the rest and releases at the last. */
function dragThrough(surface: Element, path: Pt[], init: MouseEventInit = {}): void {
  fire(surface, 'pointerdown', path[0], init);
  for (const p of path.slice(1)) fire(surface, 'pointermove', p, init);
  fire(surface, 'pointerup', path[path.length - 1], init);
}

const mount = (): Element => render(<Harness />).querySelector('[data-testid=surface]')!;
const bar = (name: string, x: number, y: number) => editDrafts({ add: [{ ...newDraft('v', '0', { type: 'line', a: { x, y }, b: { x: x + 20, y } }), id: name }] });

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ draftLayers: [{ id: '0', name: '0', color: '#000000', visible: true, locked: false }] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, orthoHeld: false, snap: false, history: [], lastCommandId: null });
  attachDraftingView('v', 'down', () => []);
  bar('near', 10, 10);
  bar('far', 100, 10);
  bar('across', 40, 50);
});
afterEach(() => cleanup());

const ids = (): string[] => [...useDraftingSession.getState().selection].sort();

describe('window and crossing by dragging (#666)', () => {
  it('left to right takes what is wholly inside the box', () => {
    dragThrough(mount(), [{ x: 5, y: 0 }, { x: 40, y: 30 }, { x: 45, y: 70 }]);
    assert.deepEqual(ids(), ['near']);
  });

  it('right to left also takes what the box only touches', () => {
    dragThrough(mount(), [{ x: 45, y: 70 }, { x: 40, y: 30 }, { x: 5, y: 0 }]);
    assert.deepEqual(ids(), ['across', 'near']);
  });

  it('Shift adds to the selection and a drag without it replaces it', () => {
    const surface = mount();
    dragThrough(surface, [{ x: 5, y: 0 }, { x: 45, y: 25 }]);
    dragThrough(surface, [{ x: 95, y: 0 }, { x: 125, y: 25 }], { shiftKey: true });
    assert.deepEqual(ids(), ['far', 'near']);
    dragThrough(surface, [{ x: 95, y: 0 }, { x: 125, y: 25 }]);
    assert.deepEqual(ids(), ['far']);
  });
});

describe('lasso by Alt + drag (#666)', () => {
  // A loop round the bars at the left, with a notch cut into its right side; the bar across (x 40 to 60) ends outside it.
  const LOOP: Pt[] = [{ x: 5, y: 0 }, { x: 45, y: 0 }, { x: 45, y: 20 }, { x: 30, y: 30 }, { x: 30, y: 40 }, { x: 45, y: 40 }, { x: 45, y: 65 }, { x: 5, y: 65 }];

  it('takes what the loop encloses and not what lies outside it', () => {
    const surface = mount();
    bar('also', 10, 52);
    dragThrough(surface, LOOP, { altKey: true });
    assert.deepEqual(ids(), ['also', 'near']);
  });

  it('is still a drag when the loop comes back to where it began: it selects, it is not a click on empty space', () => {
    const surface = mount();
    dragThrough(surface, [{ x: 95, y: 0 }, { x: 125, y: 25 }]);
    dragThrough(surface, [...LOOP, LOOP[0]], { altKey: true, shiftKey: true });
    assert.deepEqual(ids(), ['far', 'near']);
  });

  it('shows the loop while it is drawn and clears it on release', () => {
    const ui = render(<Harness />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    fire(surface, 'pointerdown', LOOP[0], { altKey: true });
    LOOP.slice(1).forEach((p) => fire(surface, 'pointermove', p, { altKey: true }));
    assert.ok(Number(ui.querySelector('[data-testid=lasso]')!.textContent) > 3);
    fire(surface, 'pointerup', LOOP[LOOP.length - 1], { altKey: true });
    assert.equal(ui.querySelector('[data-testid=lasso]')!.textContent, '0');
  });

  it('adds to the selection with Shift', () => {
    const surface = mount();
    dragThrough(surface, [{ x: 95, y: 0 }, { x: 125, y: 25 }]);
    dragThrough(surface, LOOP, { altKey: true, shiftKey: true });
    assert.deepEqual(ids(), ['far', 'near']);
  });
});

describe('panning is not lost (#666)', () => {
  it('the middle button still pans, and selects nothing', () => {
    const ui = render(<Harness />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    fire(surface, 'pointerdown', { x: 5, y: 5 }, { button: 1 });
    fire(surface, 'pointermove', { x: 45, y: 25 }, { button: 1 });
    fire(surface, 'pointerup', { x: 45, y: 25 }, { button: 1 });
    assert.equal(ui.querySelector('[data-testid=pan]')!.textContent, '40,20');
    assert.deepEqual(ids(), []);
  });
});
