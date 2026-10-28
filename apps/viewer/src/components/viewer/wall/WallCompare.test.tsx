/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { addProjectSheet, resetProject, setSheetNumber, useProjectStore } from '@/project/project-store';
import { resetWallCompare, useWallCompare } from '@/wall/wall-compare';
import { resetWallView } from '@/wall/wall-view';
import { resetWallZoom, useWallZoom } from '@/wall/wall-zoom';
import { WallGrid } from './WallGrid.js';
import { WallCompare } from './WallCompare.js';

/** Two sheets side by side (#498): the pick on the cards, the shared zoom, panning together or apart, swap, close, keys. */

const ids = () => useProjectStore.getState().sheets.map((s) => s.id);

beforeEach(() => {
  resetProject();
  resetWallView();
  resetWallZoom();
  resetWallCompare();
  for (let i = 0; i < 3; i++) setSheetNumber(addProjectSheet(`Sheet ${i}`), `A-${101 + i}`);
});
afterEach(() => cleanup());

const wall = () => render(<><WallGrid extent={null} onStep={() => {}} /><WallCompare /></>);
const pickButton = (ui: HTMLElement, number: string) => ui.querySelector<HTMLButtonElement>(`button[aria-label^="Compare ${number} "]`)!;
const pane = (ui: HTMLElement, side: number) => ui.querySelector<HTMLElement>(`[data-compare-pane="${side}"]`)!;
const paneSheet = (ui: HTMLElement, side: number) => pane(ui, side).querySelector('svg[data-sheet-id]')?.getAttribute('data-sheet-id');
const dialog = (ui: HTMLElement) => ui.querySelector<HTMLElement>('dialog');

function scrollTo(el: HTMLElement, left: number, top: number): void {
  act(() => {
    el.scrollLeft = left;
    el.scrollTop = top;
    el.dispatchEvent(new window.Event('scroll'));
  });
}
const at = (el: HTMLElement) => [el.scrollLeft, el.scrollTop];

function open(ui: HTMLElement): void {
  click(pickButton(ui, 'A-101'));
  click(pickButton(ui, 'A-103'));
}

describe('compare two sheets on the Wall (#498)', () => {
  it('shows the two sheets chosen on their cards side by side, at one scale', () => {
    const ui = wall();
    assert.equal(dialog(ui), null);
    click(pickButton(ui, 'A-101'));
    assert.equal(dialog(ui), null, 'one pick waits for a second');
    assert.ok(ui.querySelector('output'));
    click(pickButton(ui, 'A-103'));
    assert.ok(dialog(ui));
    assert.deepEqual([paneSheet(ui, 0), paneSheet(ui, 1)], [ids()[0], ids()[2]]);
    const [a, b] = [0, 1].map((i) => pane(ui, i).querySelector('svg')!);
    assert.equal(a.getAttribute('width') ?? a.style.width, b.getAttribute('width') ?? b.style.width, 'sheets of one paper size hang at the same width');
  });

  it('pan together moves both panes by the same amount; off, it moves one', () => {
    const ui = wall();
    open(ui);
    scrollTo(pane(ui, 0), 40, 25);
    assert.deepEqual(at(pane(ui, 1)), [40, 25]);
    scrollTo(pane(ui, 1), 50, 30);
    assert.deepEqual(at(pane(ui, 0)), [50, 30]);
    click(ui.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    scrollTo(pane(ui, 0), 90, 60);
    assert.deepEqual(at(pane(ui, 1)), [50, 30], 'the other pane stayed');
  });

  it('swaps the two sheets', () => {
    const ui = wall();
    open(ui);
    click(ui.querySelector<HTMLButtonElement>('button[aria-label="Swap the two sheets"]')!);
    assert.deepEqual([paneSheet(ui, 0), paneSheet(ui, 1)], [ids()[2], ids()[0]]);
  });

  it('closes on Esc and on the button, leaving the Wall at the zoom it had', () => {
    const ui = wall();
    act(() => useWallZoom.setState({ k: 2 }));
    open(ui);
    act(() => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    assert.equal(dialog(ui), null);
    assert.equal(useWallZoom.getState().k, 2);
    assert.ok(pickButton(ui, 'A-101'), 'the Wall is still there');
    open(ui);
    click(ui.querySelector<HTMLButtonElement>('button[aria-label^="Back to the Wall"]')!);
    assert.equal(dialog(ui), null);
    assert.equal(useWallZoom.getState().k, 2);
  });

  it('is reachable by keyboard: modal and labelled, focus on close, controls are buttons, a select and a checkbox', () => {
    const ui = wall();
    open(ui);
    const d = dialog(ui)!;
    assert.equal(d.getAttribute('aria-modal'), 'true');
    assert.equal(d.getAttribute('aria-label'), 'Compare two sheets');
    assert.equal(document.activeElement, ui.querySelector('button[aria-label^="Back to the Wall"]'));
    for (const el of d.querySelectorAll('button, select, input')) assert.ok(el.getAttribute('aria-label') || el.closest('label') || el.textContent, 'every control is named');
    for (const side of [0, 1]) assert.equal(pane(ui, side).tabIndex, 0, 'a pane takes focus, so arrows pan it');
    const select = d.querySelector<HTMLSelectElement>('select[aria-label="Right sheet"]')!;
    act(() => {
      select.value = ids()[1];
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.equal(paneSheet(ui, 1), ids()[1]);
    assert.equal(useWallCompare.getState().pair?.[1], ids()[1]);
  });
});
