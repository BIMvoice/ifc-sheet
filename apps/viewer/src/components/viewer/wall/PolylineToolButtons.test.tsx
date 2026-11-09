/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Polyline tool card's Close and Undo last point buttons (#168). The tests read the stored polyline back from the
 * project's drafts, not the buttons: what counts is what the command kept.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, endCommand, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session.js';
import { resolveEnglish as t } from '@/i18n/registry';
import { resetProject, useProjectStore } from '@/project/project-store';
import { advance, cleanup, click, render } from '@/test/render.js';
import { InfoCard } from './InfoCard.js';

const polylines = () => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'polyline' ? [d.shape] : []));
const pick = (x: number, y: number) => clickDrawing({ x, y }, 0.05, false);
const button = (ui: HTMLElement, label: string) => {
  const b = [...ui.querySelectorAll('button')].find((x) => x.textContent === label);
  assert.ok(b, `a button named ${label}`);
  return b;
};

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [] });
  attachDraftingView('plan-1', 'down', () => []);
});
afterEach(() => {
  cleanup();
  cancelCommand();
});

describe('the Polyline tool card buttons (#168)', () => {
  it('Close ends the tool and stores the polyline closed', async () => {
    const ui = render(<InfoCard tool="polyline" onDone={endCommand} />);
    startDraftCommand('polyline');
    assert.equal(button(ui, t('polylineCard.close')).disabled, true, 'nothing to close before the first point');
    pick(0, 0);
    pick(10, 0);
    pick(10, 10);
    await advance(0);
    click(button(ui, t('polylineCard.close')));
    assert.equal(runningCommand(), null);
    assert.equal(polylines().length, 1);
    assert.equal(polylines()[0]?.closed, true);
    assert.equal(polylines()[0]?.pts.length, 3);
  });

  it('Undo last point takes back the last click, and the tool keeps running', async () => {
    const ui = render(<InfoCard tool="polyline" onDone={endCommand} />);
    startDraftCommand('polyline');
    pick(0, 0);
    pick(10, 0);
    pick(10, 10);
    await advance(0);
    click(button(ui, t('polylineCard.undo')));
    assert.ok(runningCommand(), 'the tool still runs');
    pick(0, 10);
    assert.equal(polylines().length, 0, 'not stored until the tool finishes');
    click(button(ui, t('wall.tool.done')));
    assert.equal(polylines().length, 1);
    assert.deepEqual(polylines()[0]?.pts, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]);
    assert.equal(polylines()[0]?.closed, false);
  });
});
