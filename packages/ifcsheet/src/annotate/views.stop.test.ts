/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stopping "Annotate the set" (#869): the run's signal reaches the wait for a view's drawing, so Stop ends the run while
 * a drawing is awaited instead of after it comes; between two commands it ends the run after the command that ran. A
 * drawing that did not come in time is said as such.
 */

import { describe, expect, it } from 'vitest';
import { annotateViews, type AnnotateReaders, type AnnotateView, type DrawingResult } from './views.js';
import { ALL_CHOICES } from './choices.js';

// A detail plan: TAGALL finds no label types and DIMALL is not for a detail, so neither reads a real drawing.
const views: AnnotateView[] = [{ id: 'a', name: 'A', kind: 'plan', detail: true }, { id: 'b', name: 'B', kind: 'plan', detail: true }];
const unread = () => { throw new Error('not read'); };
const readers: AnnotateReaders<AnnotateView, string> = { draftsOf: () => [], dimall: unread, tagall: () => null, levelall: unread };
const run = (rest: { drawingOf: (v: AnnotateView, signal?: AbortSignal) => Promise<DrawingResult<string>>; signal: AbortSignal; pause?: () => Promise<void> }) =>
  annotateViews({ views, choices: ALL_CHOICES, readers, newId: () => 'd', locale: 'en', ...rest });

describe('stopping annotateViews (#869)', () => {
  it('ends while a drawing is awaited: the wait is given the signal, and the view is not reported as done', async () => {
    const stop = new AbortController();
    const asked: string[] = [];
    const result = run({
      signal: stop.signal,
      // A drawing that never comes, except that it gives up when the run is stopped.
      drawingOf: (view, signal) => {
        asked.push(view.id);
        return new Promise((resolve) => signal?.addEventListener('abort', () => resolve({ drawing: null, error: 'stopped' })));
      },
    });
    await Promise.resolve();
    stop.abort();
    const { summary } = await result;
    expect(asked).toEqual(['a']);
    expect(summary).toMatchObject({ cancelled: true, total: 2, views: [] });
  });

  it('ends between two commands, keeping what the first said', async () => {
    const stop = new AbortController();
    const { summary } = await run({ signal: stop.signal, drawingOf: async () => ({ drawing: 'drawing' }), pause: async () => { stop.abort(); } });
    expect(summary.cancelled).toBe(true);
    expect(summary.views.map((v) => [v.viewId, v.results.map((r) => r.command)])).toEqual([['a', ['tagall']]]);
  });

  it('says a drawing that did not come in time, in seconds', async () => {
    const { summary } = await run({ signal: new AbortController().signal, drawingOf: async () => ({ drawing: null, error: 'timeout', timedOutMs: 90_000 }) });
    expect(summary.views[0]?.skipped).toEqual({ key: 'wall.annotateWait.timedOut', params: { seconds: 90 } });
  });
});
