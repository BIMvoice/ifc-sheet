/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168: the handle above a selection turns it about the centre of its box, in 15° steps (Shift: by the degree);
 * letting go is one undo step, as ROTATE, and dropping the turn (Esc) changes nothing.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft, undoDrafts } from './draft-store.js';
import { drawingToScreen, screenToDrawing, type ViewTransform } from './frame.js';
import { commitSelectionTurn, onTurnHandle, selectionTurnPreview, startSelectionTurn, turnHandleOf, turnSelectionTo, type TurnHandle } from './turn-selection.js';
import type { DraftEntity, EntityShape, Pt } from './types.js';

const LINE: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const T: ViewTransform = { scale: 40, x: 100, y: 100 };
const drafts = (): DraftEntity[] => useProjectStore.getState().drafts;
const close = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9;

/** The drawing point the handle reaches turned `deg` counter-clockwise ON SCREEN about the centre (screen y runs down). */
function turnedOnScreen(handle: TurnHandle, deg: number): Pt {
  const c = drawingToScreen(handle.centre, T, 'down');
  const r = (deg * Math.PI) / 180;
  const dx = handle.at.x - c.x;
  const dy = handle.at.y - c.y;
  return screenToDrawing({ x: c.x + dx * Math.cos(r) + dy * Math.sin(r), y: c.y - dx * Math.sin(r) + dy * Math.cos(r) }, T, 'down');
}

let ids: Set<string>;
beforeEach(() => {
  resetProject();
  ids = new Set(editDrafts({ add: [newDraft('v', '0', LINE)] }));
  clearDraftHistory();
});

describe('turning a selection by its handle (#168)', () => {
  it('sits above the box, and a 90° drag turns the line about its centre in one undo step', () => {
    const handle = turnHandleOf(ids, drafts(), T, 'down')!;
    assert.deepEqual(handle.centre, { x: 2, y: 0 });
    const centre = drawingToScreen(handle.centre, T, 'down');
    assert.equal(handle.at.x, centre.x);
    assert.ok(handle.at.y < centre.y - 20, 'above the selection on screen');
    assert.ok(onTurnHandle(handle, { x: handle.at.x + 3, y: handle.at.y - 3 }));
    assert.ok(!onTurnHandle(handle, centre));

    const start = startSelectionTurn('v', handle, screenToDrawing(handle.at, T, 'down'), 'down');
    const turn = turnSelectionTo(start, turnedOnScreen(handle, 90), false);
    assert.equal(turn.degrees, 90, 'counter-clockwise on screen counts positive, as typed ROTATE angles');
    const [preview] = selectionTurnPreview(turn);
    assert.ok(preview.type === 'line' && Math.abs(preview.a.x - 2) < 1e-9 && Math.abs(preview.b.x - 2) < 1e-9, 'the outline previews it upright');
    assert.deepEqual(drafts().map((d) => d.shape), [LINE], 'nothing changes before the release');

    assert.equal(commitSelectionTurn(turn), true);
    const line = drafts()[0].shape;
    assert.ok(line.type === 'line');
    // Turned 90° counter-clockwise on a plan (drawing y runs down the screen): the end at x 4 goes up the screen.
    const ends = [line.a, line.b];
    assert.ok(ends.some((p) => close(p, { x: 2, y: 2 })) && ends.some((p) => close(p, { x: 2, y: -2 })), JSON.stringify(ends));
    assert.ok(drawingToScreen(line.b, T, 'down').y < drawingToScreen(line.a, T, 'down').y, 'the far end went up the screen');
    assert.equal(undoDrafts(), true);
    assert.deepEqual(drafts().map((d) => d.shape), [LINE]);
    assert.equal(undoDrafts(), false, 'the turn was one step');
  });

  it('snaps a 47° drag to 45°, and Shift turns it by the degree', () => {
    const handle = turnHandleOf(ids, drafts(), T, 'down')!;
    const start = startSelectionTurn('v', handle, screenToDrawing(handle.at, T, 'down'), 'down');
    assert.equal(turnSelectionTo(start, turnedOnScreen(handle, 47), false).degrees, 45);
    assert.equal(turnSelectionTo(start, turnedOnScreen(handle, -52), false).degrees, -45);
    assert.equal(turnSelectionTo(start, turnedOnScreen(handle, 47), true).degrees, 47);
    commitSelectionTurn(turnSelectionTo(start, turnedOnScreen(handle, 47), false));
    const line = drafts()[0].shape;
    assert.ok(line.type === 'line');
    assert.ok(Math.abs(Math.abs(Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x)) - Math.PI / 4) < 1e-9, 'turned exactly 45°');
  });

  it('cancelled (Esc), or let go at 0°, changes nothing', () => {
    const handle = turnHandleOf(ids, drafts(), T, 'down')!;
    const start = startSelectionTurn('v', handle, screenToDrawing(handle.at, T, 'down'), 'down');
    turnSelectionTo(start, turnedOnScreen(handle, 90), false);
    assert.deepEqual(drafts().map((d) => d.shape), [LINE]);
    assert.equal(commitSelectionTurn(turnSelectionTo(start, turnedOnScreen(handle, 5), false)), false);
    assert.equal(undoDrafts(), false);
  });

  it('has no handle with nothing selected', () => {
    assert.equal(turnHandleOf(new Set(), drafts(), T, 'down'), null);
  });
});
