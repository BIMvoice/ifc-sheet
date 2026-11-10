/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** HIDELINE on the model's own lines (#189): a click hides one line in this view, one undo step each, and a drawn line is told to use Erase. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenLineEntry } from '@bimvoice/ifcsheet';
import { clearDraftHistory, newDraft, undoDrafts } from '../draft-store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { draftCommandByName } from './registry';
import { hideLineCommand } from './hideline.command';
import type { DraftContext, ModelLinePick } from './types';

const GID = '2O2Fr$t4X7Zf8NOew3FNr2';
const wall: ModelLinePick = { globalId: GID, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
const other: ModelLinePick = { globalId: GID, a: { x: 0, y: 5 }, b: { x: 10, y: 5 } };
const entry = (p: ModelLinePick) => hiddenLineEntry(p.globalId, { start: p.a, end: p.b });
const hidden = () => useProjectStore.getState().views[0].graphics?.hiddenLines ?? [];

function setup() {
  useProjectStore.setState({ views: [{ id: 'v', kind: 'plan' } as unknown as ProjectView], drafts: [], dirty: false });
  clearDraftHistory();
  const said: string[] = [];
  const ctx = { viewId: 'v', layerId: 'walls', say: (key: string) => said.push(key) } as unknown as DraftContext;
  return { command: hideLineCommand.create(ctx), said };
}

describe('HIDELINE on the model\'s own lines (#189)', () => {
  it('is a typed command', () => {
    assert.equal(draftCommandByName('hideline'), hideLineCommand);
  });

  it('hides each clicked line in this view and keeps asking, one undo step per line', () => {
    const { command, said } = setup();
    assert.equal(command.onPickModelLine?.(wall, wall.a), 'continue');
    assert.deepEqual(hidden(), [entry(wall)]);
    assert.equal(command.onPickModelLine?.(other, other.a), 'continue');
    assert.deepEqual(hidden(), [entry(wall), entry(other)], 'the second line does not bring the first back');
    assert.deepEqual(said, ['drafting.msg.hidelineDone', 'drafting.msg.hidelineDone']);
    assert.ok(undoDrafts());
    assert.deepEqual(hidden(), [entry(wall)], 'Undo shows the last line again, not the first');
    assert.equal(command.onEnter?.(), 'done');
  });

  it('leaves a drawn line alone and says to use Erase', () => {
    const { command, said } = setup();
    const drawn = newDraft('v', 'walls', { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, {});
    useProjectStore.setState({ drafts: [drawn] });
    assert.equal(command.onPick?.(drawn, { x: 0.5, y: 0 }), 'continue');
    assert.deepEqual(hidden(), []);
    assert.deepEqual(useProjectStore.getState().drafts, [drawn]);
    assert.deepEqual(said, ['drafting.msg.hidelineDrawn']);
  });
});
