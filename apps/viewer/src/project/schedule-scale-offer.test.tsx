/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186 follow-ups on the schedule's scale and the split offer's page count.
 *  - The scale: a schedule has ONE (`schedule.scale`). The card's field writes it, so the layout, the pages and the fit follow, and a
 *    viewport's copy cannot stay different from it.
 *  - The offer: it quotes the pages the sheet draws (`joineryPages`, the same input as `layoutJoineryOnSheet`), element views included.
 */
import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { cleanup, render, waitFor } from '@/test/render.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { ViewportCard } from '@/components/viewer/wall/ViewportCard';
import { ScheduleFitOffer } from '@/components/viewer/wall/ScheduleFitOffer';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { addSchedule, scheduleById, updateSchedule } from '@/joinery/schedules.js';
import { scheduleDataOf } from '@/joinery/schedule-split.js';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { joineryPages, layoutJoineryOnSheet, syncSchedulePages } from './schedule-fit.js';
import { updateViewport } from './sheets.js';
import type { ProjectSheet } from './types.js';

const sheets = () => useProjectStore.getState().sheets;
const holders = (id: string) => sheets().filter((s) => (s.viewports ?? []).some((v) => v.viewId === id)).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
const viewportScales = (id: string) => sheets().flatMap((s) => (s.viewports ?? []).filter((v) => v.viewId === id).map((v) => v.scale));

/** A catalogue of `n` door and window types: enough for a joinery schedule to take several sheets. */
function catalogue(n: number): void {
  useProjectStore.setState({ joineryTypes: Array.from({ length: n }, (_, i) => ({ ...(i % 2 ? defaultDoorSpec(`D${i}`) : defaultWindowSpec(`W${i}`)), id: `t${i}`, mark: `${i % 2 ? 'D' : 'W'}${i}` })) });
}

/** What the Wall draws for the schedule's first sheet (`useSheetSchedules`), read from the store as the Wall does. */
function drawn(id: string) {
  const first = holders(id)[0].id;
  const out: { layout: ReturnType<typeof useSheetSchedules> | null } = { layout: null };
  function Probe() {
    const sheet = useProjectStore((s) => s.sheets.find((x) => x.id === first)!);
    out.layout = useSheetSchedules(sheet);
    return null;
  }
  render(<Probe />);
  return () => out.layout!.get(id)!;
}

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('the card\'s scale field writes the schedule\'s scale', () => {
  it('changing it changes the schedule\'s scale, every viewport\'s, and with them the layout, the pages and the sheets', () => {
    catalogue(40);
    const id = addSchedule('all', 'Joinery');
    hangSchedule(id);
    const before = drawn(id);
    const pagesBefore = before().pages!;
    assert.equal(holders(id).length, pagesBefore, 'hung over the pages it takes at 1:50');
    cleanup();

    const first = holders(id)[0];
    const slot = first.viewports!.find((v) => v.viewId === id)!;
    const ui = render(<ViewportCard sheet={first} slot={slot} onOpen={() => {}} onChoose={() => {}} />);
    choose(ui.querySelector('select')!, '20');
    assert.equal(scheduleById(id)!.scale, 20, 'the schedule\'s own scale is what changed');
    assert.deepEqual([...new Set(viewportScales(id))], [20], 'and every viewport shows it');
    cleanup();

    const after = drawn(id);
    assert.ok(after().pages! > pagesBefore, `bigger cards take more pages (${pagesBefore} -> ${after().pages})`);
    assert.equal(holders(id).length, after().pages, 'the continuation sheets follow the new layout');
    assert.deepEqual([...new Set(viewportScales(id))], [20]);
  });

  it('a viewport whose scale drifted from the schedule\'s is put back when the schedule is laid out', () => {
    catalogue(40);
    const id = addSchedule('all', 'Joinery');
    updateSchedule(id, { scale: 20 });
    hangSchedule(id);
    const first = holders(id)[0];
    act(() => { updateViewport(first.id, first.viewports![0].id, { scale: 100 }); });
    assert.deepEqual([...new Set(viewportScales(id))], [100, 20].sort(), 'drifted');
    act(() => { syncSchedulePages(id, holders(id).length); });
    assert.deepEqual([...new Set(viewportScales(id))], [20], 'back at the schedule\'s scale');
  });
});

describe('the split offer quotes the pages the sheet draws', () => {
  it('on the same input it is exactly the sheet layout\'s page count (one function)', () => {
    catalogue(40);
    const id = addSchedule('all', 'Joinery');
    updateSchedule(id, { scale: 20 });
    hangSchedule(id);
    const sheet = holders(id)[0] as ProjectSheet;
    const vp = sheet.viewports!.find((v) => v.viewId === id)!;
    const data = scheduleDataOf(scheduleById(id)!);
    const labels = { locale: 'en', title: 'T', mark: '', name: '', size: '', operation: '', sill: '', total: '', uValue: '', fire: '', op: (o: string) => o };
    for (const scale of [50, 20, 10]) {
      const input = { data, scale, sheets: sheets(), sheet, vp };
      assert.equal(joineryPages(input), layoutJoineryOnSheet({ ...input, labels }).pages, `at 1:${scale}`);
    }
  });

  it('says the pages the sheet has, at the schedule\'s scale, not the viewport\'s', () => {
    catalogue(40);
    const id = addSchedule('all', 'Joinery');
    updateSchedule(id, { scale: 20 });
    hangSchedule(id);
    const sheet = holders(id)[0];
    // The viewport's copy drifts: the offer must not read it.
    act(() => { updateViewport(sheet.id, sheet.viewports![0].id, { scale: 200 }); });
    const ui = render(<ScheduleFitOffer sheet={sheets().find((s) => s.id === sheet.id)!} />);
    const pages = drawn(id)().pages!;
    const body = ui.querySelector('[data-schedule-fit-offer] p:nth-of-type(2)')?.textContent ?? '';
    assert.match(body, new RegExp(`takes ${pages} sheets at 1:20\\.`), body);
  });

  it('counts the element views the sheet draws (they make the cards, and so the count, larger)', { skip: planModelMissing(FZK_HAUS) }, async () => {
    await loadPlanModel(FZK_HAUS);
    const id = addSchedule('all', 'Joinery');
    updateSchedule(id, { scale: 20 });
    const first = hangSchedule(id)!;
    const vp = sheets().find((s) => s.id === first)!.viewports![0];
    // 300 mm wide: 2 pages for the bare cards, 3 with the views cut from the model (measured).
    act(() => { updateViewport(first, vp.id, { width: 300, height: 350 }); });
    const ui = render(<ScheduleFitOffer sheet={sheets().find((s) => s.id === first)!} />);
    const quoted = () => Number(/takes (\d+) sheets/.exec(ui.querySelector('[data-schedule-fit-offer] p:nth-of-type(2)')?.textContent ?? '')?.[1]);
    const probe = drawn(id);
    await waitFor(() => holders(id).length === 3 && quoted() === 3, 'the offer and the sheet to agree on 3 pages, views included', 30_000);
    assert.equal(quoted(), probe().pages);
  });
});
