/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet } from '@/project/types';
import { fillNext, fillOrder, nextToFill, pendingViews, resetWallView, revealSheet, setWallLayout, sheetsToDraw, useWallView, type WallLayout } from './wall-view.js';

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

describe('the background fill', () => {
  const sheets = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, rect: { x: i * 1000, y: 0, w: 100, h: 100 } }));
  const layout: WallLayout = { sheets, viewport: { x: 1900, y: 0, w: 400, h: 300 }, content: { w: 4000, h: 300 } };

  it('orders every sheet, nearest the screen first', () => {
    assert.deepEqual(fillOrder(layout), ['c', 'd', 'b', 'a']);
  });

  it('drains to every sheet, one at a time, and then ends', () => {
    setWallLayout(layout);
    assert.deepEqual(useWallView.getState().queue, ['c'], 'only the near sheet at first');
    const taken: (string | null)[] = [];
    for (let i = 0; i < 6; i++) taken.push(fillNext());
    assert.deepEqual(taken, ['d', 'b', 'a', null, null, null]);
    assert.deepEqual(useWallView.getState().queue, ['c', 'd', 'b', 'a']);
  });

  it('skips sheets already queued', () => {
    assert.equal(nextToFill(['c', 'd', 'b'], ['c', 'b']), 'd');
    assert.equal(nextToFill(['c'], ['c']), null);
  });

  it('waits on queued sheets whose drawable views are not yet ready or failed', () => {
    const ss = [{ id: 's', number: 's', name: 's', viewports: [{ viewId: 'v1' }, { viewId: 'v2' }, { viewId: 'v3' }, { viewId: 'sched' }] }] as unknown as ProjectSheet[];
    const views = [{ id: 'v1', kind: 'plan' }, { id: 'v2', kind: 'plan' }, { id: 'v3', kind: 'plan' }] as never;
    const by = { v1: { status: 'ready' }, v2: { status: 'generating' } } as never;
    assert.deepEqual(pendingViews(['s'], ss, views, by), ['v2', 'v3']);
    assert.deepEqual(pendingViews([], ss, views, by), [], 'a sheet not queued is not waited for');
  });
});
