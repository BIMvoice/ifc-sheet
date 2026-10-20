/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A drawing opened on its own says, over its canvas, that it cannot be drawn and why. */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import type { ProjectView } from '@/project/types';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const REASON = 'Its level is not in the loaded models.';

beforeEach(() => {
  resetProject();
  useViewDrawings.setState({ byView: {} });
  useProjectStore.setState({ views: [plan] });
});
afterEach(() => cleanup());

describe('DraftingView with a view that cannot be drawn', () => {
  it('shows the reason over the canvas', () => {
    const ui = render(<DraftingView view={plan} />);
    assert.equal(ui.querySelector('[data-viewport-state]'), null, 'nothing to say before a drawing is asked for');
    act(() => patchViewDrawing('p', { status: 'error', error: REASON }));
    const state = ui.querySelector('[data-drafting-canvas] [data-viewport-state]');
    assert.equal(state?.getAttribute('data-viewport-state'), 'failed');
    assert.match(state?.textContent ?? '', /Its level is not in the loaded models/);
  });
});
