/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cancelCommand, startDraftCommand } from '@/drafting/session';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { resetProject, useProjectStore } from '@/project/project-store';
import { undoLatest } from '@/project/unified-undo';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetCanvas } from './SheetCanvas.js';
import { SteppedSheet } from './SteppedSheet.js';
import { ViewportCard } from './ViewportCard.js';
import { viewportTransform } from '../sheets/SheetPaper.js';
import { useSheetContent } from '../sheets/useSheetContent.js';

/**
 * #139: a chosen drawing shows grips on its four edges and four corners.
 * Dragging one changes the crop box in whole paper millimetres and leaves the
 * drawing's scale and its place on the paper alone; it stays in the sheet's
 * drawing area; it is one undo step; Esc puts it back.
 * The layout stub makes the canvas 1280 x 800 at the origin: an A2 sheet fits
 * at k = 776 / 420 px per mm, 12 px from the top.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const drafting: ProjectView = { id: 'd', kind: 'drafting', name: 'Notes', createdAt: 0 };
const vp: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null };
// The plan's generated drawing is 5 x 3 m, so at 1:50 its automatic box is 120 x 80 mm (a 10 mm margin all round): left 90, right 210, top 110, bottom 190.
const DRAWING = { lines: [], cutPolygons: [], projectionPolygons: [], bounds: { min: { x: 0, y: 0 }, max: { x: 5, y: 3 } }, config: { plane: { axis: 'y' } } } as unknown as Drawing2D;
const K = 776 / 420;
const X0 = (1280 - 594 * K) / 2;
const Y0 = 12;
const at = (mm: { x: number; y: number }) => ({ clientX: X0 + mm.x * K, clientY: Y0 + mm.y * K });
/** The sheet's drawing area on an A2 landscape sheet: 10 mm frame, 50 mm title block. */
const AREA = { left: 10, top: 10, right: 584, bottom: 360 };

const sheetOf = (): ProjectSheet => useProjectStore.getState().sheets[0];
const vpOf = (): SheetViewport => sheetOf().viewports![0];
let chosen: string | null = null;

function Harness() {
  const sheet = useProjectStore((s) => s.sheets[0]);
  const content = useSheetContent(sheet);
  return <SheetCanvas sheet={sheet} sheetContent={content} chosenId={chosen} onChoose={(id) => { chosen = id; }} onOpen={() => {}} onNudge={() => {}} fitKey={0} />;
}

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  cancelCommand();
  chosen = 'vp';
  useViewDrawings.setState({ byView: {} });
  patchViewDrawing('p', { status: 'ready', drawing: DRAWING });
  useProjectStore.setState({ views: [plan, drafting], sheets: [{ id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] }] });
});
afterEach(() => cleanup());

const grip = (ui: HTMLElement, handle: string): HTMLElement => {
  const el = ui.querySelector<HTMLElement>(`[data-viewport-grip="${handle}"]`);
  assert.ok(el, `grip ${handle}`);
  return el;
};
const pointer = (el: HTMLElement, type: string, p: { clientX: number; clientY: number }) =>
  act(() => { el.dispatchEvent(new window.PointerEvent(type, { ...p, bubbles: true, button: 0, pointerId: 1 })); });
/** A press on a grip, a move to a paper point, and the release there. */
function drag(el: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, release = true): void {
  pointer(el, 'pointerdown', at(from));
  pointer(el, 'pointermove', at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }));
  pointer(el, 'pointermove', at(to));
  if (release) pointer(el, 'pointerup', at(to));
}
const placed = (v: SheetViewport) => viewportTransform(v, DRAWING, 'down');

describe('resizing a drawing by its grips (#139)', () => {
  it('shows eight grips, each named, on the chosen drawing only', () => {
    const ui = render(<Harness />);
    const grips = [...ui.querySelectorAll('[data-viewport-grip]')];
    assert.equal(grips.length, 8);
    for (const g of grips) assert.ok(g.getAttribute('aria-label')?.startsWith('Resize the drawing'), g.getAttribute('aria-label') ?? '');
    cleanup();
    chosen = null;
    assert.equal(render(<Harness />).querySelectorAll('[data-viewport-grip]').length, 0);
  });

  it('drags the bottom right corner: the stored size grows by the drag, the scale and the drawing\'s place on the paper stay', () => {
    const ui = render(<Harness />);
    const before = placed(vpOf());
    drag(grip(ui, 'se'), { x: 210, y: 190 }, { x: 250, y: 215 });
    const v = vpOf();
    assert.deepEqual([v.width, v.height], [160, 105]);
    assert.equal(v.scale, 50);
    assert.deepEqual([v.x, v.y], [170, 162.5], 'the box grew to the right and down; the far corner did not move');
    const after = placed(v);
    assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  });

  it('drags the top left corner and the edges: each moves only its own edge', () => {
    const ui = render(<Harness />);
    drag(grip(ui, 'nw'), { x: 90, y: 110 }, { x: 70, y: 100 });
    assert.deepEqual([vpOf().x, vpOf().y, vpOf().width, vpOf().height], [140, 145, 140, 90]);
    drag(grip(ui, 'e'), { x: 210, y: 145 }, { x: 200, y: 300 });
    assert.deepEqual([vpOf().x, vpOf().width, vpOf().height], [135, 130, 90], 'the right edge moves sideways only');
    drag(grip(ui, 's'), { x: 135, y: 190 }, { x: 0, y: 200 });
    assert.deepEqual([vpOf().y, vpOf().height, vpOf().width], [150, 100, 130], 'the bottom edge moves up and down only');
  });

  it('snaps the size to whole millimetres', () => {
    const ui = render(<Harness />);
    drag(grip(ui, 'se'), { x: 210, y: 190 }, { x: 230.4, y: 200.6 });
    assert.deepEqual([vpOf().width, vpOf().height], [140, 91]);
  });

  it('keeps a minimum size, and stays inside the sheet\'s drawing area', () => {
    const ui = render(<Harness />);
    drag(grip(ui, 'se'), { x: 210, y: 190 }, { x: 5000, y: 5000 });
    let v = vpOf();
    assert.equal(v.x + v.width / 2, AREA.right, 'the right edge stops at the frame');
    assert.equal(v.y + v.height / 2, AREA.bottom, 'the bottom edge stops above the title block');
    drag(grip(ui, 'nw'), { x: 90, y: 110 }, { x: -5000, y: -5000 });
    v = vpOf();
    assert.equal(v.x - v.width / 2, AREA.left);
    assert.equal(v.y - v.height / 2, AREA.top);
    drag(grip(ui, 'se'), { x: v.x + v.width / 2, y: v.y + v.height / 2 }, { x: -5000, y: -5000 });
    drag(grip(ui, 'nw'), { x: vpOf().x - vpOf().width / 2, y: vpOf().y - vpOf().height / 2 }, { x: 5000, y: 5000 });
    assert.deepEqual([vpOf().width, vpOf().height], [20, 15]);
  });

  it('is one undo step however long the drag, and undo puts the box and the drawing back as they were', () => {
    const ui = render(<Harness />);
    drag(grip(ui, 'se'), { x: 210, y: 190 }, { x: 250, y: 215 });
    drag(grip(ui, 'n'), { x: 170, y: 110 }, { x: 170, y: 100 });
    const resized = vpOf();
    act(() => undoLatest());
    assert.equal(vpOf().height, 105, 'the second drag alone is undone');
    assert.equal(vpOf().width, 160);
    act(() => undoLatest());
    assert.deepEqual(vpOf(), vp, 'both gone: the automatic box and centre are back');
    assert.notDeepEqual(resized, vp);
  });

  it('records nothing when the drag ends where it began, and none for a press and release without a move', () => {
    const ui = render(<Harness />);
    const g = grip(ui, 'se');
    drag(g, { x: 210, y: 190 }, { x: 250, y: 215 }, false);
    pointer(g, 'pointermove', at({ x: 210, y: 190 }));
    pointer(g, 'pointerup', at({ x: 210, y: 190 }));
    assert.deepEqual(vpOf(), vp, 'back at the start: the viewport is as it was, automatic box and centre');
    pointer(g, 'pointerdown', at({ x: 210, y: 190 }));
    pointer(g, 'pointerup', at({ x: 210, y: 190 }));
    assert.deepEqual(vpOf(), vp);
    drag(grip(ui, 'e'), { x: 210, y: 150 }, { x: 230, y: 150 });
    assert.equal(vpOf().width, 140);
    act(() => undoLatest());
    assert.deepEqual(vpOf(), vp, 'the one real drag is the only step: a single undo reaches the start');
  });

  it('shows no grips until the drawing is generated: its place on the paper is not known before, and a crop stored against a guess would shift it', () => {
    useViewDrawings.setState({ byView: {} });
    const ui = render(<Harness />);
    assert.equal(ui.querySelectorAll('[data-viewport-grip]').length, 0, 'nothing generated yet');
    act(() => patchViewDrawing('p', { status: 'generating', drawing: null }));
    assert.equal(ui.querySelectorAll('[data-viewport-grip]').length, 0, 'still generating');
    act(() => patchViewDrawing('p', { status: 'ready', drawing: DRAWING }));
    assert.equal(ui.querySelectorAll('[data-viewport-grip]').length, 8, 'the grips come with the drawing');
  });

  it('puts the box back on Esc during the drag, and a release afterwards changes nothing', () => {
    const ui = render(<Harness />);
    const g = grip(ui, 'se');
    drag(g, { x: 210, y: 190 }, { x: 250, y: 215 }, false);
    assert.equal(vpOf().width, 160, 'the box follows the pointer while dragging');
    press(g, 'Escape');
    assert.deepEqual(vpOf(), vp);
    pointer(g, 'pointerup', at({ x: 250, y: 215 }));
    assert.deepEqual(vpOf(), vp);
    act(() => undoLatest());
    assert.deepEqual(vpOf(), vp, 'nothing was recorded');
  });

  it('is reachable from the keyboard: an arrow moves the focused edge by 1 mm, Shift by 10, each one undo step', () => {
    const ui = render(<Harness />);
    const g = grip(ui, 'e');
    press(g, 'ArrowRight');
    assert.equal(vpOf().width, 121);
    press(g, 'ArrowRight', { shiftKey: true });
    assert.equal(vpOf().width, 131);
    press(grip(ui, 'w'), 'ArrowLeft');
    assert.equal(vpOf().width, 132, 'the left edge moves left: the box grows');
    assert.equal(vpOf().x + 132 / 2, 221, 'and its right edge stays put');
    act(() => undoLatest());
    assert.equal(vpOf().width, 131);
  });

  it('has no grips on a drafting view, which is framed on its drafts, or while a tool draws', () => {
    useProjectStore.setState({ sheets: [{ ...sheetOf(), viewports: [{ ...vp, viewId: 'd', width: 100, height: 60 }] }] });
    assert.equal(render(<Harness />).querySelectorAll('[data-viewport-grip]').length, 0);
  });

  it('hides its grips while a drawing tool runs, so the tool\'s clicks are the tool\'s', () => {
    const ui = render(<Harness />);
    assert.equal(ui.querySelectorAll('[data-viewport-grip]').length, 8);
    act(() => startDraftCommand('line'));
    assert.equal(ui.querySelectorAll('[data-viewport-grip]').length, 0);
  });
});

describe('Fit to drawing (#139)', () => {
  const card = (slot: SheetViewport) => render(<ViewportCard sheet={sheetOf()} slot={slot} onOpen={() => {}} onChoose={() => {}} />);
  const fit = (ui: HTMLElement) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Fit to drawing');

  it('is offered once the size is manual, clears it, and is one undo step', () => {
    const manual = { ...vp, width: 200, height: 120, center: { x: 1, y: 2 } };
    useProjectStore.setState({ sheets: [{ ...sheetOf(), viewports: [manual] }] });
    const ui = card(manual);
    const button = fit(ui);
    assert.ok(button);
    click(button);
    assert.deepEqual([vpOf().width, vpOf().height, vpOf().center], [0, 0, null]);
    act(() => undoLatest());
    assert.deepEqual(vpOf(), manual);
  });

  it('is not offered while the box already fits the drawing', () => {
    assert.equal(fit(card(vp)), undefined);
  });
});

describe('Esc on a grip (#139)', () => {
  it('belongs to the grip: it cancels the drag without leaving the drawing or the sheet, and only a second Esc does', () => {
    let left = 0;
    const ui = render(<SteppedSheet sheet={sheetOf()} extent={null} proposals={[]} onBack={() => { left += 1; }} onStep={() => {}} />);
    const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
    assert.ok(canvas);
    pointer(canvas, 'pointerdown', at({ x: 150, y: 150 }));
    pointer(canvas, 'pointerup', at({ x: 150, y: 150 }));
    const g = grip(ui, 'se');
    drag(g, { x: 210, y: 190 }, { x: 250, y: 215 }, false);
    press(g, 'Escape');
    assert.deepEqual(vpOf(), vp, 'the drag is cancelled');
    assert.equal(left, 0, 'the sheet stays');
    assert.equal(ui.querySelectorAll('[data-viewport-grip]').length, 8, 'and the drawing stays chosen');
    g.focus();
    assert.equal(document.activeElement, g);
    press(g, 'Escape');
    assert.equal(left, 0);
    assert.notEqual(document.activeElement, g, 'a grip at rest lets go of focus, so the next Esc is not swallowed by it');
    press(window, 'Escape');
    assert.equal(ui.querySelectorAll('[data-viewport-grip]').length, 0, 'the next Esc is the sheet\'s own: it lets go of the drawing');
  });
});
