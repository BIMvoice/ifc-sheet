/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** JOIN (#668): selected lines that touch end to end become one polyline, in one undo step, with the first one's layer and style. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDraft, undoDrafts } from '../draft-store';
import { useProjectStore } from '@/project/project-store';
import { draftCommandByName } from './registry';
import type { DraftContext } from './types';

const line = (layer: string, ax: number, ay: number, bx: number, by: number, params = {}) => newDraft('v', layer, { type: 'line', a: { x: ax, y: ay }, b: { x: bx, y: by } }, params);

function run(ids: string[]) {
  const said: { key: string; params?: unknown }[] = [];
  let selection = new Set(ids);
  const ctx = {
    entities: () => useProjectStore.getState().drafts,
    selection: () => selection,
    setSelection: (s: ReadonlySet<string>) => { selection = new Set(s); },
    say: (key: string, params?: unknown) => said.push({ key, params }),
  } as unknown as DraftContext;
  draftCommandByName('J')?.run?.(ctx, '');
  return { said, selection };
}

describe('JOIN (#668)', () => {
  it('is typed as J and JOIN', () => {
    assert.equal(draftCommandByName('J')?.id, 'join');
    assert.equal(draftCommandByName('join')?.id, 'join');
  });

  it('turns three lines end to end into one open polyline of the first line, in one undo step', () => {
    const a = line('walls', 0, 0, 1, 0, { lineType: 'dashed' });
    const b = line('other', 1, 1, 1, 0); // stored reversed
    const c = line('other', 1, 1, 2, 1);
    const stray = line('walls', 9, 9, 10, 9);
    useProjectStore.setState({ drafts: [a, b, c, stray] });
    const { said, selection } = run([a.id, b.id, c.id]);
    const drafts = useProjectStore.getState().drafts;
    assert.deepEqual(drafts.map((d) => d.id), [a.id, stray.id]);
    assert.deepEqual(drafts[0].shape, { type: 'polyline', closed: false, pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] });
    assert.equal(drafts[0].layerId, 'walls');
    assert.equal(drafts[0].params.lineType, 'dashed');
    assert.deepEqual([...selection], [a.id]);
    assert.equal(said[0].key, 'drafting.msg.joined');
    assert.ok(undoDrafts());
    assert.deepEqual(useProjectStore.getState().drafts.map((d) => d.id), [a.id, b.id, c.id, stray.id], 'one undo brings all back');
  });

  it('closes a loop whose ends meet', () => {
    const a = line('l', 0, 0, 1, 0);
    const b = line('l', 1, 0, 1, 1);
    const c = line('l', 1, 1, 0, 0);
    useProjectStore.setState({ drafts: [a, b, c] });
    run([a.id, b.id, c.id]);
    const [only] = useProjectStore.getState().drafts;
    assert.equal(only.shape.type === 'polyline' && only.shape.closed, true);
  });

  it('leaves a piece across a gap and says how many and why', () => {
    const a = line('l', 0, 0, 1, 0);
    const b = line('l', 1, 0, 2, 0);
    const far = line('l', 2.5, 0, 3, 0);
    useProjectStore.setState({ drafts: [a, b, far] });
    const { said } = run([a.id, b.id, far.id]);
    assert.deepEqual(useProjectStore.getState().drafts.map((d) => d.id), [a.id, far.id]);
    assert.deepEqual(said.map((s) => s.key), ['drafting.msg.joined', 'drafting.msg.joinLeft']);
    assert.equal((said[1].params as { count: number }).count, 1);
  });

  it('changes nothing when no two touch', () => {
    const a = line('l', 0, 0, 1, 0);
    const b = line('l', 5, 0, 6, 0);
    useProjectStore.setState({ drafts: [a, b] });
    const before = useProjectStore.getState().drafts;
    const { said } = run([a.id, b.id]);
    assert.equal(useProjectStore.getState().drafts, before);
    assert.equal(said[0].key, 'drafting.msg.joinNone');
  });
});
