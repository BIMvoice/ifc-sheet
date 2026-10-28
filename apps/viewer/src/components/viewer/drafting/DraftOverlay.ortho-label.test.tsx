/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #454: the ortho state is written beside the cursor while a line is drawn, and nowhere else. */
import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { DraftOverlay } from './DraftOverlay.js';

const props = { entities: [], layers: [], selection: new Set<string>(), hoverId: null, preview: [], snap: null, window: null, highlight: [], extraPatterns: [], transform: { scale: 10, x: 0, y: 0 }, axis: 'down' as const };

afterEach(cleanup);

describe('DraftOverlay ortho label', () => {
  it('writes the label beside the cursor', () => {
    const root = render(<DraftOverlay {...props} cursor={{ x: 1, y: 2 }} orthoLabel="Ortho (Shift held)" />);
    assert.equal(root.querySelector('[data-testid=ortho-cursor-label]')?.textContent, 'Ortho (Shift held)');
  });
  it('writes nothing without a label or without a cursor', () => {
    assert.equal(render(<DraftOverlay {...props} cursor={{ x: 1, y: 2 }} />).querySelector('[data-testid=ortho-cursor-label]'), null);
    cleanup();
    assert.equal(render(<DraftOverlay {...props} cursor={null} orthoLabel="Ortho" />).querySelector('[data-testid=ortho-cursor-label]'), null);
  });
});
