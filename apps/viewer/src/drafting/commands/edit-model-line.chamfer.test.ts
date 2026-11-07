/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** CHAMFER on lines of the generated drawing, and the preview of the corner while the second line is picked (#189). */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenLineEntry } from '@bimvoice/ifcsheet';
import { undoDrafts } from '../draft-store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import type { DraftShape } from '../types';
import { chamferCommand, filletCommand } from './edit';
import type { DraftContext, ModelLinePick } from './types';

const bottom: ModelLinePick = { globalId: '2O2Fr$t4X7Zf8NOew3FNr2', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
const right: ModelLinePick = { globalId: '1hOSvn6df7F8_7GcBWlR72', a: { x: 10, y: 0 }, b: { x: 10, y: 10 } };
const entryOf = (p: ModelLinePick) => hiddenLineEntry(p.globalId, { start: p.a, end: p.b });
const rightShape: DraftShape = { type: 'line', a: right.a, b: right.b };

function setup() {
  useProjectStore.setState({ views: [{ id: 'v', kind: 'plan' } as unknown as ProjectView], drafts: [], dirty: false });
  const said: string[] = [];
  const ctx = {
    viewId: 'v',
    layerId: 'walls',
    settings: { filletRadius: 2, chamferDistance: 2, offsetDistance: 1.5 },
    entities: () => useProjectStore.getState().drafts,
    referenceShapes: () => [rightShape],
    say: (key: string) => said.push(key),
  } as unknown as DraftContext;
  return { ctx, said };
}

const hidden = () => useProjectStore.getState().views[0].graphics?.hiddenLines ?? [];
const shapes = () => useProjectStore.getState().drafts.map((d) => d.shape);
const near = (p: { x: number; y: number }, x: number, y: number) => Math.hypot(p.x - x, p.y - y) < 1e-6;

describe('CHAMFER on the model\'s own lines (#189)', () => {
  beforeEach(() => useProjectStore.setState({ views: [], drafts: [] }));

  it('cuts the corner of two model lines: both hidden, two shortened lines and the cut drafted, one undo restores', () => {
    const { ctx } = setup();
    const command = chamferCommand.create(ctx);
    assert.equal(command.onPickModelLine?.(bottom, { x: 8, y: 0 }), 'continue');
    assert.equal(command.onPickModelLine?.(right, { x: 10, y: 8 }), 'done');
    assert.deepEqual(new Set(hidden()), new Set([entryOf(bottom), entryOf(right)]), 'both model lines are hidden in this view');
    const lines = shapes().flatMap((s) => (s.type === 'line' ? [s] : []));
    assert.equal(lines.length, 3, 'two replacements and the chamfer segment');
    const has = (p: { x: number; y: number }, q: { x: number; y: number }) => lines.some((l) => (near(l.a, p.x, p.y) && near(l.b, q.x, q.y)) || (near(l.a, q.x, q.y) && near(l.b, p.x, p.y)));
    assert.ok(has({ x: 0, y: 0 }, { x: 8, y: 0 }), 'bottom line shortened to (8, 0)');
    assert.ok(has({ x: 10, y: 10 }, { x: 10, y: 2 }), 'right line shortened to (10, 2)');
    assert.ok(has({ x: 8, y: 0 }, { x: 10, y: 2 }), 'the chamfer joins the two cut points');
    assert.ok(undoDrafts());
    assert.deepEqual(hidden(), [], 'one undo shows both model lines again');
    assert.equal(shapes().length, 0, 'and takes the drafted lines away');
  });

  it('previews the arc of a fillet and the cut of a chamfer once the first line is picked, and nothing before or off a line', () => {
    const { ctx } = setup();
    const fillet = filletCommand.create(ctx);
    assert.deepEqual(fillet.preview?.({ x: 10, y: 8 }), [], 'nothing before the first line');
    fillet.onPickModelLine?.(bottom, { x: 8, y: 0 });
    assert.deepEqual(fillet.preview?.({ x: 5, y: 5 }), [], 'nothing when no line is under the cursor');
    assert.equal(fillet.preview?.({ x: 10, y: 8 })?.[0]?.type, 'arc');
    assert.deepEqual(hidden(), [], 'a preview changes nothing');
    const chamfer = chamferCommand.create(ctx);
    chamfer.onPickModelLine?.(bottom, { x: 8, y: 0 });
    const cut = chamfer.preview?.({ x: 10, y: 8 })?.[0];
    assert.ok(cut?.type === 'line' && ((near(cut.a, 8, 0) && near(cut.b, 10, 2)) || (near(cut.b, 8, 0) && near(cut.a, 10, 2))));
  });
});
