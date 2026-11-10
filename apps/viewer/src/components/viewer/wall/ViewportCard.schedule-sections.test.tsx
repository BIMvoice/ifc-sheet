/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #605: the joinery schedule's sections in the viewport card (sub-reports, content, filter, text) were four siblings
 * on one key, so each update of the card added another set. One set, however often the card is drawn again.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { hangSchedule } from '@/project/drawing-set-actions.js';
import { addSchedule, updateSchedule } from '@/joinery/schedules.js';
import { ViewportCard } from './ViewportCard.js';

beforeEach(() => resetProject());
afterEach(() => cleanup());

/** The headings of the card's sections, in the order they are drawn. */
const headings = (ui: HTMLElement): string[] => [...ui.querySelectorAll('button, h2, h3, p, span')].map((e) => (e.textContent ?? '').trim().toLowerCase()).filter((x) => /^(sub-reports|content|filter|text rows)/.test(x));

describe('the viewport card of a door and window schedule', () => {
  it('shows one set of sections, however many times it is drawn again', () => {
    const id = addSchedule('all', 'Doors and windows');
    hangSchedule(id);
    const sheet = () => useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id))!;
    const slot = () => sheet().viewports!.find((v) => v.viewId === id)!;
    const ui = render(<ViewportCard sheet={sheet()} slot={slot()} onOpen={() => {}} onChoose={() => {}} />);
    const first = headings(ui);
    assert.ok(first.length >= 3, `the sections are drawn at all: ${JSON.stringify(first)}`);
    for (let i = 0; i < 4; i++) act(() => updateSchedule(id, { name: `Doors and windows ${i}` }));
    assert.deepEqual(headings(ui), first);
  });
});
