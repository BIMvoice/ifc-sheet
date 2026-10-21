/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PTEXT (#143): text whose words may name title block parameters, `{Phase}`.
 * It is for a sheet's paper: only the sheet resolves the names, so anywhere
 * else the command declines instead of leaving text that prints its braces.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addProjectSheet, resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { isParametricText } from '@/project/parametric-text';
import { draftCommandByName } from './registry.js';
import { pTextCommand } from './ptext.js';

const said: string[] = [];

function context(viewId: string): Parameters<typeof pTextCommand.create>[0] {
  return {
    viewId,
    layerId: '0',
    settings: { textHeight: 3.5, currentTextStyle: 'Standard', currentDimStyle: 'Standard' },
    say: (key: string) => { said.push(key); },
  } as unknown as Parameters<typeof pTextCommand.create>[0];
}

beforeEach(() => { resetProject(); clearDraftHistory(); said.length = 0; });
afterEach(() => resetProject());

describe('PTEXT (#143)', () => {
  it('is reached by its names on the command line', () => {
    assert.equal(draftCommandByName('PTEXT'), pTextCommand);
    assert.equal(draftCommandByName('paramtext'), pTextCommand);
  });

  it('places a text on a sheet, marked parametric, with the words as typed', () => {
    const sheetId = addProjectSheet('Plans', 'plans');
    const run = pTextCommand.create(context(sheetId));
    assert.equal(run.wantsText?.(), false);
    run.onPoint?.({ x: 30, y: 40 });
    assert.equal(run.wantsText?.(), true);
    assert.equal(run.onText?.('Phase: {Phase}'), 'done');
    const drafted = useProjectStore.getState().drafts;
    assert.equal(drafted.length, 1);
    const d = drafted[0];
    assert.ok(d && isParametricText(d));
    assert.equal(d.viewId, sheetId);
    assert.deepEqual(d.shape.type === 'text' ? [d.shape.text, d.shape.p] : null, ['Phase: {Phase}', { x: 30, y: 40 }]);
  });

  it('declines on a drawing: nothing is drafted and the user is told', () => {
    addProjectSheet('Plans', 'plans');
    const run = pTextCommand.create(context('view-not-a-sheet'));
    assert.equal(run.onPoint?.({ x: 1, y: 1 }), 'done');
    assert.equal(useProjectStore.getState().drafts.length, 0);
    assert.deepEqual(said, ['tbparams.text.sheetOnly']);
  });

  it('places nothing for empty words', () => {
    const sheetId = addProjectSheet('Plans', 'plans');
    const run = pTextCommand.create(context(sheetId));
    run.onPoint?.({ x: 1, y: 1 });
    run.onText?.('');
    assert.equal(useProjectStore.getState().drafts.length, 0);
  });
});
