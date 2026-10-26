/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advance, cleanup, click, press, render } from '@/test/render.js';
import { addProjectSheet, resetProject, setSheetNumber, useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import { resetWallView, useWallView } from '@/wall/wall-view';
import { PX_PER_MM, SHEET_PX, useWallZoom } from '@/wall/wall-zoom';
import { WallGrid } from './WallGrid.js';

/**
 * Zoom and pan on the Wall (#188). happy-dom has no layout, so a stand-in lays the sheets out in one row, 40 px apart from x = 32,
 * each as wide as its frame's style says (the zoom sets it) and 0.7 of that high plus a 40 px caption, on a screen 1000 x 600 whose
 * scroll offsets are real: the rectangles a sheet reports move as the Wall scrolls and widen as it zooms, as in a browser.
 */

const SHEETS = 10;
const SCREEN = { w: 1000, h: 600 };
const GAP = 40;
const proto = window.HTMLElement.prototype;
const saved = {
  rect: proto.getBoundingClientRect,
  cw: Object.getOwnPropertyDescriptor(proto, 'clientWidth'),
  ch: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
  sw: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
  sh: Object.getOwnPropertyDescriptor(proto, 'scrollHeight'),
  sl: Object.getOwnPropertyDescriptor(proto, 'scrollLeft'),
  st: Object.getOwnPropertyDescriptor(proto, 'scrollTop'),
  scrollTo: proto.scrollTo,
};

const scrollOf = new WeakMap<Element, { left: number; top: number }>();
const isScroller = (el: Element) => el.hasAttribute('data-wall-scroller');
const widthOf = (el: Element) => parseFloat((el as HTMLElement).style.width) || 0;
const frames = (scroller: Element) => [...scroller.querySelectorAll<HTMLElement>('[data-wall-sheet]')];
function contentX(el: Element): number {
  const scroller = el.closest('[data-wall-scroller]')!;
  let x = 32;
  for (const f of frames(scroller)) {
    if (f === el) return x;
    x += widthOf(f) + GAP;
  }
  return x;
}
const heightOf = (el: Element) => widthOf(el) * 0.7 + 40;

function fakeLayout(): void {
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const scroller = this.closest('[data-wall-scroller]');
    if (this.hasAttribute('data-wall-sheet') && scroller) {
      const s = scrollOf.get(scroller) ?? { left: 0, top: 0 };
      const left = contentX(this) - s.left;
      return { left, top: 60 - s.top, width: widthOf(this), height: heightOf(this), right: 0, bottom: 0, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return isScroller(this) ? SCREEN.w : 0; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return isScroller(this) ? SCREEN.h : 0; } });
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get() { return isScroller(this) ? 64 + frames(this).reduce((w, f) => w + widthOf(f) + GAP, 0) : 0; } });
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get() { return isScroller(this) ? 100 + Math.max(...frames(this).map(heightOf)) : 0; } });
  for (const [key, axis] of [['scrollLeft', 'left'], ['scrollTop', 'top']] as const) {
    Object.defineProperty(proto, key, {
      configurable: true,
      get() { return scrollOf.get(this)?.[axis] ?? 0; },
      set(v: number) { scrollOf.set(this, { ...(scrollOf.get(this) ?? { left: 0, top: 0 }), [axis]: v }); },
    });
  }
  proto.scrollTo = function (this: HTMLElement, arg: unknown) {
    const { left, top } = arg as { left: number; top: number };
    scrollOf.set(this, { left, top });
    this.dispatchEvent(new window.Event('scroll'));
  } as typeof proto.scrollTo;
}

function restoreLayout(): void {
  proto.getBoundingClientRect = saved.rect;
  for (const [key, d] of [['clientWidth', saved.cw], ['clientHeight', saved.ch], ['scrollWidth', saved.sw], ['scrollHeight', saved.sh], ['scrollLeft', saved.sl], ['scrollTop', saved.st]] as const) {
    if (d) Object.defineProperty(proto, key, d);
    else delete (proto as unknown as Record<string, unknown>)[key];
  }
  proto.scrollTo = saved.scrollTo;
}

beforeEach(() => {
  resetProject();
  resetWallView();
  for (let i = 0; i < SHEETS; i++) setSheetNumber(addProjectSheet(`Sheet ${i}`), `A-${101 + i}`);
  fakeLayout();
});
afterEach(() => {
  cleanup();
  restoreLayout();
});

const ids = () => useProjectStore.getState().sheets.map((s) => s.id);
const frame = (ui: HTMLElement, id: string) => ui.querySelector<HTMLElement>(`[data-wall-sheet="${id}"]`)!;
const scroller = (ui: HTMLElement) => ui.querySelector<HTMLElement>('[data-wall-scroller]')!;
const drawn = (ui: HTMLElement, id: string) => frame(ui, id).querySelector('svg[data-sheet-id]') !== null;
const outline = (ui: HTMLElement, id: string) => frame(ui, id).querySelector('[data-wall-placeholder]') !== null;
const k = () => useWallZoom.getState().k;
const level = (ui: HTMLElement) => ui.querySelector('[data-wall-zoom-level]')?.textContent;

let lastWheel: Event | null = null;
function wheel(target: Element, init: WheelEventInit): void {
  act(() => {
    const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    // happy-dom's WheelEvent drops the pointer position and modifiers its MouseEvent parent takes.
    Object.defineProperties(event, { clientX: { value: init.clientX ?? 0 }, clientY: { value: init.clientY ?? 0 }, ctrlKey: { value: init.ctrlKey ?? false }, metaKey: { value: init.metaKey ?? false } });
    target.dispatchEvent(event);
    lastWheel = event;
  });
}

function inView(ui: HTMLElement, id: string): boolean {
  const r = frame(ui, id).getBoundingClientRect();
  return r.left >= 0 && r.left + r.width <= SCREEN.w && r.top >= 0 && r.top + r.height <= SCREEN.h;
}

describe('zoom on the Wall (#188)', () => {
  it('zooms about the cursor: the point of the paper under it stays under it', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    const id = ids()[2];
    const before = frame(ui, id).getBoundingClientRect();
    const cursor = { x: before.left + 120, y: before.top + 50 };
    const fx = (cursor.x - before.left) / before.width;
    const fy = (cursor.y - before.top) / before.height;
    assert.ok(before.left + before.width > cursor.x && cursor.x < SCREEN.w, 'the cursor is over the sheet, on the screen');
    wheel(scroller(ui), { deltaY: -300, ctrlKey: true, clientX: cursor.x, clientY: cursor.y });
    assert.ok(k() > 1.4, `the wheel zoomed in (${k()})`);
    const after = frame(ui, id).getBoundingClientRect();
    assert.ok(after.width > before.width * 1.4, 'the sheet is bigger');
    assert.ok(Math.abs(after.left + fx * after.width - cursor.x) < 1, 'same paper point, across');
    assert.ok(Math.abs(after.top + fy * after.height - cursor.y) < 1, 'same paper point, down');
    // And out again about another point.
    const out = { x: 300, y: 200 };
    const hit = frame(ui, ids()[0]).getBoundingClientRect();
    const gx = (out.x - hit.left) / hit.width;
    wheel(scroller(ui), { deltaY: 200, ctrlKey: true, clientX: out.x, clientY: out.y });
    assert.ok(k() < 1.4 * 1.2);
    const back = frame(ui, ids()[0]).getBoundingClientRect();
    assert.ok(Math.abs(back.left + gx * back.width - out.x) < 1 || useWallZoom.getState().left === 0, 'about the new cursor (or held at the Wall\'s edge)');
  });

  it('leaves a plain wheel to scroll the Wall and zooms on Ctrl/Cmd and the wheel', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    wheel(scroller(ui), { deltaY: -300, clientX: 300, clientY: 200 });
    assert.equal(k(), 1, 'a plain wheel does not zoom');
    assert.equal(lastWheel?.defaultPrevented, false, 'and is left to scroll natively');
    wheel(scroller(ui), { deltaY: -300, metaKey: true, clientX: 300, clientY: 200 });
    assert.ok(k() > 1, 'Cmd and the wheel zooms');
  });

  it('steps with + and - and the Ctrl/Cmd chords, and 0 fits every sheet in view', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    press(document.body, '+');
    const one = k();
    assert.ok(one > 1);
    press(document.body, '+', { ctrlKey: true });
    assert.ok(k() > one);
    press(document.body, '-', { metaKey: true });
    assert.equal(k(), one);
    press(document.body, '-');
    assert.equal(k(), 1);
    press(document.body, '+');
    press(document.body, '+');
    assert.ok(!ids().every((id) => inView(ui, id)), 'zoomed in, the set does not fit');
    press(document.body, '0');
    assert.ok(k() < 1, `fit zooms out (${k()})`);
    for (const id of ids()) assert.ok(inView(ui, id), 'every sheet is in view');
    // The Fit button does the same.
    press(document.body, '+');
    click([...ui.querySelectorAll<HTMLButtonElement>('[data-wall-zoom] button')].find((b) => b.textContent === 'Fit')!);
    for (const id of ids()) assert.ok(inView(ui, id), 'the Fit button too');
  });

  it('shows a sheet at its paper size on 1 and labels it 100 %', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    press(document.body, '1');
    assert.equal(level(ui), '100 %');
    const sheet = useProjectStore.getState().sheets[0];
    assert.ok(Math.abs(SHEET_PX * k() - paperOf(sheet).w * PX_PER_MM) < 0.5, '1 mm of paper is 1 mm on screen');
    press(document.body, '-');
    assert.notEqual(level(ui), '100 %');
  });

  it('zooms to one sheet, still on the Wall, and PageDown brings the next one in at the same zoom', () => {
    const stepped: string[] = [];
    const ui = render(<WallGrid extent={null} onStep={(id) => stepped.push(id)} />);
    const [, , third, fourth, fifth] = ids();
    click(ui.querySelector(`[data-wall-zoom-sheet="${third}"]`)!);
    assert.deepEqual(stepped, [], 'zooming to a sheet does not step into it');
    assert.ok(k() > 1.5);
    assert.ok(inView(ui, third), 'the sheet is whole on the screen');
    assert.ok(frame(ui, third).getBoundingClientRect().width > 600, 'and fills it');
    const zoom = k();
    assert.equal(inView(ui, fourth), false, 'the next sheet is off the screen');
    press(document.body, 'PageDown');
    assert.equal(k(), zoom, 'the same zoom');
    assert.ok(inView(ui, fourth), 'the next sheet is in view');
    assert.equal(inView(ui, third), false);
    press(document.body, 'ArrowRight');
    assert.ok(inView(ui, fifth), 'the arrows walk the sheets after a zoom to one');
    press(document.body, 'PageUp');
    press(document.body, 'PageUp');
    assert.ok(inView(ui, third), 'and PageUp goes back');
    // A double-click still steps in.
    frame(ui, third).querySelector('button[aria-label^="A-"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assert.equal(stepped.length, 1);
  });

  it('hangs far and tiny sheets as outlines and draws only the ones in view at a size that can be read', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    const [first, , third, , , , , , , last] = ids();
    press(document.body, '0');
    assert.equal(useWallView.getState().near.length, SHEETS, 'at fit-all every sheet is on the screen');
    for (const id of ids()) assert.ok(outline(ui, id) && !drawn(ui, id), 'but each is a stamp, hung as an outline');
    click(ui.querySelector(`[data-wall-zoom-sheet="${third}"]`)!);
    assert.ok(drawn(ui, third), 'the sheet zoomed to is drawn in full');
    assert.ok(outline(ui, first) && outline(ui, last), 'the far ones are outlines');
    assert.ok(ui.querySelectorAll('svg[data-sheet-id]').length < SHEETS);
  });

  it('leaves the keys to a text field', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    const box = ui.querySelector<HTMLInputElement>('input[type="search"]')!;
    for (const key of ['+', '-', '0', '1', 'z', 'PageDown']) press(box, key);
    press(box, '+', { ctrlKey: true });
    assert.equal(k(), 1, 'nothing zoomed');
    assert.equal(useWallZoom.getState().current, null);
    press(document.body, '+');
    assert.ok(k() > 1, 'the same key outside the box does');
  });

  it('pans with a drag on the empty Wall and with Space and a drag on a sheet, not with a drag on a sheet alone', () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    const wall = scroller(ui);
    const drag = (target: Element, dx: number) => act(() => {
      target.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 500, clientY: 300 }));
      wall.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, clientX: 500 - dx, clientY: 300 }));
      wall.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
    });
    drag(wall, 120);
    assert.equal(wall.scrollLeft, 120, 'dragging the empty Wall moves it');
    drag(frame(ui, ids()[0]), 50);
    assert.equal(wall.scrollLeft, 120, 'a drag on a sheet is the sheet\'s');
    press(document.body, ' ');
    drag(frame(ui, ids()[0]), 50);
    assert.equal(wall.scrollLeft, 170, 'with Space held it pans');
    act(() => { window.dispatchEvent(new window.KeyboardEvent('keyup', { key: ' ', bubbles: true })); });
    drag(frame(ui, ids()[0]), 50);
    assert.equal(wall.scrollLeft, 170);
  });

  it('keeps the zoom and the place when the Wall is left and come back to', async () => {
    const first = render(<WallGrid extent={null} onStep={() => {}} />);
    press(document.body, '+');
    press(document.body, '+');
    const zoom = k();
    act(() => { scroller(first).scrollLeft = 400; });
    act(() => { scroller(first).dispatchEvent(new window.Event('scroll')); });
    cleanup();
    const again = render(<WallGrid extent={null} onStep={() => {}} />);
    await advance(40);
    assert.equal(k(), zoom);
    assert.equal(scroller(again).scrollLeft, 400);
    assert.equal(frame(again, ids()[0]).style.width, `${SHEET_PX * zoom}px`);
  });
});
