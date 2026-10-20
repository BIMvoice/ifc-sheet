/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** On a detail the drawn annotation is clipped to the crop with the drawing, so nothing outside the area shows. */
import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import type { DraftEntity } from '@/drafting/types';
import { DraftOverlay } from './DraftOverlay.js';

const line: DraftEntity = { id: 'a', layerId: '0', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 30, y: 0 } }, params: {} } as DraftEntity;
const props = { entities: [line], layers: [], selection: new Set<string>(), hoverId: null, preview: [], snap: null, cursor: null, window: null, highlight: [], extraPatterns: [], transform: { scale: 10, x: 0, y: 0 }, axis: 'down' as const };

afterEach(cleanup);

describe('DraftOverlay on a detail', () => {
  it('clips the drawn annotation to the crop, in screen coordinates', () => {
    const root = render(<DraftOverlay {...props} crop={{ min: { x: 1, y: 2 }, max: { x: 4, y: 5 } }} />);
    const polygon = root.querySelector('clipPath polygon');
    assert.ok(polygon, 'a clip polygon');
    assert.equal(polygon.getAttribute('points'), '10.0,20.0 40.0,20.0 40.0,50.0 10.0,50.0');
    const id = root.querySelector('clipPath')!.getAttribute('id')!;
    assert.ok(root.querySelector(`g[clip-path="url(#${id})"] path`), 'the annotation is inside the clipped group');
  });

  it('does not clip a view that is not a detail', () => {
    const root = render(<DraftOverlay {...props} />);
    assert.equal(root.querySelector('clipPath'), null);
    assert.equal(root.querySelector('g[clip-path]'), null);
  });
});
