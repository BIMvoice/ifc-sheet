/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The notice that drawings are being made slowly (#863): it shows while views
 * are drawn on the main thread because the worker could not be used, and goes
 * when the last of them is drawn. Driven through the real fallback queue.
 */

import '@/test/setup-dom.js';

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSectionConfig, type Drawing2D } from '@ifc-lite/drawing-2d';
import { render, cleanup, waitFor } from '@/test/render.js';
import { Toaster } from '@/components/ui/toast';
import { __setMainThreadRunnerForTest, drawOnMainThread } from '@/lib/drawing/generation/main-thread-fallback';
import { useMainThreadDrawingNotice } from './useMainThreadDrawingNotice';

function Host(): null {
  useMainThreadDrawingNotice();
  return null;
}

const job = {
  meshes: [], config: createSectionConfig('y', 0.5),
  options: { includeHiddenLines: false, includeProjection: false, includeEdges: false, mergeLines: false, outline: false },
};
const notice = (): boolean => /Drawings are being made slowly/.test(document.body.textContent ?? '');

afterEach(() => {
  cleanup();
  __setMainThreadRunnerForTest(null);
});

describe('drawings made on the main thread are announced (#863)', () => {
  it('the notice shows while views wait for the main thread and goes when the last is drawn', async () => {
    render(<><Host /><Toaster /></>);
    assert.equal(notice(), false, 'nothing to say while the worker draws');
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    __setMainThreadRunnerForTest(async () => { await held; return { lines: [], cutPolygons: [], projectionPolygons: [] } as unknown as Drawing2D; });
    const views = [drawOnMainThread(job, undefined), drawOnMainThread(job, undefined)];
    await waitFor(notice, 'the notice appears while two views wait for the main thread');
    release();
    await Promise.all(views);
    await waitFor(() => !notice(), 'the notice goes once both views are drawn');
  });
});
