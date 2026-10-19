/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render, type as typeInto } from '@/test/render.js';
import { addProjectSheet, resetProject, setSheetNumber, useProjectStore } from '@/project/project-store';
import { resetWallView, sheetsToDraw, useWallView } from '@/wall/wall-view';
import { attachDraftingView, cancelCommand, runningCommand, startDraftCommand } from '@/drafting/session';
import { WallGrid } from './WallGrid.js';

/**
 * The Wall with a large set: sheets away from the screen hang as outlines and
 * are not drawn, the search box and the corner map move the screen, and typing
 * in the search box is not a Wall shortcut. happy-dom has no layout, so the
 * rectangles below stand in for one: sheet i lies at x = 32 + 400 i, 340 wide,
 * on a screen 1000 px wide.
 */

const SHEETS = 10;
const SCREEN = { w: 1000, h: 600 };
const proto = window.HTMLElement.prototype;
const saved = {
  rect: proto.getBoundingClientRect,
  cw: Object.getOwnPropertyDescriptor(proto, 'clientWidth'),
  ch: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
  sw: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
  sh: Object.getOwnPropertyDescriptor(proto, 'scrollHeight'),
  scrollTo: proto.scrollTo,
};
const scrolls: { left: number; top: number }[] = [];

function fakeLayout(): void {
  const isScroller = (el: HTMLElement) => el.className.includes('overflow-auto');
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const id = this.getAttribute('data-wall-sheet');
    if (id) {
      const i = useProjectStore.getState().sheets.findIndex((s) => s.id === id);
      return { left: 32 + 400 * i, top: 32, width: 340, height: 240, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return isScroller(this) ? SCREEN.w : 0; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return isScroller(this) ? SCREEN.h : 0; } });
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get() { return isScroller(this) ? 32 + 400 * SHEETS : 0; } });
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get() { return isScroller(this) ? 400 : 0; } });
  proto.scrollTo = function (arg: unknown) {
    scrolls.push(arg as { left: number; top: number });
  } as typeof proto.scrollTo;
}

function restoreLayout(): void {
  proto.getBoundingClientRect = saved.rect;
  for (const [key, d] of [['clientWidth', saved.cw], ['clientHeight', saved.ch], ['scrollWidth', saved.sw], ['scrollHeight', saved.sh]] as const) {
    if (d) Object.defineProperty(proto, key, d);
    else delete (proto as unknown as Record<string, unknown>)[key];
  }
  proto.scrollTo = saved.scrollTo;
}

beforeEach(() => {
  resetProject();
  resetWallView();
  scrolls.length = 0;
  for (let i = 0; i < SHEETS; i++) {
    const id = addProjectSheet(i === 6 ? 'Secțiuni' : `Sheet ${i}`);
    setSheetNumber(id, `A-${101 + i}`);
  }
  fakeLayout();
});
afterEach(() => {
  cancelCommand();
  cleanup();
  restoreLayout();
});

const papers = (ui: HTMLElement) => ui.querySelectorAll('svg[data-sheet-id]').length;
const outlines = (ui: HTMLElement) => ui.querySelectorAll('[data-wall-placeholder]').length;
const search = (ui: HTMLElement) => ui.querySelector<HTMLInputElement>('input[type="search"]')!;

describe('the Wall with a large set', () => {
  it('draws the sheets near the screen and hangs the rest as outlines with their number and name', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    const near = useWallView.getState().near;
    assert.equal(near.length, 4, 'a 1000 px screen and a 500 px margin reach the first four');
    assert.equal(papers(ui), 4);
    assert.equal(outlines(ui), SHEETS - 4);
    const far = ui.querySelectorAll('[data-wall-placeholder]')[0];
    assert.match(far.textContent ?? '', /A-105Sheet 4/);
    assert.deepEqual(useWallView.getState().queue, near);
  });

  it('generates drawings only for the sheets in its queue', () => {
    render(<WallGrid extent={null} onStep={() => {}} />);
    const { sheets } = useProjectStore.getState();
    const drawn = sheetsToDraw(sheets, { wall: true, queue: useWallView.getState().queue, stepped: null, open: [] });
    assert.deepEqual(drawn.map((s) => s.number), ['A-102', 'A-101', 'A-103', 'A-104'], 'nearest the middle of the screen first');
  });

  it('takes the Wall to a sheet found by number, and flashes it', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    typeInto(search(ui), 'a-107');
    press(search(ui), 'Enter');
    const target = useProjectStore.getState().sheets[6];
    assert.deepEqual(scrolls, [{ left: 32 + 400 * 6 + 170 - 500, top: 0 }]);
    assert.equal(useWallView.getState().highlight, target.id);
    assert.equal(ui.querySelector(`[data-wall-sheet="${target.id}"]`)?.getAttribute('data-flashed'), 'true');
    assert.equal(search(ui).value, '', 'the box clears once it has gone there');
  });

  it('finds a sheet by a Romanian name without its accents, and a result click goes there', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    typeInto(search(ui), 'sectiuni');
    const option = ui.querySelector<HTMLButtonElement>('[data-wall-find] ul button');
    assert.ok(option);
    assert.match(option.textContent ?? '', /A-107/);
    click(option);
    assert.equal(scrolls.length, 1);
  });

  it('says so when nothing matches, and goes nowhere on Enter', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    typeInto(search(ui), 'zzz');
    assert.ok(ui.querySelector('[data-wall-find] ul'));
    press(search(ui), 'Enter');
    assert.equal(scrolls.length, 0);
  });

  it('keeps its keys to itself, with a drawing tool running as well as idle', () => {
    for (const tool of [false, true]) {
      if (tool) {
        attachDraftingView('some-view', 'down', () => []);
        assert.ok(startDraftCommand('line') && runningCommand(), 'the LINE tool is running');
      }
      const ui = render(<WallGrid extent={null} onStep={() => {}} />);
      assert.ok(search(ui).closest('[data-owns-keys]'), 'a tool owning the keys must leave this box alone');
      let heard = 0;
      const listen = () => heard++;
      window.addEventListener('keydown', listen);
      press(search(ui), 'ArrowDown');
      window.removeEventListener('keydown', listen);
      assert.equal(heard, 1, 'the key reached the window, where the tool looks for it, still marked as inside the box');
      typeInto(search(ui), 'a-102');
      press(search(ui), 'Enter');
      assert.equal(scrolls.length, 1, tool ? 'with LINE running' : 'idle');
      scrolls.length = 0;
      cleanup();
      cancelCommand();
    }
  });

  it('shows the corner map only when the Wall is larger than the screen, and a click on it moves the screen', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    const map = ui.querySelector<HTMLElement>('[data-wall-map] svg');
    assert.ok(map, 'the Wall is wider than the screen');
    assert.equal(map.querySelectorAll('[data-map-sheet]').length, SHEETS);
    assert.ok(map.querySelector('[data-map-view]'));
    act(() => {
      map.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 84, clientY: 20 }));
    });
    assert.equal(scrolls.length, 1);
    cleanup();
    // A Wall that fits the screen has no map.
    useProjectStore.setState({ sheets: useProjectStore.getState().sheets.slice(0, 2) });
    Object.defineProperty(proto, 'scrollWidth', { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get() { return 400; } });
    const small = render(<WallGrid extent={null} onStep={() => {}} />);
    assert.equal(small.querySelector('[data-wall-map]'), null);
  });
});

