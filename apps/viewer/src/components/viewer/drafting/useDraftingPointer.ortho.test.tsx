/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { useRef } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import type { Grip } from '@/drafting/grips';
import { useDraftingPointer } from './useDraftingPointer.js';

/**
 * #146: under the Ortho lock a dragged grip keeps to horizontal / vertical from
 * where it started, except a detail's crop corner, which moves on both axes.
 */

const TRANSFORM = { scale: 1, x: 0, y: 0 };

function Harness({ grips }: { grips: Grip[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { state, handlers } = useDraftingPointer({ containerRef: ref, transform: TRANSFORM, setTransform: () => {}, axis: 'down', entityShapes: [], references: null, grips });
  return (
    <div ref={ref} data-testid="surface" {...handlers}>
      <output data-testid="at">{state.gripDrag ? JSON.stringify(state.gripDrag.at) : 'none'}</output>
    </div>
  );
}

function fire(el: Element, type: string, x: number, y: number, init: MouseEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }));
  });
}

/** Press on the grip at (50,50), drag to (90,58), and read where the drag has it. */
function drag(grip: Grip, init: MouseEventInit = {}): unknown {
  const ui = render(<Harness grips={[grip]} />);
  const surface = ui.querySelector('[data-testid=surface]')!;
  fire(surface, 'pointerdown', 50, 50);
  fire(surface, 'pointermove', 90, 58, init);
  const text = ui.querySelector('[data-testid=at]')!.textContent!;
  return text === 'none' ? null : JSON.parse(text);
}

const plain: Grip = { id: 'e', key: 'b', at: { x: 50, y: 50 } };
const crop: Grip = { id: 'm', key: 'se', at: { x: 50, y: 50 }, detail: { viewId: 'v', rect: { min: { x: 0, y: 0 }, max: { x: 50, y: 50 } } } };

beforeEach(() => {
  cancelCommand();
  useDraftingSession.setState({ ortho: false, orthoHeld: false, snap: false });
});
afterEach(() => cleanup());

describe('a dragged grip under the ortho lock (#146)', () => {
  it('moves freely while the lock is off', () => {
    assert.deepEqual(drag(plain), { x: 90, y: 58 });
  });

  it('keeps to the horizontal through where it started once the lock is on', () => {
    useDraftingSession.setState({ ortho: true });
    assert.deepEqual(drag(plain), { x: 90, y: 50 });
  });

  it('holds the same while Ctrl is held on the move', () => {
    assert.deepEqual(drag(plain, { ctrlKey: true }), { x: 90, y: 50 });
  });

  it('leaves a detail crop corner free on both axes under the lock', () => {
    useDraftingSession.setState({ ortho: true });
    assert.deepEqual(drag(crop), { x: 90, y: 58 });
    cleanup();
    assert.deepEqual(drag(crop, { ctrlKey: true }), { x: 90, y: 58 });
  });
});
