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
import { gripsOf } from '@/drafting/grips';
import { newDraft } from '@/drafting/draft-store';
import { SnapIndex } from '@/drafting/snaps';
import type { ReferenceSet } from '@/drafting/references';
import type { DraftShape } from '@/drafting/types';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import { useDraftingPointer } from './useDraftingPointer.js';

/**
 * #925: placing a dimension snapped to the model's end points, but dragging a placed
 * dimension's grip snapped only to drafted lines, never to the model's (the drawing's
 * references). A grip drag now snaps to the same targets, under the same toggle.
 */

const TRANSFORM = { scale: 1, x: 0, y: 0 };
/** One model line, as the generated drawing gives it: its end point (95, 20) is the target. */
const MODEL_LINE: DraftShape = { type: 'line', a: { x: 95, y: 20 }, b: { x: 200, y: 20 } };
const REFERENCES: ReferenceSet = { shapes: [MODEL_LINE], owners: [1], index: new SnapIndex([MODEL_LINE]) };

let id = '';
const dimension = () => useProjectStore.getState().drafts.find((d) => d.id === id)!.shape;

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const entity = useProjectStore((s) => s.drafts.find((d) => d.id === id))!;
  const { state, handlers } = useDraftingPointer({ containerRef: ref, transform: TRANSFORM, setTransform: () => {}, axis: 'down', entityShapes: [], references: REFERENCES, grips: gripsOf(entity.id, entity.shape) });
  return (
    <div ref={ref} data-testid="surface" {...handlers}>
      <output data-testid="snap">{state.snap ? state.snap.mode : 'none'}</output>
    </div>
  );
}

function fire(el: Element, type: string, x: number, y: number): void {
  act(() => {
    el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  });
}

/** Press on the dimension's end grip at (50, 50), drag to (92, 24), 5 px from the model's end point, and let go. */
function dragEndGrip(): string {
  const ui = render(<Harness />);
  const surface = ui.querySelector('[data-testid=surface]')!;
  fire(surface, 'pointerdown', 50, 50);
  fire(surface, 'pointermove', 92, 24);
  const snap = ui.querySelector('[data-testid=snap]')!.textContent!;
  fire(surface, 'pointerup', 92, 24);
  return snap;
}

beforeEach(() => {
  resetProject();
  cancelCommand();
  const d = newDraft('v', '0', { type: 'dimension', variant: 'aligned', a: { x: 50, y: 50 }, b: { x: 150, y: 50 }, at: { x: 100, y: 80 }, height: 0.25 });
  id = d.id;
  useProjectStore.setState({ drafts: [d] });
  useDraftingSession.setState({ ortho: false, orthoHeld: false, snap: true });
});
afterEach(() => cleanup());

describe('dragging a placed dimension\'s grip (#925)', () => {
  it('lands exactly on a model end point near it, and shows the end point snap while dragging', () => {
    assert.equal(dragEndGrip(), 'endpoint');
    const shape = dimension();
    assert.equal(shape.type, 'dimension');
    if (shape.type === 'dimension') assert.deepEqual(shape.a, { x: 95, y: 20 });
  });

  it('lands where it was let go when snapping is off', () => {
    useDraftingSession.setState({ snap: false });
    assert.equal(dragEndGrip(), 'none');
    const shape = dimension();
    if (shape.type === 'dimension') assert.deepEqual(shape.a, { x: 92, y: 24 });
  });
});
