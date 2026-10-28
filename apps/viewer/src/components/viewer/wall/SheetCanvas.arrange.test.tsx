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
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetCanvas } from './SheetCanvas.js';
import { useSheetContent } from '../sheets/useSheetContent.js';

/**
 * #186: arranging on a stepped-into sheet. The layout stub makes the canvas 1280 x 800: an A2 sheet fits at K px per mm.
 * A (100 x 80, centre 150, 150) is dragged beside B (100 x 80, centre 380, 150), whose left edge is at 330.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const a: SheetViewport = { id: 'a', viewId: 'p', x: 150, y: 150, scale: 50, width: 100, height: 80, center: null };
const b: SheetViewport = { id: 'b', viewId: 'p', x: 380, y: 150, scale: 50, width: 100, height: 80, center: null };
const K = 776 / 420;
const X0 = (1280 - 594 * K) / 2;
const Y0 = 12;
const at = (x: number, y: number) => ({ clientX: X0 + x * K, clientY: Y0 + y * K });
const vpOf = (id: string) => {
  const found = useProjectStore.getState().sheets[0]?.viewports?.find((v) => v.id === id);
  assert.ok(found);
  return found;
};

let chosen: string | null = null;
function Harness() {
  const sheet = useProjectStore((s) => s.sheets[0]);
  const content = useSheetContent(sheet);
  return <SheetCanvas sheet={sheet} sheetContent={content} chosenId={chosen} onChoose={(id) => { chosen = id; }} onOpen={() => {}} onNudge={() => {}} fitKey={0} />;
}

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  chosen = null;
  const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [a, b] };
  useProjectStore.setState({ views: [plan], sheets: [sheet] });
});
afterEach(() => {
  cleanup();
  setAutocadMode(false);
});

const canvas = (ui: HTMLElement) => {
  const el = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
  assert.ok(el);
  return el;
};
const pointer = (el: HTMLElement, type: string, p: { clientX: number; clientY: number }) =>
  act(() => { el.dispatchEvent(new window.PointerEvent(type, { ...p, bubbles: true, button: 0, pointerId: 1 })); });
/** Drag A's centre from (150, 150) to (`x`, 150), leaving the button down unless `release`. */
function dragTo(ui: HTMLElement, x: number, release = true): void {
  const el = canvas(ui);
  pointer(el, 'pointerdown', at(150, 150));
  pointer(el, 'pointermove', at(x, 150));
  if (release) pointer(el, 'pointerup', at(x, 150));
}

describe('dragging a viewport snaps (#186)', () => {
  it('lands its edge exactly on the neighbour\'s edge within the tolerance, shows the guide while it drags, and not after', () => {
    const ui = render(<Harness />);
    dragTo(ui, 283, false); // 3 mm = 5.5 px from the edge-to-edge position (280)
    assert.equal(vpOf('a').x, 280);
    assert.ok(ui.querySelector('[data-snap-guide="x"]'), 'the guide shows while dragging');
    pointer(canvas(ui), 'pointerup', at(283, 150));
    assert.equal(vpOf('a').x, 280);
    assert.equal(ui.querySelector('[data-snap-guide]'), null, 'and goes when the button is released');
  });

  it('leaves it free beyond the tolerance', () => {
    const ui = render(<Harness />);
    dragTo(ui, 275); // 5 mm = 9.2 px: outside 8 px
    assert.ok(Math.abs(vpOf('a').x - 275) < 1e-6, `${vpOf('a').x}`);
  });

  it('is one undo step for the whole drag', () => {
    const ui = render(<Harness />);
    const el = canvas(ui);
    pointer(el, 'pointerdown', at(150, 150));
    for (const x of [170, 200, 240, 283]) pointer(el, 'pointermove', at(x, 150));
    pointer(el, 'pointerup', at(283, 150));
    assert.equal(vpOf('a').x, 280);
    act(() => { undoDrafts(); });
    assert.equal(vpOf('a').x, 150, 'one undo puts it back where the drag began');
  });
});

describe('the arrow keys nudge the chosen viewport (#186)', () => {
  it('by exactly 1 mm, and 10 mm with Shift, each press one undo step', () => {
    chosen = 'a';
    render(<Harness />);
    press(window, 'ArrowRight');
    assert.deepEqual([vpOf('a').x, vpOf('a').y], [151, 150]);
    press(window, 'ArrowUp');
    assert.deepEqual([vpOf('a').x, vpOf('a').y], [151, 149]);
    press(window, 'ArrowLeft', { shiftKey: true });
    press(window, 'ArrowDown', { shiftKey: true });
    assert.deepEqual([vpOf('a').x, vpOf('a').y], [141, 159]);
    assert.deepEqual([vpOf('b').x, vpOf('b').y], [380, 150], 'only the chosen one moves');
    act(() => { undoDrafts(); });
    assert.deepEqual([vpOf('a').x, vpOf('a').y], [141, 149], 'the last press alone');
    act(() => { undoDrafts(); });
    assert.deepEqual([vpOf('a').x, vpOf('a').y], [151, 149], 'then the one before');
  });

  it('moves nothing with no drawing chosen, or with a modifier that is another shortcut', () => {
    render(<Harness />);
    press(window, 'ArrowRight');
    chosen = 'a';
    cleanup();
    render(<Harness />);
    press(window, 'ArrowRight', { ctrlKey: true });
    press(window, 'ArrowRight', { metaKey: true });
    press(window, 'ArrowRight', { altKey: true });
    assert.equal(vpOf('a').x, 150);
  });

  it('moves nothing while a text field has focus', () => {
    chosen = 'a';
    const ui = render(<Harness />);
    const input = document.createElement('input');
    ui.append(input);
    input.focus();
    press(input, 'ArrowRight');
    press(input, 'ArrowDown', { shiftKey: true });
    assert.deepEqual([vpOf('a').x, vpOf('a').y], [150, 150]);
    input.remove();
    press(window, 'ArrowRight');
    assert.equal(vpOf('a').x, 151, 'and the same key moves it once the field is gone');
  });

  it('leaves a panel that keeps its own keys alone (a focused grip resizes, a card field edits)', () => {
    chosen = 'a';
    const ui = render(<Harness />);
    const panel = document.createElement('div');
    panel.setAttribute('data-owns-keys', '');
    const button = document.createElement('button');
    panel.append(button);
    ui.append(panel);
    press(button, 'ArrowRight');
    assert.equal(vpOf('a').x, 150);
  });

  it('in AutoCAD mode: an empty command line passes the key to the sheet, a line with text in it keeps it', () => {
    setAutocadMode(true);
    chosen = 'a';
    const ui = render(<Harness />);
    const line = ui.querySelector<HTMLInputElement>('[data-command-line]');
    assert.ok(line, 'the command line shows');
    line.focus();
    press(line, 'ArrowRight');
    assert.equal(vpOf('a').x, 151, 'empty: nothing is typed there for the key to belong to');
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(line, 'mo');
      line.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    press(line, 'ArrowRight');
    assert.equal(vpOf('a').x, 151, 'with text: the caret moves, the viewport does not');
  });
});
