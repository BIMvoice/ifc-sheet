/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "Annotate the set" always says what happened (#869): a run that throws ends with the error shown and no spinner; the intro's button with every command off says so. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { setLocale } from '@/i18n/registry';
import { useAnnotatePanel } from '@/annotate-set/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import { useWallNav } from './wall-nav';
import { WallIntro } from './WallIntro';

const extent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 8 } };
const annotateButton = (ui: HTMLElement): HTMLButtonElement => ui.querySelector<HTMLButtonElement>('[data-testid="intro-actions"] button')!;
const problemOf = (ui: HTMLElement): string => ui.querySelector('[data-testid="annotate-problem"]')?.textContent ?? '';

beforeEach(() => {
  resetProject();
  act(() => setLocale('en'));
  useViewerStore.setState({ models: new Map() });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
  useAnnotatePanel.setState({ on: { tagall: true, dimall: true, levelall: true }, running: null, summary: null, problem: null });
});
afterEach(() => { cleanup(); mock.restoreAll(); });

describe('Annotate the set says what happened (#869)', () => {
  it('shows the error of a run that throws, logs it, and leaves no run in progress', async () => {
    const logged = mock.method(console, 'error', () => undefined);
    // The set's views cannot be read: the run fails outside the per-command handling.
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => undefined} />);
    useProjectStore.setState({ views: new Proxy([], { get() { throw new Error('views unreadable'); } }) as never });
    click(annotateButton(ui));
    await waitFor(() => problemOf(ui) !== '', 'the intro says the run failed');
    assert.match(problemOf(ui), /views unreadable/);
    assert.equal(useAnnotatePanel.getState().running, null, 'no spinner is left');
    assert.ok(logged.mock.callCount() > 0, 'the error is logged');
  });

  it('says on the intro that no annotation is switched on, when every command is off', async () => {
    useAnnotatePanel.setState({ on: { tagall: false, dimall: false, levelall: false } });
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => undefined} />);
    click(annotateButton(ui));
    await waitFor(() => problemOf(ui) !== '', 'the intro says why nothing happened');
    assert.match(problemOf(ui), /No annotation is switched on/);
    assert.equal(useAnnotatePanel.getState().running, null);
  });
});
