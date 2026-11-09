/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { cancelCommand, clickDrawing, runningCommand, useDraftingSession } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { defaultViews } from '@/project/view-defaults';
import type { ModelExtent } from '@/project/drawing-set';
import { rebindAction, resetAllBindings } from '@/lib/commands/key-bindings';
import { SteppedSheet } from './SteppedSheet.js';

/** #168 (audit finding 6): "Repeat last tool" starts the tool as a click on the rail does: rail lit, card shown, Done visible. */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  resetAllBindings();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ lastCommandId: null });
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
  resetAllBindings();
});

const named = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));

describe('Repeat last tool on a sheet (#168)', () => {
  it('lights the rail and shows the tool card with Done, after the Line was finished with Done', () => {
    rebindAction('drafting.repeat', { key: 'f6' });
    const sheet = useProjectStore.getState().sheets[1];
    const ui = render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} initialFocus={null} onBack={() => {}} onStep={() => {}} />);
    act(() => click(named(ui, 'Line')!));
    act(() => { clickDrawing({ x: 10, y: 10 }, 0.05, false); clickDrawing({ x: 50, y: 10 }, 0.05, false); });
    act(() => click(named(ui, 'Done')!));
    assert.equal(runningCommand(), null);
    assert.equal(named(ui, 'Line')!.getAttribute('aria-pressed'), 'false', 'the rail let the Line go');
    assert.equal(named(ui, 'Line')!.hasAttribute('data-last-tool'), true, 'and marks it as the last tool');

    press(document.body, 'F6');
    assert.ok(runningCommand(), 'the Line runs again');
    assert.equal(named(ui, 'Line')!.getAttribute('aria-pressed'), 'true', 'the rail lights the Line');
    assert.ok(named(ui, 'Done'), 'the tool card shows Done');
  });
});
