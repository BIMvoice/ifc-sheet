/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createBCFComment, readBCF, writeBCF } from '@ifc-lite/bcf';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import { CommentsSection } from '@/components/viewer/wall/CommentsSection.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { commentsToBcf, withBcfGuids } from '@/review/bcf';
import { drawing, drawingOf, onElement, sheet } from '@/test/review-bcf-fixture';

/**
 * The drawer's BCF export, as a reviewer uses it (PR #127 review): the file it
 * downloads is caught where the browser would save it.
 */

const saved: Blob[] = [];
const realCreate = URL.createObjectURL;
beforeEach(() => {
  saved.length = 0;
  URL.createObjectURL = (b: Blob | MediaSource) => {
    if (b instanceof Blob) saved.push(b);
    return 'blob:test';
  };
  resetProject();
  useProjectStore.setState({ name: 'Casa', sheets: [sheet], comments: [onElement] });
  useViewDrawings.setState({ byView: { p: { ...EMPTY_VIEW_DRAWING, drawing, status: 'ready' } } });
});
afterEach(() => {
  URL.createObjectURL = realCreate;
  useViewDrawings.setState({ byView: {} });
  cleanup();
});

const button = (ui: HTMLElement, text: string) => {
  const b = [...ui.querySelectorAll('button')].find((x) => x.textContent === text);
  assert.ok(b, text);
  return b;
};

describe('exporting BCF from the drawer', () => {
  it('keeps the GUIDs it sent in the project, and sends them again next time (item 1)', async () => {
    const ui = render(<CommentsSection onGo={() => {}} />);
    click(button(ui, 'Export BCF'));
    await waitFor(() => saved.length === 1, 'the first file');
    const kept = useProjectStore.getState().comments?.[0];
    assert.ok(kept?.bcfGuid, 'the topic GUID is in the project, to be saved with it');
    assert.equal(useProjectStore.getState().dirty, true);
    click(button(ui, 'Export BCF'));
    await waitFor(() => saved.length === 2, 'the second file');
    const [a, b] = await Promise.all(saved.map((f) => readBCF(f)));
    assert.deepEqual([...a.topics.keys()], [kept.bcfGuid]);
    assert.deepEqual([...b.topics.keys()], [kept.bcfGuid]);
    assert.equal(useProjectStore.getState().comments?.[0].bcfGuid, kept.bcfGuid);
  });
});

const choose = async (ui: HTMLElement, file: Blob) => {
  const input = ui.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input);
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([file], 'review.bcfzip')] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
};

describe('importing BCF in the drawer', () => {
  it('puts a reply and a Closed status from another tool into the comment, without a second comment (item 2)', async () => {
    const ours = withBcfGuids([onElement]).comments;
    useProjectStore.setState({ comments: ours });
    const elsewhere = await readBCF(await writeBCF(commentsToBcf(ours, { sheets: [sheet], drawingOf })));
    const topic = [...elsewhere.topics.values()][0];
    topic.comments.push(createBCFComment({ author: 'Mihai Pop', comment: 'Rezolvat' }));
    topic.topicStatus = 'Closed';
    const file = await writeBCF(elsewhere);
    const ui = render(<CommentsSection onGo={() => {}} />);
    await choose(ui, file);
    await waitFor(() => (useProjectStore.getState().comments?.[0].replies.length ?? 0) === 2, 'the reply from the other tool');
    const comments = useProjectStore.getState().comments ?? [];
    assert.equal(comments.length, 1);
    assert.equal(comments[0].status, 'done');
    assert.match(ui.querySelector('output')?.textContent ?? '', /0 topics became comments and 1 brought replies/);
  });
});
