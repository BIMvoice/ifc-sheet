/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168: dragging a selection moves it by the vector the grabbed point went, snapping as the tools do; Alt keeps the
 * originals and drops a copy; letting go is one undo step, and dropping the drag (Esc) changes nothing.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft, undoDrafts } from './draft-store.js';
import { commitSelectionDrag, dragSelectionTo, dragSnapTargets, selectionDragPreview, startSelectionDrag, type DragAim } from './drag-selection.js';
import type { DraftEntity, DraftShape, EntityShape } from './types.js';

const MOVED: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const OTHER: EntityShape = { type: 'line', a: { x: 10, y: 5 }, b: { x: 10, y: 9 } };
const shapes = (): EntityShape[] => useProjectStore.getState().drafts.map((d) => d.shape);
const drafts = (): DraftEntity[] => useProjectStore.getState().drafts;
const aim = (targets: readonly DraftShape[] | null, ortho = false): DragAim => ({ targets, tolerance: 0.2, ortho });
const geometry = (): DraftShape[] => drafts().map((d) => d.shape as DraftShape);

let line: DraftEntity;
beforeEach(() => {
  resetProject();
  const [a] = editDrafts({ add: [newDraft('v', '0', MOVED), newDraft('v', '0', OTHER)] });
  clearDraftHistory();
  line = drafts().find((d) => d.id === a)!;
});

describe('dragging a selection (#168)', () => {
  it('moves by the vector between the grabbed point and the drop, each snapped, as one undo step', () => {
    // Grabbed near its end (0,0), dropped near the other line's end (10,5): it lands exactly there.
    const start = startSelectionDrag('v', new Set([line.id]), drafts(), line, { x: 0.08, y: 0.05 }, aim(geometry()), false);
    assert.ok(start);
    assert.deepEqual(start.from, { x: 0, y: 0 });
    const drag = dragSelectionTo(start, { x: 10.1, y: 4.9 }, aim(dragSnapTargets(geometry(), start)), false);
    assert.deepEqual(drag.to, { x: 10, y: 5 });
    assert.deepEqual(selectionDragPreview(drag), [{ type: 'line', a: { x: 10, y: 5 }, b: { x: 14, y: 5 } }]);
    assert.deepEqual(shapes(), [MOVED, OTHER], 'nothing changes before the release');
    const selected = commitSelectionDrag(drag);
    assert.deepEqual([...(selected ?? [])], [line.id]);
    assert.deepEqual(shapes(), [{ type: 'line', a: { x: 10, y: 5 }, b: { x: 14, y: 5 } }, OTHER]);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(shapes(), [MOVED, OTHER]);
    assert.equal(undoDrafts(), false, 'the move was one step');
  });

  it('does not snap a moving element to itself, and holds horizontal or vertical under ortho', () => {
    const start = startSelectionDrag('v', new Set([line.id]), drafts(), line, { x: 2, y: 0 }, aim(null), false)!;
    assert.equal(dragSnapTargets(geometry(), start).length, 1, 'the moving line is not a target');
    const drag = dragSelectionTo(start, { x: 5, y: 0.7 }, aim(null, true), false);
    assert.deepEqual(drag.to, { x: 5, y: 0 });
  });

  it('with Alt keeps the originals and drops a copy, which is what is selected after', () => {
    const start = startSelectionDrag('v', new Set([line.id]), drafts(), line, { x: 2, y: 0 }, aim(null), true)!;
    const drag = dragSelectionTo(start, { x: 2, y: 3 }, aim(null), true);
    const selected = commitSelectionDrag(drag)!;
    assert.equal(drafts().length, 3);
    assert.deepEqual(shapes()[0], MOVED, 'the original stays');
    const copy = drafts()[2];
    assert.deepEqual(copy.shape, { type: 'line', a: { x: 0, y: 3 }, b: { x: 4, y: 3 } });
    assert.deepEqual([...selected], [copy.id]);
    undoDrafts();
    assert.deepEqual(shapes(), [MOVED, OTHER]);
  });

  it('cancelled (Esc), or let go where it began, changes nothing', () => {
    const start = startSelectionDrag('v', new Set([line.id]), drafts(), line, { x: 2, y: 0 }, aim(null), false)!;
    dragSelectionTo(start, { x: 7, y: 7 }, aim(null), false);
    assert.deepEqual(shapes(), [MOVED, OTHER]);
    assert.equal(commitSelectionDrag(dragSelectionTo(start, { x: 2, y: 0 }, aim(null), false)), null);
    assert.equal(undoDrafts(), false);
  });

  it('starts only on an element of the selection', () => {
    const other = drafts().find((d) => d.id !== line.id)!;
    assert.equal(startSelectionDrag('v', new Set([line.id]), drafts(), other, { x: 10, y: 6 }, aim(null), false), null);
    assert.equal(startSelectionDrag('v', new Set([line.id]), drafts(), null, { x: 2, y: 0 }, aim(null), false), null);
  });
});
