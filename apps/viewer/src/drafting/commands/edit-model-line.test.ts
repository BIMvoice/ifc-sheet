/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** TRIM and EXTEND on a line of the generated drawing (#189): the model's line is hidden, a drafted line takes its place, one undo restores both. */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenLineEntry } from '@bimvoice/ifcsheet';
import { newDraft, undoDrafts } from '../draft-store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import type { DraftShape } from '../types';
import { trimCommand, extendCommand } from './edit';
import type { DraftContext, ModelLinePick } from './types';

const GID = '2O2Fr$t4X7Zf8NOew3FNr2';
/** A wall's projected line along y = 0, from x = 0 to 10. */
const modelLine: ModelLinePick = { globalId: GID, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
const refShape: DraftShape = { type: 'line', a: modelLine.a, b: modelLine.b };
const entry = hiddenLineEntry(GID, { start: modelLine.a, end: modelLine.b });

function setup(boundary: DraftShape) {
  const drafted = newDraft('v', 'walls', boundary, {});
  useProjectStore.setState({ views: [{ id: 'v', kind: 'plan' } as unknown as ProjectView], drafts: [drafted], dirty: false });
  const said: string[] = [];
  const ctx = {
    viewId: 'v',
    layerId: 'walls',
    entities: () => useProjectStore.getState().drafts,
    // The generated drawing's lines near the region: the picked line itself is among them.
    referenceShapes: () => [refShape],
    say: (key: string) => said.push(key),
  } as unknown as DraftContext;
  return { ctx, said, drafted };
}

const hidden = () => useProjectStore.getState().views[0].graphics?.hiddenLines ?? [];
const lines = () => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'line' ? [d.shape] : []));
const byX = (l: { a: { x: number; y: number }; b: { x: number; y: number } }) => [l.a, l.b].sort((p, q) => p.x - q.x);

describe("TRIM and EXTEND on the model's own lines (#189)", () => {
  beforeEach(() => useProjectStore.setState({ views: [], drafts: [] }));

  it('trims a model line at a drafted boundary: it is hidden, the picked side is gone, one undo restores both', () => {
    const { ctx, drafted } = setup({ type: 'line', a: { x: 4, y: -1 }, b: { x: 4, y: 1 } });
    assert.equal(trimCommand.create(ctx).onPickModelLine?.(modelLine, { x: 8, y: 0 }), 'continue');
    assert.deepEqual(hidden(), [entry], 'the model line is hidden in this view');
    const added = lines().filter((l) => l !== drafted.shape);
    assert.equal(added.length, 1);
    assert.deepEqual(byX(added[0]), [{ x: 0, y: 0 }, { x: 4, y: 0 }], 'the drafted replacement keeps the side not clicked');
    assert.ok(undoDrafts());
    assert.deepEqual(hidden(), [], 'one undo shows the model line again');
    assert.deepEqual(useProjectStore.getState().drafts.map((d) => d.id), [drafted.id], 'and takes the drafted line away');
  });

  it('extends a model line to a drafted boundary the same way', () => {
    const { ctx, drafted } = setup({ type: 'line', a: { x: 14, y: -1 }, b: { x: 14, y: 1 } });
    extendCommand.create(ctx).onPickModelLine?.(modelLine, { x: 9, y: 0 });
    assert.deepEqual(hidden(), [entry]);
    const added = lines().filter((l) => l !== drafted.shape);
    assert.equal(added.length, 1);
    assert.deepEqual(byX(added[0]), [{ x: 0, y: 0 }, { x: 14, y: 0 }], 'the end nearest the click reaches the boundary');
    assert.ok(undoDrafts());
    assert.deepEqual(hidden(), []);
    assert.equal(useProjectStore.getState().drafts.length, 1);
  });

  it('changes nothing and says so when there is nothing to trim to', () => {
    const { ctx, said } = setup({ type: 'line', a: { x: 40, y: 5 }, b: { x: 40, y: 6 } });
    trimCommand.create(ctx).onPickModelLine?.(modelLine, { x: 8, y: 0 });
    assert.deepEqual(hidden(), []);
    assert.equal(useProjectStore.getState().drafts.length, 1);
    assert.deepEqual(said, ['drafting.msg.nothingToTrim']);
  });
});
