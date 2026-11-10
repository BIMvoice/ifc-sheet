/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #669: the layers editor has a Duplicate button on each layer row; the copy's name box takes the focus. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { LayersTab } from './LayersTab.js';

beforeEach(() => {
  resetProject();
  useProjectStore.setState({
    draftLayers: [
      { id: '0', name: 'Layer 0', color: '#18181b', visible: true, locked: false },
      { id: 'a', name: 'Outline', color: '#ff0000', visible: true, locked: false, lineWeight: 0.5, lineType: 'dashed', order: 2 },
      { id: 'z', name: 'Zed', color: '#00ff00', visible: true, locked: false },
    ],
  });
  clearDraftHistory();
});
afterEach(cleanup);

describe('LayersTab Duplicate button (#669)', () => {
  it('adds "<name> copy" below the layer with its look, and focuses the new name box', () => {
    const ui = render(<LayersTab />);
    const button = ui.querySelector('button[aria-label="Duplicate layer Outline"]');
    assert.ok(button, 'each layer row has a Duplicate button');
    click(button);
    const layers = useProjectStore.getState().draftLayers;
    assert.deepEqual(layers.map((l) => l.name), ['Layer 0', 'Outline', 'Outline copy', 'Zed']);
    assert.deepEqual({ ...layers[2]!, id: 'x' }, { ...layers[1]!, id: 'x', name: 'Outline copy' });
    const focused = document.activeElement as HTMLInputElement | null;
    assert.equal(focused?.value, 'Outline copy', 'the new layer\'s name box has the focus');
  });

  it('a second press makes "copy 2"', () => {
    const ui = render(<LayersTab />);
    click(ui.querySelector('button[aria-label="Duplicate layer Outline"]')!);
    click(ui.querySelector('button[aria-label="Duplicate layer Outline"]')!);
    assert.deepEqual(useProjectStore.getState().draftLayers.map((l) => l.name), ['Layer 0', 'Outline', 'Outline copy 2', 'Outline copy', 'Zed']);
  });
});
