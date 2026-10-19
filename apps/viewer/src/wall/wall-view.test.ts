/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet } from '@/project/types';
import { resetWallView, revealSheet, setWallLayout, sheetsToDraw, useWallView, type WallLayout } from './wall-view.js';

const sheet = (id: string): ProjectSheet => ({ id, number: id, name: id, viewports: [] }) as unknown as ProjectSheet;
const SHEETS = ['a', 'b', 'c', 'd'].map(sheet);
const ids = (xs: ProjectSheet[]) => xs.map((s) => s.id);

afterEach(() => resetWallView());

describe('sheetsToDraw', () => {
  it('draws nothing from the Wall until a sheet comes near, but always the open tabs', () => {
    assert.deepEqual(ids(sheetsToDraw(SHEETS, { wall: true, queue: [], stepped: null, open: [] })), []);
    assert.deepEqual(ids(sheetsToDraw(SHEETS, { wall: false, queue: ['a'], stepped: null, open: ['c'] })), ['c']);
  });

  it('draws the queue nearest first, the stepped-into sheet, and the open ones', () => {
    assert.deepEqual(ids(sheetsToDraw(SHEETS, { wall: true, queue: ['d', 'b'], stepped: 'a', open: ['c'] })), ['c', 'a', 'd', 'b']);
  });

  it('does not repeat a sheet and skips ids that are no longer sheets', () => {
    assert.deepEqual(ids(sheetsToDraw(SHEETS, { wall: true, queue: ['b', 'gone', 'b'], stepped: 'b', open: ['b'] })), ['b']);
  });
});

describe('the Wall view', () => {
  const layout = (x: number): WallLayout => ({
    sheets: [{ id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 } }, { id: 'b', rect: { x: 5000, y: 0, w: 100, h: 100 } }],
    viewport: { x, y: 0, w: 400, h: 300 },
    content: { w: 5100, h: 300 },
  });

  it('keeps the drawings of sheets that scrolled away, behind the near ones', () => {
    setWallLayout(layout(0));
    assert.deepEqual(useWallView.getState().near, ['a']);
    setWallLayout(layout(4900));
    const s = useWallView.getState();
    assert.deepEqual(s.near, ['b']);
    assert.deepEqual(s.queue, ['b', 'a']);
  });

  it('does not change the near list or the queue when the screen moves but the sheets near stay the same', () => {
    setWallLayout(layout(0));
    const before = useWallView.getState();
    setWallLayout(layout(10));
    assert.equal(useWallView.getState().near, before.near);
    assert.equal(useWallView.getState().queue, before.queue);
  });

  it('asks to scroll to the middle of a sheet and flashes it', () => {
    setWallLayout(layout(0));
    revealSheet('b');
    const s = useWallView.getState();
    assert.deepEqual(s.scroll?.to, { x: 5050, y: 50 });
    assert.equal(s.highlight, 'b');
  });
});
