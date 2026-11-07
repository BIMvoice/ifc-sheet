/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * FLIP (#168), the selection bar's two flip buttons: the selection mirrored about its own centre at once, as MIRROR's
 * edit, one undo step. Text keeps reading the right way; a section symbol flips whole and stays its section's.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { clearDraftHistory, editDrafts, newDraft, undoDrafts } from '../draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, setWorkPlaneProvider, startDraftCommand, submitCommandLine, useDraftingSession } from '../session.js';
import { flipArgsOf } from './flip.command.js';
import type { EntityShape } from '../types.js';

const TOL = 0.05;
const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const drafts = () => useProjectStore.getState().drafts;
const select = (ids: Iterable<string>) => useDraftingSession.setState({ selection: new Set(ids) });

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
});

describe('FLIP (#168)', () => {
  it('reads H, V and KEEP in any order', () => {
    assert.deepEqual(flipArgsOf(''), { vertical: false, keep: false });
    assert.deepEqual(flipArgsOf('keep v'), { vertical: true, keep: true });
  });

  it('mirrors text in position: the text still reads left to right, unturned', () => {
    const line: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    const text: EntityShape = { type: 'text', p: { x: 1, y: 2 }, text: 'A', height: 0.5, rotation: 0 };
    select(editDrafts({ add: [newDraft('plan-1', '0', line), newDraft('plan-1', '0', text)] }));
    clearDraftHistory();
    startDraftCommand('flip', 'h');
    const flipped = drafts()[1].shape;
    assert.ok(flipped.type === 'text');
    assert.equal(flipped.rotation, 0, 'not drawn backwards');
    assert.equal(flipped.text, 'A');
    assert.ok(flipped.p.x > 8, `the text moved to the other side (${flipped.p.x})`);
    assert.equal(undoDrafts(), true);
    assert.equal(undoDrafts(), false, 'one step');
  });

  it('flips a section symbol whole, which stays its section\'s; typed FLIP V KEEP adds a plain copy', () => {
    startDraftCommand('sectionline');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 10, y: 0 }, TOL, false);
    clickDrawing({ x: 5, y: 3 }, TOL, false);
    const parts = drafts().length;
    const sections = useProjectStore.getState().views.filter((v) => v.kind === 'section').length;
    select(drafts().map((d) => d.id));
    const before = JSON.stringify(drafts().map((d) => d.shape));
    startDraftCommand('flip', 'v');
    assert.equal(drafts().length, parts, 'flipped in place, nothing added');
    assert.notEqual(JSON.stringify(drafts().map((d) => d.shape)), before);
    assert.ok(drafts().every((d) => d.params.sectionOf), 'every part still belongs to the section');
    assert.equal(useProjectStore.getState().views.filter((v) => v.kind === 'section').length, sections);
    select(drafts().map((d) => d.id));
    submitCommandLine('FLIP V KEEP', null);
    assert.equal(drafts().length, parts * 2);
    assert.equal(drafts().filter((d) => d.params.sectionOf).length, parts, 'the copy is plain drawing');
  });
});
