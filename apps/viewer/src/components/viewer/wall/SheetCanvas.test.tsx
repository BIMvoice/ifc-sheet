/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { rebindAction, resetAllBindings, unbindAction } from '@/lib/commands/key-bindings';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetCanvas } from './SheetCanvas.js';
import { useSheetContent } from '../sheets/useSheetContent.js';

/**
 * Working on a stepped-into sheet: the wheel zooms, a drag moves the chosen
 * drawing, Alt + wheel over a drawing steps its cut, Delete takes it off.
 * The layout stub makes the canvas 1280 × 800 at the origin: an A2 sheet fits
 * at k = 776 / 420 px per mm, 12 px from the top.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const vp: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null };
const sheetOf = (): ProjectSheet => {
  const s = useProjectStore.getState().sheets[0];
  assert.ok(s);
  return s;
};
const K = 776 / 420;
const X0 = (1280 - 594 * K) / 2;
const Y0 = 12;
const at = (mm: { x: number; y: number }) => ({ clientX: X0 + mm.x * K, clientY: Y0 + mm.y * K });

let chosen: string | null = null;
const nudges: number[] = [];

function Harness() {
  const sheet = useProjectStore((s) => s.sheets[0]);
  const content = useSheetContent(sheet);
  return <SheetCanvas sheet={sheet} sheetContent={content} chosenId={chosen} onChoose={(id) => { chosen = id; }} onOpen={() => {}} onNudge={(_, steps) => nudges.push(steps)} fitKey={0} />;
}

beforeEach(() => {
  resetProject();
  chosen = null;
  nudges.length = 0;
  useProjectStore.setState({ views: [plan], sheets: [{ id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] }] });
});
afterEach(() => cleanup());

const canvas = (ui: HTMLElement) => {
  const el = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
  assert.ok(el);
  return el;
};
const pointer = (el: HTMLElement, type: string, p: { clientX: number; clientY: number }) =>
  act(() => { el.dispatchEvent(new window.PointerEvent(type, { ...p, bubbles: true, button: 0, pointerId: 1 })); });
const wheel = (el: HTMLElement, p: { clientX: number; clientY: number }, deltaY: number, altKey = false) => {
  const e = new window.WheelEvent('wheel', { ...p, deltaY, bubbles: true, cancelable: true });
  // happy-dom drops a WheelEvent's modifier keys and position from its init; a browser keeps them.
  for (const [key, value] of Object.entries({ altKey, clientX: p.clientX, clientY: p.clientY })) Object.defineProperty(e, key, { value });
  act(() => { el.dispatchEvent(e); });
};

describe('SheetCanvas', () => {
  it('chooses a drawing on press and moves it with a drag', () => {
    const ui = render(<Harness />);
    const el = canvas(ui);
    const start = at({ x: 150, y: 150 });
    pointer(el, 'pointerdown', start);
    pointer(el, 'pointermove', { clientX: start.clientX + 20 * K, clientY: start.clientY + 10 * K });
    pointer(el, 'pointerup', start);
    assert.equal(chosen, 'vp');
    const moved = sheetOf().viewports?.[0];
    assert.ok(moved && Math.abs(moved.x - 170) < 1e-6 && Math.abs(moved.y - 160) < 1e-6, `${moved?.x}, ${moved?.y}`);
  });

  it('zooms about the cursor with the wheel, and leaves the drawings where they are', () => {
    const ui = render(<Harness />);
    const el = canvas(ui);
    const width = () => Number(ui.querySelector('svg')?.getAttribute('width'));
    const before = width();
    wheel(el, at({ x: 300, y: 200 }), -400);
    assert.ok(width() > before * 1.5, `${width()} after ${before}`);
    assert.equal(sheetOf().viewports?.[0]?.x, 150);
  });

  it('steps a plan\'s cut with Alt and the wheel over it', () => {
    const ui = render(<Harness />);
    wheel(canvas(ui), at({ x: 150, y: 150 }), -100, true);
    assert.deepEqual(nudges, [1]);
    assert.equal(chosen, 'vp');
  });

  it('takes the chosen drawing off the sheet with Delete', () => {
    chosen = 'vp';
    render(<Harness />);
    press(window, 'Delete');
    assert.deepEqual(sheetOf().viewports, []);
    assert.equal(chosen, null);
  });
});

describe('SheetCanvas Delete is the Erase action\'s keys', () => {
  it('does not take the drawing off once Erase has no Delete, and takes it on the key Erase was given', () => {
    chosen = 'vp';
    unbindAction('drafting.erase');
    render(<Harness />);
    press(window, 'Delete');
    press(window, 'Backspace');
    assert.equal(sheetOf().viewports?.length, 1, 'no key, no removal');
    rebindAction('drafting.erase', { key: 'q' });
    press(window, 'Delete');
    assert.equal(sheetOf().viewports?.length, 1, 'Delete is no longer Erase');
    press(window, 'q');
    assert.deepEqual(sheetOf().viewports, []);
    assert.equal(chosen, null);
    resetAllBindings();
  });
});
