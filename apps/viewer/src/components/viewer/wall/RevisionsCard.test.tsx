/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #133 review: removing a revision takes its clouds on every sheet, so the card asks first, and one Undo brings both back. */

import '@/test/setup-dom.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { render, click, cleanup } from '@/test/render.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { cloudRevisionId, REVISION_ID_PARAM } from '@/project/revisions';
import type { ProjectSheet } from '@/project/types';
import { cloudDraft } from '@/whatchanged/cloud';
import { RevisionsCard } from './RevisionsCard';

const sheet: ProjectSheet = { id: 's101', number: 'A-101', name: 'Plan', createdAt: 0, viewports: [], revisionIds: ['rev-a'] };
const BOX = { x0: 10, y0: 10, x1: 60, y1: 40 };

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({
    sheets: [sheet],
    revisions: [
      { id: 'rev-a', code: 'A', date: '2026-09-01', description: 'First issue', by: 'PC' },
      { id: 'rev-b', code: 'B', date: '2026-10-12', description: 'Walls moved', by: 'IC' },
    ],
    drafts: [cloudDraft('s101', BOX, 1, { [REVISION_ID_PARAM]: 'rev-b' }), cloudDraft('s201', BOX, 1, { [REVISION_ID_PARAM]: 'rev-b' })],
  });
});
afterEach(cleanup);

const button = (ui: HTMLElement, text: string): HTMLButtonElement => {
  const all = [...ui.querySelectorAll('button')].filter((b) => b.textContent === text);
  assert.ok(all.length > 0, `a "${text}" button`);
  return all.at(-1) as HTMLButtonElement;
};
const codes = () => useProjectStore.getState().revisions?.map((r) => r.code);

describe('removing a revision from its card (#133 review)', () => {
  it('asks first, saying how many clouds go, and keeps everything when the answer is no', () => {
    const ui = render(<RevisionsCard sheet={sheet} onClose={() => {}} />);
    click(button(ui, 'Remove this revision and its clouds'));
    assert.deepEqual(codes(), ['A', 'B']);
    assert.match(ui.textContent ?? '', /Remove revision B and its 2 clouds/);
    click(button(ui, 'Keep it'));
    assert.deepEqual(codes(), ['A', 'B']);
    assert.equal(useProjectStore.getState().drafts.length, 2);
  });

  it('removes record and clouds on yes, and one Undo restores both', () => {
    const ui = render(<RevisionsCard sheet={sheet} onClose={() => {}} />);
    click(button(ui, 'Remove this revision and its clouds'));
    click(button(ui, 'Remove'));
    assert.deepEqual(codes(), ['A']);
    assert.equal(useProjectStore.getState().drafts.length, 0);
    assert.ok(undoDrafts());
    assert.deepEqual(codes(), ['A', 'B']);
    assert.deepEqual(useProjectStore.getState().drafts.map(cloudRevisionId), ['rev-b', 'rev-b']);
  });
});
