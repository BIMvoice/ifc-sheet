/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The section symbol under edits: its parts select, erase and stay together
 * as one thing; it moves and turns whole, and its section's cut plane follows
 * it (`section-link.ts`); a copy is plain drawing and does not claim to be
 * the section.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { clearDraftHistory } from './draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, pressEnter, setWorkPlaneProvider, startDraftCommand, submitCommandLine, useDraftingSession, windowSelect } from './session.js';
import { isSectionSymbol } from './section-symbol.js';

const TOL = 0.05;
const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };

function drawSection(y = 0): void {
  startDraftCommand('sectionline');
  clickDrawing({ x: 0, y }, TOL, false);
  clickDrawing({ x: 10, y }, TOL, false);
  clickDrawing({ x: 5, y: y + 3 }, TOL, false);
}
const drafts = () => useProjectStore.getState().drafts;
const sections = () => useProjectStore.getState().views.filter((v) => v.kind === 'section');
const selection = () => [...useDraftingSession.getState().selection];

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
});

describe('section symbol as one thing', () => {
  it('selects every part when one is clicked, and by window', () => {
    drawSection();
    drawSection(20);
    const parts = drafts().filter((d) => d.params.sectionOf === sections()[0].id).length;
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    assert.equal(selection().length, parts);
    windowSelect({ x: -1, y: -1 }, { x: 11, y: 0.1 }, true, false);
    assert.equal(selection().length, parts, 'a crossing window touching one part takes them all, and not the other section');
  });

  it('erases every part with one erase', () => {
    drawSection();
    drawSection(20);
    const other = drafts().filter((d) => d.params.sectionOf === sections()[1].id).length;
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    startDraftCommand('erase');
    pressEnter();
    assert.equal(drafts().length, other);
    assert.equal(sections().length, 2, 'the section view itself stays');
  });

  it('erases every part even when only one was in the selection', () => {
    drawSection();
    const one = drafts()[0].id;
    useDraftingSession.setState({ selection: new Set([one]) });
    startDraftCommand('erase');
    pressEnter();
    assert.equal(drafts().length, 0);
  });
});

describe('section symbol moves whole, its section with it (section-link.ts)', () => {
  const symbol = () => drafts().filter((d) => d.params.sectionOf);

  it('moves and rotates every part together; mirror-and-erase keeps the original', () => {
    drawSection();
    const count = symbol().length;
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    startDraftCommand('move');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 0, y: 4 }, TOL, false);
    const cut = symbol()[0].shape;
    assert.ok(cut.type === 'line' && cut.a.y === 4 && cut.b.y === 4, 'the cut line moved');
    assert.equal(symbol().length, count, 'no part left behind');
    const snapshot = JSON.stringify(symbol().map((d) => d.shape));
    clickDrawing({ x: 5, y: 4 }, TOL, false);
    startDraftCommand('mirror');
    submitCommandLine('E', null);
    clickDrawing({ x: 0, y: 10 }, TOL, false);
    clickDrawing({ x: 1, y: 10 }, TOL, false);
    assert.equal(JSON.stringify(symbol().map((d) => d.shape)), snapshot, 'mirror with erase keeps the original');
  });

  it('moves the free shapes of a mixed selection together with the symbol', () => {
    drawSection();
    startDraftCommand('line');
    clickDrawing({ x: 0, y: 50 }, TOL, false);
    clickDrawing({ x: 4, y: 50 }, TOL, false);
    cancelCommand();
    const free = drafts().find((d) => !d.params.sectionOf);
    assert.ok(free);
    useDraftingSession.setState({ selection: new Set(drafts().map((d) => d.id)) });
    startDraftCommand('move');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 1, y: 0 }, TOL, false);
    const moved = drafts().find((d) => d.id === free.id)?.shape;
    assert.ok(moved?.type === 'line' && moved.a.x === 1);
    const cut = symbol()[0].shape;
    assert.ok(cut.type === 'line' && cut.a.x === 1);
  });

  it('is recognised as a symbol of a live section', () => {
    drawSection();
    assert.ok(drafts().every((d) => isSectionSymbol(d, useProjectStore.getState().views)));
  });
});

describe('a copy of a section symbol', () => {
  it('is plain drawing: it does not claim to be the section', () => {
    drawSection();
    const originals = drafts().length;
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    startDraftCommand('copy');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 0, y: 30 }, TOL, false);
    pressEnter();
    assert.equal(drafts().length, originals * 2);
    assert.equal(drafts().filter((d) => d.params.sectionOf).length, originals);
    assert.equal(sections().length, 1);
  });

  it('mirrored copy is plain too, and a plain copy is not locked', () => {
    drawSection();
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    startDraftCommand('mirror');
    clickDrawing({ x: 0, y: 10 }, TOL, false);
    clickDrawing({ x: 10, y: 10 }, TOL, false);
    const plain = drafts().filter((d) => !d.params.sectionOf);
    assert.ok(plain.length > 0);
    assert.equal(drafts().filter((d) => d.params.sectionOf).length, plain.length);
  });
});
