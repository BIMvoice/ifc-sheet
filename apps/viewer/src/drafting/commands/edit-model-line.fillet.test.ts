/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** FILLET and OFFSET on lines of the generated drawing (#189): FILLET hides both model lines and drafts their replacements in one undo step; OFFSET drafts a copy and hides nothing. */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenLineEntry } from '@bimvoice/ifcsheet';
import { undoDrafts } from '../draft-store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { filletCommand, offsetCommand } from './edit';
import type { DraftContext, ModelLinePick } from './types';

const bottom: ModelLinePick = { globalId: '2O2Fr$t4X7Zf8NOew3FNr2', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
const right: ModelLinePick = { globalId: '1hOSvn6df7F8_7GcBWlR72', a: { x: 10, y: 0 }, b: { x: 10, y: 10 } };
const entryOf = (p: ModelLinePick) => hiddenLineEntry(p.globalId, { start: p.a, end: p.b });

function setup() {
  useProjectStore.setState({ views: [{ id: 'v', kind: 'plan' } as unknown as ProjectView], drafts: [], dirty: false });
  const said: string[] = [];
  const ctx = {
    viewId: 'v',
    layerId: 'walls',
    settings: { filletRadius: 2, chamferDistance: 2, offsetDistance: 1.5 },
    entities: () => useProjectStore.getState().drafts,
    referenceShapes: () => [],
    say: (key: string) => said.push(key),
  } as unknown as DraftContext;
  return { ctx, said };
}

const hidden = () => useProjectStore.getState().views[0].graphics?.hiddenLines ?? [];
const shapes = () => useProjectStore.getState().drafts.map((d) => d.shape);
const near = (p: { x: number; y: number }, x: number, y: number) => Math.hypot(p.x - x, p.y - y) < 1e-6;

describe('FILLET and OFFSET on the model\'s own lines (#189)', () => {
  beforeEach(() => useProjectStore.setState({ views: [], drafts: [] }));

  it('fillets the corner of two model lines: both hidden, two shortened lines and an arc drafted, one undo restores', () => {
    const { ctx } = setup();
    const command = filletCommand.create(ctx);
    assert.equal(command.onPickModelLine?.(bottom, { x: 8, y: 0 }), 'continue');
    assert.equal(command.onPickModelLine?.(right, { x: 10, y: 8 }), 'done');
    assert.deepEqual(new Set(hidden()), new Set([entryOf(bottom), entryOf(right)]), 'both model lines are hidden in this view');
    const drafted = shapes();
    assert.equal(drafted.length, 3);
    const lines = drafted.flatMap((s) => (s.type === 'line' ? [s] : []));
    assert.equal(lines.length, 2);
    // The radius is 2: the bottom line now stops at x = 8 and the right line starts at y = 2.
    assert.ok(lines.some((l) => [l.a, l.b].some((p) => near(p, 0, 0)) && [l.a, l.b].some((p) => near(p, 8, 0))), 'bottom line shortened to (8, 0)');
    assert.ok(lines.some((l) => [l.a, l.b].some((p) => near(p, 10, 10)) && [l.a, l.b].some((p) => near(p, 10, 2))), 'right line shortened to (10, 2)');
    assert.ok(drafted.some((s) => s.type === 'arc'), 'the arc is drafted');
    assert.ok(undoDrafts());
    assert.deepEqual(hidden(), [], 'one undo shows both model lines again');
    assert.equal(shapes().length, 0, 'and takes the drafted lines and arc away');
  });

  it('refuses the same model line twice and parallel lines, changing nothing', () => {
    const { ctx, said } = setup();
    const command = filletCommand.create(ctx);
    command.onPickModelLine?.(bottom, { x: 2, y: 0 });
    assert.equal(command.onPickModelLine?.(bottom, { x: 8, y: 0 }), 'continue');
    assert.deepEqual(hidden(), []);
    const parallel: ModelLinePick = { globalId: right.globalId, a: { x: 0, y: 5 }, b: { x: 10, y: 5 } };
    command.onPickModelLine?.(parallel, { x: 5, y: 5 });
    assert.deepEqual(said, ['drafting.msg.filletFailed']);
    assert.deepEqual(hidden(), []);
    assert.equal(shapes().length, 0);
  });

  it('offsets a model line: a copy is drafted at the distance, the model line stays, one undo removes the copy', () => {
    const { ctx } = setup();
    const command = offsetCommand.create(ctx);
    assert.equal(command.input(), 'pick');
    command.onPickModelLine?.(bottom, { x: 5, y: 0 });
    assert.equal(command.input(), 'point', 'it now asks for the side');
    command.onPoint?.({ x: 5, y: 3 });
    assert.deepEqual(hidden(), [], 'the model line is not hidden: the offset is a copy');
    const copy = shapes();
    assert.equal(copy.length, 1);
    const line = copy[0];
    assert.equal(line.type, 'line');
    if (line.type !== 'line') return;
    assert.ok(near(line.a, 0, 1.5) && near(line.b, 10, 1.5), 'at 1.5 on the clicked side');
    assert.ok(undoDrafts());
    assert.equal(shapes().length, 0);
  });
});
