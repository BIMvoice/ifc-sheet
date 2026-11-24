/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The intro offers the two steps to a finished set where the set arrives: annotate it, and issue it as PDF. Each button
 * runs the header's own action and says what came of it under the buttons; Enter on a button stays that button's and
 * does not hang the set.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render, waitFor } from '@/test/render.js';
import { useAnnotatePanel } from '@/annotate-set/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { WallIntro } from './WallIntro';

const extent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 8 } };
const actions = (ui: HTMLElement): HTMLButtonElement[] => [...ui.querySelectorAll<HTMLButtonElement>('[data-testid="intro-actions"] button')];
const said = (ui: HTMLElement): string => ui.querySelector('[data-testid="intro-actions"] output')?.textContent ?? '';

beforeEach(() => {
  resetProject();
  useViewerStore.setState({ models: new Map() });
  useAnnotatePanel.setState({ running: null, summary: null });
});
afterEach(() => cleanup());

describe('the intro\'s shortcuts to a finished set', () => {
  it('annotates the set in one click and says what came of it', async () => {
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => undefined} />);
    assert.equal(said(ui), '', 'nothing is said before a click');
    click(actions(ui)[0]);
    await waitFor(() => useAnnotatePanel.getState().summary !== null, 'the annotate run ends with a summary');
    assert.match(said(ui), /Nothing to add/, 'a project with no drawings has nothing to annotate, and says so');
  });

  it('issues the set as PDF in one click and reports the issue under the buttons', async () => {
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => undefined} />);
    const before = useProjectStore.getState().issues?.length ?? 0;
    click(actions(ui)[1]);
    await waitFor(() => said(ui) !== '', 'the issue says what it did');
    assert.equal(useProjectStore.getState().issues?.length ?? 0, before, 'a project with no sheets records no issue');
    assert.ok(said(ui).length > 0, 'and the reason is said');
  });

  it('keeps Enter on a shortcut for that shortcut: the set is not hung', () => {
    let hung = 0;
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => { hung++; }} />);
    press(actions(ui)[0], 'Enter');
    assert.equal(hung, 0);
    press(window, 'Enter');
    assert.equal(hung, 1, 'Enter anywhere else still hangs it');
  });
});
