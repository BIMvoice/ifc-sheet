/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, click, press, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import type { SectionProposal } from '@/project/section-proposals';
import type { ProjectLevel, ProjectSheet, SheetViewport } from '@/project/types';
import { SectionTray } from './SectionTray.js';

/**
 * The tray of sections under a sheet of sections stays out of the sheet's way
 * however many sections the model suggests. A school (ISSUE_068) suggests 89:
 * as a row of buttons the tray stood 990 px high and covered the whole sheet,
 * and Esc did nothing to it. Past a handful the tray is one button opening a
 * list with its own scroll and a search, closed by Esc or a press outside.
 */

const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

const proposal = (i: number): SectionProposal => ({
  key: `room-${i}`,
  label: i === 0 ? 'Through the stair' : `Through Room ${i}`,
  through: i === 0 ? 'stair' : `Room ${i}`,
  a: { x: i, z: -1 },
  b: { x: i, z: 11 },
  side: { x: i + 1, z: 5 },
});
const MANY = Array.from({ length: 89 }, (_, i) => proposal(i));

const slot: SheetViewport = { id: 'vp', viewId: 'none', x: 150, y: 150, scale: 100, width: 0, height: 0, center: null };
const sheet: ProjectSheet = { id: 's', number: 'A-301', name: 'Sections', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports: [slot] };

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS), sheets: [sheet] });
});
afterEach(cleanup);

// Elements are compared with `===` inside `assert.ok`: a failed `assert.equal` on a happy-dom node prints the whole DOM and runs out of memory.
const list = (): HTMLElement | null => document.querySelector<HTMLElement>('dialog[open]');
const sectionButtons = (root: ParentNode): HTMLButtonElement[] => [...root.querySelectorAll('button')].filter((b) => (b.textContent ?? '').startsWith('Through '));
const opener = (ui: HTMLElement): HTMLButtonElement => {
  const b = [...ui.querySelectorAll('button')].find((x) => x.getAttribute('aria-expanded') !== null);
  assert.ok(b, 'the tray offers one button that opens the list of sections');
  return b;
};

describe('SectionTray with many sections (ISSUE_068, 89 suggested)', () => {
  it('lays out one button, not 89, and opens a list of all 89 whose height is bounded and scrolls', () => {
    const ui = render(<SectionTray sheet={sheet} slotId="vp" proposals={MANY} />);
    assert.equal(sectionButtons(ui).length, 0, 'no section is laid out as a button of the tray itself');
    assert.equal(ui.querySelectorAll('button').length, 1, 'one button stands for the 89 sections');
    assert.match(opener(ui).textContent ?? '', /89/, 'the button says how many sections there are');

    click(opener(ui));
    const open = list();
    assert.ok(open, 'the list opened');
    assert.equal(sectionButtons(open).length, 89, 'every section is in the list');
    const scroller = sectionButtons(open)[0].closest('ul');
    assert.ok(scroller, 'the sections sit in a list');
    const style = window.getComputedStyle(scroller);
    assert.notEqual(style.maxHeight, 'none', 'the list has a greatest height');
    // happy-dom resolves the length to pixels (`min(384px, 384px)` in its 1024 x 768 window): the smallest term is the bound.
    const bound = Math.min(...[...style.maxHeight.matchAll(/([\d.]+)px/g)].map((m) => Number(m[1])));
    assert.ok(bound > 0 && bound <= window.innerHeight / 2, `at most half the window high (${style.maxHeight}, window ${window.innerHeight} px), so it never covers the sheet whatever the count`);
    assert.equal(style.overflowY, 'auto', 'past that height the list scrolls on its own');
    const search = open.querySelector('input');
    assert.ok(document.activeElement === search, 'focus goes to the search as the list opens');
  });

  it('closes on Esc and gives focus back to its button, and Esc goes no further', () => {
    const ui = render(<SectionTray sheet={sheet} slotId="vp" proposals={MANY} />);
    const seen: string[] = [];
    const sheetEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') seen.push(e.target instanceof Element && e.target.closest('[data-owns-keys]') ? 'owned' : 'sheet'); };
    window.addEventListener('keydown', sheetEsc, true);
    try {
      click(opener(ui));
      const search = list()?.querySelector('input');
      assert.ok(search);
      press(search, 'Escape');
      assert.ok(list() === null, 'Esc closed the list');
      assert.ok(document.activeElement === opener(ui), 'focus is back on the button that opened it');
      // The sheet's own Esc (SteppedSheet, wall-key-bus) leaves alone a key pressed in a panel that keeps its keys.
      assert.deepEqual(seen, ['owned'], 'the sheet saw the Esc as the tray\'s, so it did not also let go of the chosen drawing');
    } finally {
      window.removeEventListener('keydown', sheetEsc, true);
    }
  });

  it('closes on a press outside it', () => {
    const ui = render(<SectionTray sheet={sheet} slotId="vp" proposals={MANY} />);
    click(opener(ui));
    assert.ok(list());
    act(() => { document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true })); });
    assert.ok(list() === null, 'a press on the sheet closed the list');
  });

  it('finds a section by name and shows the one picked in the chosen slot', () => {
    const ui = render(<SectionTray sheet={sheet} slotId="vp" proposals={MANY} />);
    click(opener(ui));
    const open = list();
    assert.ok(open);
    const search = open.querySelector('input');
    assert.ok(search);
    type(search, 'room 42');
    assert.deepEqual(sectionButtons(open).map((b) => b.textContent), ['Through Room 42'], 'the search narrowed the list to the one section');
    click(sectionButtons(open)[0]);
    const shown = useProjectStore.getState().sheets[0].viewports?.[0].viewId;
    const view = useProjectStore.getState().views.find((v) => v.id === shown);
    assert.equal(view?.kind === 'section' ? view.through : null, 'Through Room 42', 'the slot now shows the section picked');
    assert.ok(list() === null, 'picking closed the list');
  });

  it('keeps a handful of sections as buttons in the tray, as before', () => {
    const ui = render(<SectionTray sheet={sheet} slotId="vp" proposals={MANY.slice(0, 4)} />);
    assert.equal(sectionButtons(ui).length, 4, 'four sections, four buttons');
    assert.equal([...ui.querySelectorAll('button')].some((b) => b.hasAttribute('aria-expanded')), false, 'no list to open');
  });
});
