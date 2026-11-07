/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Symbol tool card takes the size and rotation of the next symbol (#168). The tests read the placed symbol back
 * from the project's drafts, not the fields: what counts is what the command stored.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, patchDraftSettings, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session.js';
import { resolveEnglish as t } from '@/i18n/registry';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import { resetProject, useProjectStore } from '@/project/project-store';
import { cleanup, click, render, type } from '@/test/render.js';
import { ToolTypes } from './ToolTypes.js';

const drafts = () => useProjectStore.getState().drafts;
const place = (x: number, y: number) => clickDrawing({ x, y }, 0.05, false);
const placed = () => drafts().flatMap((d) => (d.shape.type === 'symbol' ? [{ scale: d.shape.scale, rotation: d.shape.rotation, factor: d.params.symbolScale }] : []));
const field = (ui: HTMLElement, label: string) => {
  const input = [...ui.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))?.querySelector('input');
  assert.ok(input, `a field named ${label}`);
  return input;
};
const prompt = () => {
  const p = runningCommand()?.prompt();
  assert.ok(p);
  return p.key;
};

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [] });
  patchDraftSettings({ symbolId: 'builtin:north-arrow', symbolScale: 1, symbolRotation: 0 });
  attachDraftingView('plan-1', 'down', () => []);
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
});

describe('the Symbol tool card fields (#168)', () => {
  it('sets Size 2 and Rotation 90, and the placed symbol is stored with scale 2 and 90 degrees', () => {
    const ui = render(<ToolTypes tool="symbol" />);
    startDraftCommand('symbol');
    type(field(ui, t('symbolTool.size')), '2');
    click(ui.querySelector(`button[aria-label="${t('symbolTool.rotationTo', { degrees: 90 })}"]`)!);
    place(10, 10);
    const [symbol] = placed();
    assert.equal(placed().length, 1);
    assert.equal(symbol?.factor, 2);
    assert.ok(Math.abs((symbol?.rotation ?? 0) - Math.PI / 2) < 1e-9, 'rotation is 90 degrees');
    assert.ok((symbol?.scale ?? 0) > 0);
  });

  it('a size changed between two placements gives two different sizes', () => {
    const ui = render(<ToolTypes tool="symbol" />);
    startDraftCommand('symbol');
    type(field(ui, t('symbolTool.size')), '2');
    place(10, 10);
    type(field(ui, t('symbolTool.size')), '3');
    place(20, 10);
    const sizes = placed();
    assert.deepEqual(sizes.map((s) => s.factor), [2, 3]);
    assert.notEqual(sizes[0]?.scale, sizes[1]?.scale);
  });

  it('typing the rotation in its field works as the quick buttons do, and a bad size is ignored', () => {
    const ui = render(<ToolTypes tool="symbol" />);
    startDraftCommand('symbol');
    type(field(ui, t('symbolTool.rotation')), '45');
    type(field(ui, t('symbolTool.size')), '-4');
    place(10, 10);
    const [symbol] = placed();
    assert.ok(Math.abs((symbol?.rotation ?? 0) - Math.PI / 4) < 1e-9);
    assert.equal(symbol?.factor, 1);
  });

  it('the prompt leaves out the S and R keys except in AutoCAD mode, where S and R still work', () => {
    startDraftCommand('symbol');
    assert.equal(prompt(), 'drafting.prompt.symbolPointFields');
    assert.ok(!t('drafting.prompt.symbolPointFields', { name: 'N', scale: 1, rotation: 0 }).includes('S size'));
    setAutocadMode(true);
    assert.equal(prompt(), 'drafting.prompt.symbolPoint');
    runningCommand()?.onKeyword?.('S');
    assert.equal(runningCommand()?.wantsValue?.(), true);
    runningCommand()?.onValue?.(5);
    place(10, 10);
    assert.equal(placed()[0]?.factor, 5);
  });
});
