/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** DIMALL with rooms (#638) as a command: stamped room dimensions, added once, one undo step, found again on a rerun wherever their line stands. */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionLayout } from '@/drafting/annotation';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, setPlanPartsProvider, setWorkPlaneProvider, submitCommandLine, useDraftingSession } from '@/drafting/session.js';
import { setRoomsProvider } from '@/drafting/session-providers';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { layeredHouse, rect } from './fixture';

const view = { id: 'view-1', kind: 'plan', scale: 100 } as unknown as ProjectView;
const roomDims = () => useProjectStore.getState().drafts.filter((d) => typeof d.params.dimAll === 'string' && d.params.dimAll.startsWith('room:'));
const labels = () => roomDims().map((d) => (d.shape.type === 'dimension' ? dimensionLayout(d.shape).label : '')).sort();
const rooms = [{ guid: 'living', renderId: 1, at: 'cut' as const, ring: rect(0.3, 0.3, 3.7, 5.7) }, { guid: 'kitchen', renderId: 2, at: 'cut' as const, ring: rect(4, 0.3, 7.7, 5.7) }];

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  setWorkPlaneProvider(() => null, () => view);
  setPlanPartsProvider(() => layeredHouse());
  setRoomsProvider(() => rooms);
});

describe('DIMALL with the rooms of the plan', () => {
  it('adds each room its clear width and depth, as ordinary stamped dimensions', () => {
    submitCommandLine('DIMALL', null);
    assert.deepEqual(labels(), ['3.40', '3.70', '5.40', '5.40']);
    assert.ok(roomDims().every((d) => d.shape.type === 'dimension' && d.shape.variant === 'aligned' && d.layerId === useProjectStore.getState().drafts[0].layerId));
    assert.equal(new Set(roomDims().map((d) => d.params.dimAll)).size, 4);
    const keys = useDraftingSession.getState().history.map((h) => h.key);
    assert.ok(!keys.includes('drafting.msg.dimAllNoRooms') && !keys.includes('drafting.msg.dimAllDropped'), keys.join());
  });

  it('adds nothing on a second run, and one undo takes the room dimensions with the strings', () => {
    submitCommandLine('DIMALL', null);
    const all = useProjectStore.getState().drafts.length;
    submitCommandLine('DIMALL', null);
    assert.equal(useProjectStore.getState().drafts.length, all);
    undoDrafts();
    assert.equal(useProjectStore.getState().drafts.length, 0);
  });

  it('finds a room dimension again where the line stands elsewhere: a tag placed after the first run does not duplicate it', () => {
    submitCommandLine('DIMALL', null);
    const first = roomDims().length;
    // A note over the place the first run chose for the living room: the second run would put the line elsewhere.
    const at = roomDims().find((d) => d.params.dimAll?.toString().startsWith('room:living:x'));
    assert.ok(at && at.shape.type === 'dimension');
    const y = at.shape.a.y;
    useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, { id: 'note', viewId: 'view-1', layerId: at.layerId, shape: { type: 'text', p: { x: 1.2, y }, text: 'NOTE NOTE', height: 0.25, rotation: 0 }, params: {} }] });
    submitCommandLine('DIMALL', null);
    assert.equal(roomDims().length, first);
  });
});
