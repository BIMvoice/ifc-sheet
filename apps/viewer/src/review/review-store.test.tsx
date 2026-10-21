/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { loadProjectDocument, projectDocument, removeProjectItem, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { WallGrid } from '@/components/viewer/wall/WallGrid.js';
import { CommentsSection } from '@/components/viewer/wall/CommentsSection.js';
import { addComment, openCount, removeComment, replyToComment, setCommentStatus } from './actions';
import { setHighlight, useReviewUi } from './ui-store';

/**
 * Review on the Wall (#55): a comment pinned on A-101 is an open mark on its
 * card; marking it done takes the mark away; it all survives save and reopen.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [
  { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] },
  { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] },
];

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
  useReviewUi.setState({ placing: false, highlight: null });
});
afterEach(() => cleanup());

const sheetNumbered = (n: string) => {
  const s = useProjectStore.getState().sheets.find((x) => x.number === n);
  assert.ok(s, n);
  return s;
};
const cardOf = (ui: HTMLElement, n: string) => {
  const button = [...ui.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${n} `));
  assert.ok(button, `card ${n}`);
  const figure = button.closest('figure');
  assert.ok(figure);
  return figure;
};
const marks = (el: Element) => el.querySelectorAll('[data-comment-mark]').length;
const reopen = () => {
  const text = serializeProject(projectDocument());
  resetProject();
  loadProjectDocument(parseProjectFile(text));
};

describe('comments on the Wall', () => {
  it('shows a comment pinned on A-101 as an open mark on its card, and marking it done takes the mark away', () => {
    const a101 = sheetNumbered('A-101');
    const id = addComment({ sheetId: a101.id, x: 100, y: 80, author: 'Ana', text: 'Cota lipsă' });
    const ui = render(<WallGrid extent={HOUSE} onStep={() => {}} />);
    assert.equal(marks(cardOf(ui, 'A-101')), 1);
    assert.match(cardOf(ui, 'A-101').querySelector('output')?.getAttribute('aria-label') ?? '', /A-101.*: 1$/);
    assert.equal(marks(cardOf(ui, 'A-201')), 0, 'another sheet carries no mark');
    act(() => setCommentStatus(id, 'done'));
    assert.equal(marks(cardOf(ui, 'A-101')), 0);
    assert.equal(cardOf(ui, 'A-101').querySelector('output'), null, 'no badge either');
    act(() => setCommentStatus(id, 'open'));
    assert.equal(marks(cardOf(ui, 'A-101')), 1);
  });

  it('survives save and reopen, open or done', () => {
    const a101 = sheetNumbered('A-101');
    const open = addComment({ sheetId: a101.id, x: 10, y: 20, author: 'Ana', text: 'Open one' });
    const done = addComment({ sheetId: a101.id, x: 30, y: 40, author: 'Ana', text: 'Done one' });
    setCommentStatus(done, 'done');
    reopen();
    const comments = useProjectStore.getState().comments ?? [];
    assert.deepEqual(comments.map((c) => [c.id, c.status]), [[open, 'open'], [done, 'done']]);
    const ui = render(<WallGrid extent={HOUSE} onStep={() => {}} />);
    assert.equal(marks(cardOf(ui, 'A-101')), 1, 'the open one marks the card after reopening, the done one does not');
  });

  it('keeps Romanian text and replies exactly through save and reopen', () => {
    const a101 = sheetNumbered('A-101');
    const id = addComment({ sheetId: a101.id, x: 1, y: 2, author: 'Ștefan Țurcanu', text: 'Cotă lipsă la ușa de la parter, șapă și țeavă' });
    replyToComment(id, 'Ioana Pătrașcu', 'Adăugată în planul ăsta');
    reopen();
    const c = useProjectStore.getState().comments?.[0];
    assert.equal(c?.author, 'Ștefan Țurcanu');
    assert.equal(c?.text, 'Cotă lipsă la ușa de la parter, șapă și țeavă');
    assert.deepEqual(c?.replies.map((r) => [r.author, r.text]), [['Ioana Pătrașcu', 'Adăugată în planul ăsta']]);
  });

  it('deleting a sheet takes its comments, and an empty reply is not added', () => {
    const a101 = sheetNumbered('A-101');
    const a201 = sheetNumbered('A-201');
    const keep = addComment({ sheetId: a201.id, x: 1, y: 1, author: 'a', text: 'stays' });
    const gone = addComment({ sheetId: a101.id, x: 1, y: 1, author: 'a', text: 'goes' });
    replyToComment(keep, 'a', '   ');
    assert.equal(useProjectStore.getState().comments?.find((c) => c.id === keep)?.replies.length, 0);
    removeProjectItem(a101.id);
    assert.deepEqual(useProjectStore.getState().comments?.map((c) => c.id), [keep]);
    removeComment(keep);
    assert.deepEqual(useProjectStore.getState().comments, []);
    assert.ok(gone);
  });
});

describe('the list of open comments', () => {
  it('counts open comments per sheet and for the set, closes, reopens, and steps into the sheet', () => {
    const a101 = sheetNumbered('A-101');
    const a201 = sheetNumbered('A-201');
    const one = addComment({ sheetId: a101.id, x: 1, y: 1, author: 'a', text: 'first on 101' });
    addComment({ sheetId: a101.id, x: 2, y: 2, author: 'a', text: 'second on 101' });
    addComment({ sheetId: a201.id, x: 3, y: 3, author: 'a', text: 'only on 102' });
    const went: string[] = [];
    const ui = render(<CommentsSection onGo={(id) => went.push(id)} />);
    const total = () => ui.querySelector('[data-open-total]')?.textContent;
    const rowCount = (sheetId: string) => ui.querySelector(`[data-review-sheet="${sheetId}"]`)?.textContent ?? '';
    assert.equal(total(), '3');
    assert.match(rowCount(a101.id), /A-101\s*2 open/);
    assert.match(rowCount(a201.id), /A-201\s*1 open/);
    click([...ui.querySelectorAll('button')].find((b) => b.textContent === 'first on 101')!);
    assert.deepEqual(went, [a101.id]);
    assert.equal(useReviewUi.getState().highlight, one);
    click(ui.querySelector(`[data-review-sheet="${a101.id}"] li button:last-child`)!);
    assert.equal(total(), '2');
    assert.match(rowCount(a101.id), /A-101\s*1 open/);
    assert.ok(!rowCount(a101.id).includes('first on 101'), 'a done comment leaves the open list');
    click([...ui.querySelectorAll('button')].find((b) => b.textContent === 'Show done')!);
    assert.ok(rowCount(a101.id).includes('first on 101'));
    click([...ui.querySelectorAll(`[data-review-sheet="${a101.id}"] li button`)].find((b) => b.textContent === 'Reopen')!);
    assert.equal(total(), '3');
    assert.equal(openCount(useProjectStore.getState().comments ?? []), 3);
    assert.equal(openCount(useProjectStore.getState().comments ?? [], a201.id), 1);
    act(() => setHighlight(null));
  });
});
