/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The green crosses of tracking lines (acquired points) belong to the tool that is running: when a dimension is placed, or the
 * tool is cancelled with Esc, they go, and the next tool starts with none. They used to stay on the drawing, and on the next tool.
 */
import '@/test/setup-dom.js';
import { useRef } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { attachDraftingView, cancelCommand, patchDraftSettings, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { resetProject } from '@/project/project-store.js';
import { useTrackingPref } from '@/drafting/tracking-pref';
import type { DraftShape, Pt } from '@/drafting/types';
import { TrackingMarks } from './TrackingMarks.js';
import { useDraftingPointer } from './useDraftingPointer.js';

const SHAPES: DraftShape[] = [{ type: 'line', a: { x: 100, y: 100 }, b: { x: 300, y: 100 } }];
const TRANSFORM = { scale: 1, x: 0, y: 0 };

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const { state, handlers } = useDraftingPointer({ containerRef: ref, transform: TRANSFORM, setTransform: () => {}, axis: 'down', entityShapes: SHAPES, references: null });
  return (
    <div ref={ref} data-testid="surface" {...handlers}>
      <svg><TrackingMarks tracking={state.tracking} t={TRANSFORM} axis="down" /></svg>
    </div>
  );
}

function fire(el: Element, type: string, p: Pt): void {
  act(() => {
    el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0 }));
  });
}

const click = (el: Element, p: Pt): void => { fire(el, 'pointermove', p); fire(el, 'pointerdown', p); fire(el, 'pointerup', p); };

/** Rests on a point until it is acquired (the dwell is 350 ms). */
async function rest(el: Element, p: Pt): Promise<void> {
  fire(el, 'pointermove', p);
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
}

const marks = (ui: Element): number => ui.querySelectorAll('[data-testid=tracking-marks] path').length;

let ui: Element;
let surface: Element;
beforeEach(() => {
  cancelCommand();
  patchDraftSettings({ dimContinuous: false });
  resetProject();
  clearDraftHistory();
  useTrackingPref.setState({ on: true });
  useDraftingSession.setState({ selection: new Set(), ortho: false, orthoHeld: false, snap: true, history: [], lastCommandId: null });
  attachDraftingView('v', 'down', () => []);
  ui = render(<Harness />);
  surface = ui.querySelector('[data-testid=surface]')!;
});
afterEach(() => cleanup());

describe('tracking crosses end with the tool', () => {
  it('shows an acquired point while the Dimension tool runs (the premise)', async () => {
    act(() => { startDraftCommand('dimaligned'); });
    await rest(surface, { x: 100, y: 100 });
    assert.equal(marks(ui), 1);
  });

  it('removes them when the dimension is placed', async () => {
    act(() => { startDraftCommand('dimaligned'); });
    await rest(surface, { x: 100, y: 100 });
    click(surface, { x: 100, y: 100 });
    click(surface, { x: 300, y: 100 });
    click(surface, { x: 200, y: 60 });
    assert.equal(useDraftingSession.getState().commandId, null);
    assert.equal(marks(ui), 0);
  });

  it('removes them on Esc', async () => {
    act(() => { startDraftCommand('dimaligned'); });
    await rest(surface, { x: 100, y: 100 });
    assert.equal(marks(ui), 1);
    act(() => cancelCommand());
    assert.equal(marks(ui), 0);
  });

  it('starts the next tool with none', async () => {
    act(() => { startDraftCommand('dimaligned'); });
    await rest(surface, { x: 100, y: 100 });
    act(() => cancelCommand());
    act(() => { startDraftCommand('dimaligned'); });
    fire(surface, 'pointermove', { x: 150, y: 60 });
    assert.equal(marks(ui), 0);
  });
});
