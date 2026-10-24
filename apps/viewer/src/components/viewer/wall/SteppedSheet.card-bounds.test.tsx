/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { hangSchedule } from '@/project/drawing-set-actions';
import { resetProject, useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import type { ModelExtent } from '@/project/drawing-set';
import { addSchedule } from '@/joinery/schedules';
import { manyTypes } from '@/joinery/schedule-fit.test';
import { SteppedSheet } from './SteppedSheet.js';
import { WALL_CARD, WALL_CARD_BOUND, WALL_CARD_HOST } from './wall-type';

/** #288 (jsdom has no stylesheet, so the classes are asserted; the computed styles are the Playwright spec's): a card taller than the sheet scrolls inside itself; it never pushes the app shell. */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(() => cleanup());

const tokens = (el: Element | null | undefined) => (el?.className ?? '').split(/\s+/);

describe('the viewport card is bounded (#288)', () => {
  it('sits in a host no taller than the sheet area and is itself a scrolling flex child', () => {
    const id = addSchedule('all', 'Joinery');
    const sheetId = hangSchedule(id, manyTypes(2));
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    const ui = render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} scheduleRows={() => manyTypes(2)} />);
    const k = Math.min((1280 - 24) / paperOf(sheet).w, (800 - 24) / paperOf(sheet).h);
    const vp = sheet.viewports![0];
    const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]')!;
    act(() => {
      canvas.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, clientX: (1280 - paperOf(sheet).w * k) / 2 + vp.x * k, clientY: (800 - paperOf(sheet).h * k) / 2 + vp.y * k }));
    });
    const card = ui.querySelector('aside');
    assert.ok(card, 'the card is up');
    const host = card.parentElement!;
    for (const t of WALL_CARD_HOST.split(' ')) assert.ok(tokens(host).includes(t), `host has ${t}`);
    assert.ok(tokens(host).includes('max-h-[calc(100%-1.5rem)]'), 'host is bounded by the sheet area');
    for (const t of ['min-h-0', 'overflow-y-auto']) assert.ok(tokens(card).includes(t), `card has ${t}`);
  });

  it('every card on the shared surface carries the bound', () => {
    for (const t of WALL_CARD_BOUND.split(' ')) assert.ok(WALL_CARD.split(' ').includes(t), t);
  });
});
