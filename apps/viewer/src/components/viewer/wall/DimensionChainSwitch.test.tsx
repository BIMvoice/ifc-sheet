/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Dimension tool card's Chain switch (#168). The tests read the stored dimensions back from the project's drafts:
 * what counts is what the tool kept after the clicks, not the switch's look.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, endCommand, patchDraftSettings, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session.js';
import { resolveEnglish as t } from '@/i18n/registry';
import { resetProject, useProjectStore } from '@/project/project-store';
import { cleanup, click, render } from '@/test/render.js';
import { InfoCard } from './InfoCard.js';

const dimensions = () => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'dimension' ? [d.shape] : []));
const pick = (x: number, y: number) => clickDrawing({ x, y }, 0.05, false);
const chainSwitch = (ui: HTMLElement) => {
  const box = [...ui.querySelectorAll('input[type="checkbox"]')].find((x) => x.closest('label')?.textContent === t('dimensionChain.label'));
  assert.ok(box instanceof HTMLInputElement, 'the Chain switch on the card');
  return box;
};

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [] });
  attachDraftingView('plan-1', 'down', () => []);
  patchDraftSettings({ dimContinuous: true });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  patchDraftSettings({ dimContinuous: true });
});

describe('the Dimension tool card Chain switch (#168)', () => {
  it('on: a third point adds a second dimension that starts where the first ended', () => {
    const ui = render(<InfoCard tool="dimaligned" onDone={endCommand} />);
    assert.equal(chainSwitch(ui).checked, true, 'chaining is the default');
    startDraftCommand('dimaligned');
    pick(0, 0);
    pick(10, 0);
    pick(5, 3);
    pick(20, 0);
    assert.ok(runningCommand(), 'the tool keeps running');
    const found = dimensions();
    assert.equal(found.length, 2);
    assert.deepEqual(found[1]?.a, found[0]?.b, 'the second dimension continues from the first end');
    assert.deepEqual(found[1]?.b, { x: 20, y: 0 });
  });

  it('turned off on the card: the tool ends after one dimension, and the next run starts a separate one', () => {
    const ui = render(<InfoCard tool="dimaligned" onDone={endCommand} />);
    click(chainSwitch(ui));
    assert.equal(chainSwitch(ui).checked, false);
    startDraftCommand('dimaligned');
    pick(0, 0);
    pick(10, 0);
    pick(5, 3);
    assert.equal(runningCommand(), null, 'one dimension, then the tool is done');
    assert.equal(dimensions().length, 1);
    startDraftCommand('dimaligned');
    pick(0, 5);
    pick(10, 5);
    pick(5, 8);
    assert.equal(dimensions().length, 2);
    assert.deepEqual(dimensions()[1]?.a, { x: 0, y: 5 }, 'a new dimension, not a continuation');
  });

  it('turned back on, the tool chains again', () => {
    const ui = render(<InfoCard tool="dimaligned" onDone={endCommand} />);
    click(chainSwitch(ui));
    click(chainSwitch(ui));
    startDraftCommand('dimaligned');
    pick(0, 0);
    pick(10, 0);
    pick(5, 3);
    assert.ok(runningCommand(), 'chaining again');
  });
});
