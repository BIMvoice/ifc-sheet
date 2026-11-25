/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Annotate the set" while a view's drawing is awaited (#869): Stop ends the run at once instead of after the view, the
 * panel says whose drawing is being made, and a drawing that never comes is skipped and named instead of holding up the
 * set. The timers are the test's: nothing here waits in real time.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { setLocale } from '@/i18n/registry';
import { useAnnotatePanel } from '@/annotate-set/store';
import { DRAWING_WAIT_MS, useDrawingDemand } from '@/annotate-set/drawing-demand';
import { WAIT_NOTICE_MS } from '@/annotate-set/annotate-set';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { useViewDrawings } from '@/project/view-drawings';
import type { ProjectLevel } from '@/project/types';
import { useViewerStore } from '@/store';
import { cleanup, click, render } from '@/test/render.js';
import { useWallNav } from '../wall/wall-nav';
import { AnnotateSet } from './AnnotateSet';

const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

beforeEach(() => {
  resetProject();
  act(() => setLocale('en'));
  useAnnotatePanel.setState({ on: { tagall: true, dimall: true, levelall: true }, running: null, summary: null, problem: null });
  // A model is loaded, so the run starts; no view's drawing host is mounted, so a drawing comes only when the test puts it there.
  useViewerStore.setState({ models: new Map([['m', {} as never]]) });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
  useProjectStore.setState({ levels: LEVELS, views: [...defaultViews(LEVELS, 1)], sheets: [{ id: 's', name: 'S', number: 'A-1', series: 'plans', viewports: [] } as never] });
});
afterEach(() => { cleanup(); useViewDrawings.setState({ byView: {} }); });

const buttonNamed = (ui: HTMLElement, text: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent === text && b.getAttribute('aria-pressed') === null);
const openPanel = (ui: HTMLElement) => click([...ui.querySelectorAll('button')].find((b) => b.getAttribute('aria-pressed') !== null)!);
/** Let promise callbacks run (no timer fires: the clock is mocked). */
const settle = () => act(async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); });
const annotated = () => useProjectStore.getState().views.filter((v) => v.kind !== '3d');

describe('Annotate the set, waiting for a drawing (#869)', () => {
  it('Stop while the first view\'s drawing is awaited ends the run at once, and the summary says it stopped after 0 of the views', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ui = render(<AnnotateSet />);
    openPanel(ui);
    click(buttonNamed(ui, 'Annotate the set')!);
    await settle();
    const first = annotated()[0];
    assert.equal(useAnnotatePanel.getState().running?.viewName, first.name, 'the run is on its first view');
    assert.ok(first.id in useDrawingDemand.getState().counts, 'and has asked for its drawing');

    // A few seconds in, the panel says whose drawing it is waiting for.
    assert.doesNotMatch(ui.textContent ?? '', /Waiting for the drawing/);
    act(() => t.mock.timers.tick(WAIT_NOTICE_MS));
    assert.match(ui.textContent ?? '', new RegExp(`Waiting for the drawing of ${first.name} to be made`));

    // Stop, and no clock moves: the run must end on the click, not when the wait gives up.
    click(buttonNamed(ui, 'Stop')!);
    await settle();
    const { running, summary } = useAnnotatePanel.getState();
    assert.equal(running, null, 'the run has ended');
    assert.equal(summary?.cancelled, true);
    assert.equal(summary?.views.length, 0, 'the view whose drawing was awaited is not reported as done');
    assert.match(ui.querySelector('[data-testid="annotate-summary"]')?.textContent ?? '', new RegExp(`Stopped after 0 of ${annotated().length} views`));
    assert.deepEqual(useDrawingDemand.getState().counts, {}, 'the drawings it asked for are let go');
    assert.equal(buttonNamed(ui, 'Stop'), undefined, 'Stop is gone with the run');
  });

  it('skips a view whose drawing never comes, names it in the summary, and annotates the rest', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const [first, ...rest] = annotated();
    assert.ok(rest.length >= 4, 'the default set has a plan and four elevations');
    // The others end at once (no geometry); the first one's drawing never arrives.
    useViewDrawings.setState({ byView: Object.fromEntries(rest.map((v) => [v.id, { drawing: null, status: 'error' as const, progress: 0, phase: '', error: 'no geometry' }])) });
    const ui = render(<AnnotateSet />);
    openPanel(ui);
    click(buttonNamed(ui, 'Annotate the set')!);
    await settle();
    assert.equal(useAnnotatePanel.getState().running?.viewName, first.name);

    act(() => t.mock.timers.tick(DRAWING_WAIT_MS));
    await settle();
    const { running, summary } = useAnnotatePanel.getState();
    assert.equal(running, null, 'the set went on past the view and finished');
    assert.equal(summary?.cancelled, false);
    assert.equal(summary?.views.length, rest.length + 1, 'every view is listed');
    const listed = [...ui.querySelectorAll('[data-testid="annotate-view"]')];
    const skipped = listed.find((el) => el.getAttribute('data-view') === first.id);
    assert.match(skipped?.textContent ?? '', new RegExp(`${first.name}Skipped: its drawing was not ready within ${Math.round(DRAWING_WAIT_MS / 1000)} s`));
  });
});
