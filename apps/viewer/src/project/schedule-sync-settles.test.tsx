/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186: a schedule that pages must SETTLE. The Wall once removed and recreated the continuation sheets (A-601.1…) without end, 60
 * sync calls alternating between 1 and 2 pages: the `joinery` memo of `useSheetSchedules` depended on `sheet.viewports`, so every
 * write of a continuation viewport dropped the element views, the page count fell back to the one "without views", the extra sheet
 * was removed, the views came back, and the sheet was made again. It is keyed on WHICH schedules the sheet holds now.
 *
 * Mounts a sheet whose joinery schedule takes MORE pages with its element views (cut from the real FZK-Haus geometry) than
 * without them, which is the case the loop needs. Skipped without the fixture or the wasm bundle.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, waitFor } from '@/test/render.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { addSchedule, updateSchedule } from '@/joinery/schedules.js';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { updateViewport } from './sheets.js';

/** Two sheets of types, wrapped to a 300 mm box at 1:20: 2 pages without the element views, 3 with them (measured on this model). */
const SCALE = 20;
const BOX = { width: 300, height: 350 };

/** The Wall's own sheet: read from the store each render, so a write reaches the hook as it does there. */
function Probe({ sheetId }: { sheetId: string }) {
  const sheet = useProjectStore((s) => s.sheets.find((x) => x.id === sheetId)!);
  useSheetSchedules(sheet);
  return null;
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a paging schedule on a sheet settles', { skip: planModelMissing(FZK_HAUS) }, () => {
  it('reaches its page count with the views and stays there: a bounded number of sheet writes, no flip between counts', async () => {
    await loadPlanModel(FZK_HAUS);
    const id = addSchedule('all', 'Joinery');
    updateSchedule(id, { scale: SCALE });
    const first = hangSchedule(id)!;
    const vp = useProjectStore.getState().sheets.find((s) => s.id === first)!.viewports![0];
    updateViewport(first, vp.id, BOX);
    const holders = () => useProjectStore.getState().sheets.filter((s) => (s.viewports ?? []).some((v) => v.viewId === id)).length;

    const counts: number[] = [];
    let writes = 0;
    let seen = useProjectStore.getState().sheets;
    const stop = useProjectStore.subscribe((s) => {
      if (s.sheets === seen) return;
      seen = s.sheets;
      writes++;
      // A loop would starve the test of its own timeout: unmount the sheet to end it, and the assertions below say what happened.
      if (writes === 40) cleanup();
      if (counts[counts.length - 1] !== holders()) counts.push(holders());
    });
    try {
      render(<Probe sheetId={first} />);
      await waitFor(() => holders() === 3, 'the sheets to follow the layout with the views (3 pages)', 30_000);
      // The loop's trigger: a page the user moved is kept in a memory on the FIRST sheet's viewport when its sheet goes, and read back
      // when it returns, so every round of the flip rewrote that viewport. One nudge of the first viewport starts it.
      const last = useProjectStore.getState().sheets.filter((s) => (s.viewports ?? []).some((v) => v.viewId === id)).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))[2];
      act(() => {
        updateViewport(last.id, last.viewports![0].id, { x: last.viewports![0].x + 5 });
        updateViewport(first, vp.id, { x: vp.x + 1 });
      });
      await new Promise((r) => setTimeout(r, 1000));
      await waitFor(() => holders() === 3, 'the third page to be there again', 10_000);
      const settled = writes;
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal(holders(), 3, 'the page count is stable');
      assert.equal(writes, settled, `no further sheet writes once settled (${writes - settled} more)`);
      assert.ok(writes <= 12, `a bounded number of sheet writes (${writes}); the loop made 60`);
      assert.deepEqual(counts.filter((c, i) => i > 0 && c < counts[i - 1]), [], `the page count never falls back: ${counts}`);
    } finally {
      stop();
    }
  });
});
