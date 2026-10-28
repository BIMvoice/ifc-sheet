/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advance, cleanup, click, press, render, type as typeInto, waitFor } from '@/test/render.js';
import { addProjectSheet, addProjectView, loadProjectDocument, projectDocument, resetProject, setSheetNumber, useProjectStore } from '@/project/project-store';
import { addViewport, updateSheet } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { currentFindings } from '@/check/collect';
import { resetWallView, sheetsToDraw, useWallView } from '@/wall/wall-view';
import { attachDraftingView, cancelCommand, runningCommand, startDraftCommand } from '@/drafting/session';
import { WallGrid } from './WallGrid.js';

/**
 * The Wall with a large set: sheets away from the screen hang as outlines and
 * are not drawn, the search box and the corner map move the screen, and typing
 * in the search box is not a Wall shortcut. happy-dom has no layout, so the
 * rectangles below stand in for one: the sheets lie in a row from x = 32, 60 px
 * apart, a landscape sheet 340 wide and a portrait one 170 (all landscape: sheet
 * i at x = 32 + 400 i), on a screen 1000 px wide. happy-dom's ResizeObserver
 * never reports, so a stand-in reports a resize of what it observes on demand.
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
  ro: Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver'),
};

const sheetWidth = (s: ProjectSheet) => ((s.orientation ?? 'landscape') === 'landscape' ? 340 : 170);
function sheetX(id: string): number {
  const { sheets } = useProjectStore.getState();
  const i = sheets.findIndex((s) => s.id === id);
  return sheets.slice(0, i).reduce((x, s) => x + sheetWidth(s) + 60, 32);
}

/** Each observed element with the width it was last reported at; `reportResizes` tells the observers of those that changed. */
const observed: { cb: ResizeObserverCallback; ro: ResizeObserver; el: Element; w: number }[] = [];
class ReportingResizeObserver implements ResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(el: Element): void {
    observed.push({ cb: this.cb, ro: this, el, w: el.getBoundingClientRect().width });
  }
  unobserve(el: Element): void {
    for (let i = observed.length - 1; i >= 0; i--) if (observed[i].ro === this && observed[i].el === el) observed.splice(i, 1);
  }
  disconnect(): void {
    for (let i = observed.length - 1; i >= 0; i--) if (observed[i].ro === this) observed.splice(i, 1);
  }
}
async function reportResizes(): Promise<void> {
  for (const o of observed) {
    const w = o.el.getBoundingClientRect().width;
    if (w !== o.w) {
      o.w = w;
      o.cb([{ target: o.el } as ResizeObserverEntry], o.ro);
    }
  }
  await advance(40);
}
const scrolls: { left: number; top: number }[] = [];

function fakeLayout(): void {
  const isScroller = (el: HTMLElement) => el.className.includes('overflow-auto');
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const id = this.getAttribute('data-wall-sheet');
    const sheet = id ? useProjectStore.getState().sheets.find((s) => s.id === id) : undefined;
    if (id && sheet) {
      return { left: sheetX(id), top: 32, width: sheetWidth(sheet), height: 240, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
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
  observed.length = 0;
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: ReportingResizeObserver });
}

function restoreLayout(): void {
  proto.getBoundingClientRect = saved.rect;
  for (const [key, d] of [['clientWidth', saved.cw], ['clientHeight', saved.ch], ['scrollWidth', saved.sw], ['scrollHeight', saved.sh]] as const) {
    if (d) Object.defineProperty(proto, key, d);
    else delete (proto as unknown as Record<string, unknown>)[key];
  }
  proto.scrollTo = saved.scrollTo;
  if (saved.ro) Object.defineProperty(globalThis, 'ResizeObserver', saved.ro);
}

beforeEach(() => {
  resetProject();
  resetWallView();
  useViewDrawings.setState({ byView: {} });
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

const ids = () => useProjectStore.getState().sheets.map((s) => s.id);
const placedX = (id: string) => useWallView.getState().layout?.sheets.find((s) => s.id === id)?.rect.x;

/** One plan on every sheet. */
function planOnEverySheet(): void {
  for (const [i, id] of ids().entries()) {
    const view = addProjectView({ kind: 'plan', name: `Plan ${i}`, level: { name: `L${i}`, elevation: 3 * i, storeyGlobalIds: [] }, cutHeight: 1.2, scale: 100 } as never);
    addViewport(id, view, { x: 0, y: 0 });
  }
}

/** Stands in for `DocumentWorkspace`'s drawing hosts (IfcSheet, whose face is the Wall): a view on a sheet `sheetsToDraw` names is drawn at once. */
function drawingHost(): () => void {
  const draw = () => {
    const { byView } = useViewDrawings.getState();
    for (const sheet of sheetsToDraw(useProjectStore.getState().sheets, { wall: true, queue: useWallView.getState().queue, stepped: null, open: [] })) {
      for (const vp of sheet.viewports ?? []) {
        if (byView[vp.viewId]?.status !== 'ready') patchViewDrawing(vp.viewId, { status: 'ready', drawing: { cutPolygons: [], projectionPolygons: [], lines: [] } as never });
      }
    }
  };
  draw();
  return useWallView.subscribe(draw);
}

describe('the Wall after an edit, away from the Wall, and in another project', () => {
  it('measures again when sheets take another orientation, though the Wall itself keeps its size', async () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    const [, , , , fifth, sixth] = ids();
    assert.equal(useWallView.getState().near.length, 4);
    assert.equal(placedX(fifth), 32 + 400 * 4);
    act(() => {
      for (const id of ids().slice(0, 4)) updateSheet(id, { orientation: 'portrait' });
    });
    await reportResizes();
    assert.equal(placedX(fifth), 32 + 4 * 230, 'the fifth sheet moved left by the four narrower ones');
    assert.ok(useWallView.getState().near.includes(fifth) && useWallView.getState().near.includes(sixth), 'and came near the screen');
    assert.equal(papers(ui), 6, 'so it is drawn, not hung as an outline');
    assert.equal(outlines(ui), SHEETS - 6);
  });

  it('keeps drawing the far sheets after the Wall is taken away, so What is missing reads every plan', async () => {
    planOnEverySheet();
    render(<WallGrid extent={null} onStep={() => {}} />);
    // Stepping into a sheet takes the Wall away before the far sheets are drawn.
    cleanup();
    // The drawings come in from here on (the stub drawings would not paint on a Wall sheet).
    const stop = drawingHost();
    try {
      const notDrawn = () => currentFindings().filter((f) => f.kind === 'planNotDrawn').length;
      assert.equal(notDrawn(), SHEETS - 4, 'only the four near plans were drawn while the Wall was up');
      await waitFor(() => notDrawn() === 0, 'every plan drawn after the Wall unmounted', 5000);
      assert.deepEqual(new Set(useWallView.getState().queue), new Set(ids()));
    } finally {
      stop();
    }
  });

  it('measures and fills again when a document with the same sheets is loaded while the Wall is up', async () => {
    const ui = render(<WallGrid extent={null} onStep={() => {}} />);
    assert.equal(papers(ui), 4);
    // A re-import, the project navigator or an autosave restore: the same sheet ids, and the Wall forgotten.
    act(() => loadProjectDocument(projectDocument()));
    assert.equal(useWallView.getState().near.length, 4, 'the Wall measured again');
    // Drawn a couple at a time (`wall-promote`), not all in one render.
    await waitFor(() => papers(ui) === 4, 'so the near sheets are drawn, not left as outlines');
    await waitFor(() => useWallView.getState().queue.length > 4, 'and the background fill took up the far sheets again');
  });

  it('forgets the last project\'s sheets when another is opened, or the project is reset', async () => {
    render(<WallGrid extent={null} onStep={() => {}} />);
    await waitFor(() => useWallView.getState().queue.length > 4, 'the fill has taken a far sheet of project A');
    const b: ProjectSheet[] = [0, 1].map((i) => ({ id: `b${i}`, number: `B-${i}`, name: `B ${i}`, createdAt: 0, viewports: [] }) as unknown as ProjectSheet);
    act(() => loadProjectDocument({ ...projectDocument(), sheets: b }));
    assert.deepEqual([...useWallView.getState().queue].sort(), ['b0', 'b1'], 'only project B\'s sheets are queued');
    act(() => resetProject());
    assert.deepEqual(useWallView.getState().queue, []);
    await advance(400);
    assert.deepEqual(useWallView.getState().queue, [], 'and the fill does not bring the old ones back');
  });
});

