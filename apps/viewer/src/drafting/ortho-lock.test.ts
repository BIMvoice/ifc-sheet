/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ortho lock: the Ortho toggle (button, F8) holds drawing to horizontal and
 * vertical; holding Ctrl does the same for as long as it is down, without
 * touching the toggle.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from './draft-store.js';
import {
  attachDraftingView, cancelCommand, clickDrawing, constrainPoint, pressEnter, setOrthoHeld, startDraftCommand, useDraftingSession,
} from './session.js';

const TOL = 0.05;

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, orthoHeld: false, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
});

describe('ortho lock', () => {
  it('leaves points alone with neither the toggle nor Ctrl', () => {
    startDraftCommand('line');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    assert.deepEqual(constrainPoint({ x: 10, y: 3 }), { x: 10, y: 3 });
  });

  it('holds the next point to the dominant axis while Ctrl is down, then lets go', () => {
    startDraftCommand('line');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    setOrthoHeld(true);
    assert.deepEqual(constrainPoint({ x: 10, y: 3 }), { x: 10, y: 0 });
    assert.deepEqual(constrainPoint({ x: 2, y: 9 }), { x: 0, y: 9 });
    setOrthoHeld(false);
    assert.deepEqual(constrainPoint({ x: 10, y: 3 }), { x: 10, y: 3 });
  });

  it('draws an orthogonal line when the click lands off-axis with Ctrl down', () => {
    startDraftCommand('line');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    setOrthoHeld(true);
    clickDrawing({ x: 10, y: 3 }, TOL, false);
    pressEnter();
    assert.deepEqual(useProjectStore.getState().drafts[0]?.shape, { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
  });

  it('keeps the toggle locked when Ctrl is released', () => {
    useDraftingSession.setState({ ortho: true });
    startDraftCommand('line');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    setOrthoHeld(true);
    setOrthoHeld(false);
    assert.deepEqual(constrainPoint({ x: 10, y: 3 }), { x: 10, y: 0 });
  });

  it('keeps tracking a held Ctrl across a cancelled command, since the key is still down', () => {
    startDraftCommand('line');
    setOrthoHeld(true);
    cancelCommand();
    assert.equal(useDraftingSession.getState().orthoHeld, true);
    startDraftCommand('line');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    assert.deepEqual(constrainPoint({ x: 10, y: 3 }), { x: 10, y: 0 });
  });
});
