/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { hangSchedule } from '@/project/drawing-set-actions';
import { resetProject, useProjectStore } from '@/project/project-store';
import { sheetDrawingArea } from '@/project/viewport-resize';
import type { ModelExtent } from '@/project/drawing-set';
import { addSchedule } from '@/joinery/schedules';
import { manyTypes } from '@/joinery/schedule-fit.test';
import { SteppedSheet } from './SteppedSheet.js';

/** #186: the split offer can place the parts side by side, in one undo step. */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(() => cleanup());

describe('the split offer places parts side by side (#186)', () => {
  it('splitting with it on puts parts that fit together on one sheet; the whole split is ONE undo step', () => {
    const id = addSchedule('all', 'Joinery');
    const sheetId = hangSchedule(id, manyTypes(40));
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    const ui = render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} scheduleRows={() => manyTypes(40)} />);
    const button = (label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
    const toggle = ui.querySelector('[data-schedule-fit-offer] [data-side-by-side]')!;
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'off until chosen');
    click(toggle);
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    const before = useProjectStore.getState().sheets.length;
    click(button('One per storey'));
    const held = useProjectStore.getState().sheets.slice(before);
    // Whatever shares a sheet stands inside the drawing area, top-aligned, 8 mm apart.
    for (const s of held.filter((x) => (x.viewports ?? []).length > 1)) {
      const area = sheetDrawingArea(s);
      const [a, b] = s.viewports!;
      assert.equal(b.y, a.y);
      assert.equal(b.x - b.width / 2 - (a.x + a.width / 2), 8);
      assert.ok(a.x - a.width / 2 >= area.x && b.x + b.width / 2 <= area.x + area.w + 1e-9);
    }
    act(() => { undoDrafts(); });
    assert.equal(useProjectStore.getState().sheets.length, before, 'one undo takes every part and sheet back');
  });
});
