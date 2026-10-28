/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Where a view looks when a finding about elements is clicked. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { drawingToScreen } from '@/drafting/frame.js';
import { clearFocus, fitBox, focusBox, requestFocus, useFocusRequest } from './focus.js';

describe('focus on elements', () => {
  it('is the box round the elements, grown to show their surroundings when they are small', () => {
    const door = [{ x: 5, y: 1 }, { x: 5.9, y: 1 }, { x: 5.9, y: 1.2 }, { x: 5, y: 1.2 }];
    const box = focusBox([door])!;
    assert.ok(box.max.x - box.min.x >= 4 && box.max.y - box.min.y >= 4);
    assert.ok(box.min.x < 5 && box.max.x > 5.9 && box.min.y < 1 && box.max.y > 1.2);
  });
  it('is the whole of several elements that are far apart', () => {
    const box = focusBox([[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 9, y: 7 }, { x: 10, y: 8 }]])!;
    assert.deepEqual(box, { min: { x: -1, y: -1 }, max: { x: 11, y: 9 } });
    assert.equal(focusBox([]), null);
  });
  it('is a request that is answered once', () => {
    requestFocus('v', ['G']);
    const first = useFocusRequest.getState().request!;
    requestFocus('v', ['G']);
    assert.notEqual(useFocusRequest.getState().request!.nonce, first.nonce);
    clearFocus();
    assert.equal(useFocusRequest.getState().request, null);
  });
  it('is a view that fits the box and centres it in the container, whichever way the plan is looked at', () => {
    const box = { min: { x: 2, y: 3 }, max: { x: 12, y: 8 } };
    const size = { width: 800, height: 600 };
    for (const axis of ['down', 'front', 'side'] as const) {
      const t = fitBox(box, size, axis);
      assert.equal(t.scale, 0.85 * 80, 'limited by the width: 10 units across 800 px');
      const corners = [box.min, box.max, { x: box.min.x, y: box.max.y }, { x: box.max.x, y: box.min.y }].map((p) => drawingToScreen(p, t, axis));
      assert.ok(corners.every((c) => c.x >= 0 && c.x <= size.width && c.y >= 0 && c.y <= size.height), axis);
      const mid = drawingToScreen({ x: 7, y: 5.5 }, t, axis);
      assert.ok(Math.abs(mid.x - 400) < 1e-9 && Math.abs(mid.y - 300) < 1e-9, axis);
    }
  });
});
