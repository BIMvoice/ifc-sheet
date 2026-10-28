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
import { paperOf } from '@/project/sheets';
import type { ModelExtent } from '@/project/drawing-set';
import { addSchedule } from '@/joinery/schedules';
import { manyTypes } from '@/joinery/schedule-fit.test';
import { SteppedSheet } from './SteppedSheet.js';

/** #186: a schedule's settings open on a double-click, and one that does not fit the paper offers to be split. */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const rows = (n: number) => () => manyTypes(n);

beforeEach(() => {
  resetProject();
  clearDraftHistory();
});
afterEach(() => cleanup());

/** A joinery schedule of `n` types hung on its own sheet. */
function hung(n: number) {
  const id = addSchedule('all', 'Joinery');
  const sheetId = hangSchedule(id, manyTypes(n));
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId);
  assert.ok(sheet);
  return { id, sheet };
}
const mount = (sheet: ReturnType<typeof hung>['sheet'], n: number) =>
  render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} scheduleRows={rows(n)} />);
const named = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
/** Whether the offer shows (a boolean, so a failed assertion never prints a DOM tree). */
const offer = (ui: HTMLElement): boolean => ui.querySelector('[data-schedule-fit-offer]') !== null;
const scheduleCount = () => useProjectStore.getState().schedules?.length ?? 0;

describe('double-clicking a schedule on the Wall (#186)', () => {
  it('opens its settings: the card comes forward in place of another panel, with the name ready to type over', () => {
    const { sheet } = hung(2);
    const ui = mount(sheet, 2);
    click(named(ui, 'Paper')!);
    assert.notEqual(document.activeElement?.tagName, 'INPUT', 'the paper card is up, no name field has focus');
    const k = Math.min((1280 - 24) / paperOf(sheet).w, (800 - 24) / paperOf(sheet).h);
    const vp = sheet.viewports![0];
    const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]')!;
    act(() => {
      canvas.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, clientX: (1280 - paperOf(sheet).w * k) / 2 + vp.x * k, clientY: (800 - paperOf(sheet).h * k) / 2 + vp.y * k }));
    });
    const focused = document.activeElement as HTMLInputElement | null;
    assert.equal(focused?.tagName, 'INPUT');
    assert.equal(focused?.value, 'Joinery', 'the schedule\'s name field has focus');
    assert.ok(ui.querySelector('aside')?.contains(focused), 'in the viewport card');
  });
});

describe('a schedule that does not fit the paper offers to split (#186)', () => {
  it('appears only when the schedule takes more than one sheet', () => {
    const big = hung(40);
    assert.ok(offer(mount(big.sheet, 40)), 'forty types do not fit one sheet');
    cleanup();
    resetProject();
    const small = hung(2);
    assert.equal(offer(mount(small.sheet, 2)), false, 'two types do');
  });

  it('offers nothing to a schedule that has been split already, or to a column table', () => {
    const { id, sheet } = hung(40);
    const ui = mount(sheet, 40);
    click(named(ui, 'One per storey')!);
    cleanup();
    const again = useProjectStore.getState().sheets.find((s) => s.id === sheet.id)!;
    assert.equal(offer(mount(again, 40)), false, `${id} has its parts`);
  });

  it('is made for the joinery lists only: a column table pages on its own', () => {
    const id = addSchedule('materials', 'Takeoff');
    const sheetId = hangSchedule(id);
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    assert.equal(offer(mount(sheet, 40)), false);
  });

  it('keeps paging, the default, and changes nothing, until a split is chosen', () => {
    const { sheet } = hung(40);
    const before = { sheets: useProjectStore.getState().sheets, schedules: useProjectStore.getState().schedules };
    const ui = mount(sheet, 40);
    assert.equal(useProjectStore.getState().sheets, before.sheets, 'showing the offer writes nothing');
    click(named(ui, 'Keep paging')!);
    assert.equal(offer(ui), false, 'dismissed');
    assert.equal(useProjectStore.getState().sheets, before.sheets);
    assert.equal(useProjectStore.getState().schedules, before.schedules);
  });

  it('splits one per storey into sub-reports hung on sheets of their own, as ONE undo step', () => {
    const { id, sheet } = hung(40);
    const sheetsBefore = useProjectStore.getState().sheets.length;
    const ui = mount(sheet, 40);
    click(named(ui, 'One per storey')!);
    const parts = (useProjectStore.getState().schedules ?? []).filter((s) => s.sub?.parent === id);
    assert.deepEqual(parts.map((p) => [p.name, p.sub?.filter.levels]), [['Ground', ['Ground']], ['Level 1', ['Level 1']]]);
    const sheets = useProjectStore.getState().sheets;
    for (const p of parts) assert.ok(sheets.some((s) => (s.viewports ?? []).some((v) => v.viewId === p.id)), `${p.name} is on a sheet`);
    act(() => { undoDrafts(); });
    assert.equal(scheduleCount(), 1, 'one undo takes the parts back');
    assert.equal(useProjectStore.getState().sheets.length, sheetsBefore, 'and their sheets');
  });

  it('splits doors and windows apart', () => {
    const { id, sheet } = hung(40);
    const ui = mount(sheet, 40);
    click(named(ui, 'Doors and windows apart')!);
    const parts = (useProjectStore.getState().schedules ?? []).filter((s) => s.sub?.parent === id);
    assert.deepEqual(parts.map((p) => p.sub?.filter.kinds), [['door'], ['window']]);
  });
});
