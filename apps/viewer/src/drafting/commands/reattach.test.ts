/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** REATTACH: a click that is not on an element leaves the annotation as it was (picking an element needs the live drawing). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDraft } from '../draft-store';
import { useProjectStore } from '@/project/project-store';
import { reattachCommand } from './reattach';
import type { DraftContext } from './types';

describe('REATTACH', () => {
  it('keeps asking, and changes nothing, when the click is not on a model element', () => {
    const tag = newDraft('v', 'l', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: 'old', height: 0.25 }, { tagOf: 'GONE' });
    const other = newDraft('v', 'l', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: 'old', height: 0.25 }, { tagOf: 'GONE' });
    useProjectStore.setState({ drafts: [tag, other] });
    const said: string[] = [];
    const ctx = { entities: () => useProjectStore.getState().drafts, selection: () => new Set([tag.id]), elementAt: () => null, say: (k: string) => said.push(k) } as unknown as DraftContext;
    const step = reattachCommand.create(ctx);
    assert.equal(step.onPoint?.({ x: 0, y: 0 }), 'continue', 'no element there: it keeps asking');
    assert.deepEqual(said, ['drafting.msg.notAnElement']);
    assert.equal(useProjectStore.getState().drafts[0].params.tagOf, 'GONE');
  });
});
