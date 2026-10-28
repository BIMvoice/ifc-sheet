/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act, useRef } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { attachDraftingView, cancelCommand, clickDrawing, setWorkPlaneProvider, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { gripsOf, type Grip } from '@/drafting/grips';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import type { ProjectView } from '@/project/types.js';
import { gripCursor, useDraftingPointer } from './useDraftingPointer.js';

/**
 * #454: a section line is drawn orthogonally by holding Shift (the F8 toggle left alone), and its end handles
 * move by click-click (pick up, drop) as well as by drag, with a hover cursor that says they can be picked up.
 */

const TRANSFORM = { scale: 1, x: 0, y: 0 };
const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };

function Harness({ grips }: { grips: Grip[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { state, handlers } = useDraftingPointer({ containerRef: ref, transform: TRANSFORM, setTransform: () => {}, axis: 'down', entityShapes: [], references: null, grips });
  return (
    <div ref={ref} data-testid="surface" {...handlers}>
      <output data-testid="cursor">{state.cursor ? JSON.stringify(state.cursor) : 'none'}</output>
      <output data-testid="grip-cursor">{gripCursor(state) ?? 'none'}</output>
    </div>
  );
}

function fire(el: Element, type: string, x: number, y: number, init: MouseEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }));
  });
}

const drafts = () => useProjectStore.getState().drafts;
const read = (ui: Element, id: string) => ui.querySelector(`[data-testid=${id}]`)!.textContent!;

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, orthoHeld: false, snap: false, history: [], lastCommandId: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
});
afterEach(() => cleanup());

describe('drawing a section line with Shift held (#454)', () => {
  it('keeps the line horizontal while Shift is down, and frees it again once Shift is up', () => {
    const ui = render(<Harness grips={[]} />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    startDraftCommand('sectionline');
    fire(surface, 'pointerdown', 10, 10);
    fire(surface, 'pointermove', 90, 18, { shiftKey: true });
    assert.deepEqual(JSON.parse(read(ui, 'cursor')), { x: 90, y: 10 });
    assert.equal(useDraftingSession.getState().ortho, false, 'Shift is a momentary hold: the F8 toggle stays as it was');
    fire(surface, 'pointermove', 90, 18);
    assert.deepEqual(JSON.parse(read(ui, 'cursor')), { x: 90, y: 18 });
    assert.equal(useDraftingSession.getState().orthoHeld, false);
  });

  it('places the second point on the horizontal when it is clicked with Shift held', () => {
    const ui = render(<Harness grips={[]} />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    startDraftCommand('sectionline');
    fire(surface, 'pointerdown', 10, 10);
    fire(surface, 'pointerdown', 90, 18, { shiftKey: true });
    fire(surface, 'pointerdown', 50, 40); // the side the section looks to
    const pts = drafts().flatMap((d) => (d.shape.type === 'line' ? [d.shape.a, d.shape.b] : []));
    assert.ok(pts.some((p) => p.x === 90 && p.y === 10), 'the end sits on the horizontal through the start');
    assert.ok(!pts.some((p) => p.x === 90 && p.y === 18), 'and not where the cursor was');
  });
});

/** A section drawn on the plan, its end line selected: the grip at the section's right-hand end. */
function sectionEndGrip(): Grip {
  startDraftCommand('sectionline');
  clickDrawing({ x: 10, y: 10 }, 0.05, false);
  clickDrawing({ x: 90, y: 10 }, 0.05, false);
  clickDrawing({ x: 50, y: 40 }, 0.05, false);
  for (const d of drafts()) {
    const grip = gripsOf(d.id, d.shape).find((g) => g.at.x === 90 && g.at.y === 10);
    if (grip) return grip;
  }
  throw new Error('the section drew no handle at its end');
}
const endOf = (grip: Grip) => {
  const shape = drafts().find((d) => d.id === grip.id)!.shape;
  return shape.type === 'line' ? shape[grip.key as 'a' | 'b'] : null;
};

describe('a section end handle (#454)', () => {
  it('moves by click-click: the first click picks it up, it follows the cursor, the second click drops it', () => {
    const grip = sectionEndGrip();
    const ui = render(<Harness grips={[grip]} />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    fire(surface, 'pointerdown', 90, 10);
    fire(surface, 'pointerup', 90, 10);
    assert.deepEqual(endOf(grip), { x: 90, y: 10 }, 'picked up, not yet moved');
    assert.equal(read(ui, 'grip-cursor'), 'grabbing');
    fire(surface, 'pointermove', 120, 30);
    assert.deepEqual(JSON.parse(read(ui, 'cursor')), { x: 120, y: 30 });
    fire(surface, 'pointerdown', 120, 30);
    fire(surface, 'pointerup', 120, 30);
    assert.deepEqual(endOf(grip), { x: 120, y: 30 });
    assert.equal(read(ui, 'grip-cursor'), 'none');
    fire(surface, 'pointermove', 150, 60);
    assert.deepEqual(endOf(grip), { x: 120, y: 30 }, 'dropped: the handle no longer follows');
  });

  it('keeps a carried handle on the horizontal while Shift is held', () => {
    const grip = sectionEndGrip();
    const ui = render(<Harness grips={[grip]} />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    fire(surface, 'pointerdown', 90, 10);
    fire(surface, 'pointerup', 90, 10);
    fire(surface, 'pointermove', 130, 25, { shiftKey: true });
    fire(surface, 'pointerdown', 130, 25, { shiftKey: true });
    assert.deepEqual(endOf(grip), { x: 130, y: 10 });
  });

  it('still moves by drag: press, move, release', () => {
    const grip = sectionEndGrip();
    const ui = render(<Harness grips={[grip]} />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    fire(surface, 'pointerdown', 90, 10);
    fire(surface, 'pointermove', 120, 30);
    fire(surface, 'pointerup', 120, 30);
    assert.deepEqual(endOf(grip), { x: 120, y: 30 });
    fire(surface, 'pointermove', 150, 60);
    assert.deepEqual(endOf(grip), { x: 120, y: 30 });
  });

  it('shows a grab cursor on hover and none away from it', () => {
    const grip = sectionEndGrip();
    const ui = render(<Harness grips={[grip]} />);
    const surface = ui.querySelector('[data-testid=surface]')!;
    fire(surface, 'pointermove', 40, 40);
    assert.equal(read(ui, 'grip-cursor'), 'none');
    fire(surface, 'pointermove', 91, 11);
    assert.equal(read(ui, 'grip-cursor'), 'grab');
  });
});
