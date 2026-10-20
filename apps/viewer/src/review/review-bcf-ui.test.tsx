/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readBCF } from '@ifc-lite/bcf';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import { CommentsSection } from '@/components/viewer/wall/CommentsSection.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { drawing, onElement, sheet } from '@/test/review-bcf-fixture';

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
