/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, "Done when": a "Manufacturer" text row typed in on the schedule's card prints on the sheet, and the Size row stays bound to
 * the model: when a window is resized the sheet prints the new size and keeps the text typed for it.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWindowSpec } from '@ifc-lite/create';
import { blur, cleanup, click, render, type as typeInto } from '@/test/render.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { ScheduleTextCard } from '@/components/viewer/wall/ScheduleTextCard';
import { addSchedule, scheduleById } from '@/joinery/schedules.js';
import { openSection } from '@/test/open-section.js';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import type { ProjectSheet } from './types.js';

const win = { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1', name: 'Fixed window', width: 1.2, height: 1.5 };

function printed(id: string): string[] {
  const sheet = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === id)) as ProjectSheet;
  const out: { layout: ReturnType<typeof useSheetSchedules> | null } = { layout: null };
  function Probe() { out.layout = useSheetSchedules(sheet); return null; }
  render(<Probe />);
  const texts = out.layout!.get(id)!.prims.flatMap((p) => (p.kind === 'text' && p.text ? [p.text] : []));
  return texts;
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('text cells beside bound cells', () => {
  it('a Manufacturer typed on the card prints; resizing the window changes the printed Size and keeps the text', () => {
    useProjectStore.setState({ joineryTypes: [win] });
    const id = addSchedule('all', 'Joinery');
    hangSchedule(id);
    const card = render(<ScheduleTextCard schedule={scheduleById(id)!} />);
    openSection(card, 'Text rows');
    click([...card.querySelectorAll('button')].find((b) => b.textContent === '+ Add a text row')!);
    const row = scheduleById(id)!.textRows![0];
    const rename = card.querySelector<HTMLInputElement>('input[aria-label="Row name"]')!;
    typeInto(rename, 'Manufacturer');
    blur(rename);
    // The card is drawn again from the schedule as it now is.
    cleanup();
    const again = render(<ScheduleTextCard schedule={scheduleById(id)!} />);
    const cell = again.querySelector<HTMLInputElement>('input[aria-label="Manufacturer, W1 Fixed window"]');
    assert.ok(cell, [...again.querySelectorAll('input')].map((i) => i.getAttribute('aria-label')).join('|'));
    typeInto(cell, 'Velux');
    blur(cell);
    assert.equal(scheduleById(id)!.textRows![0].cells.w1.text, 'Velux', `typed on row ${row.id}`);

    const before = printed(id);
    assert.ok(before.includes('Manufacturer') && before.includes('Velux'), `the text prints: ${before}`);
    assert.ok(before.some((t) => /1200\s*[×x]\s*1500/.test(t)), `Size is bound to the model: ${before}`);

    // The window is resized in the model: the catalogue entry follows.
    useProjectStore.setState({ joineryTypes: [{ ...win, width: 1.5, height: 1.8 }] });
    const after = printed(id);
    assert.ok(after.some((t) => /1500\s*[×x]\s*1800/.test(t)) && !after.some((t) => /1200\s*[×x]\s*1500/.test(t)), `Size follows the resize: ${after}`);
    assert.ok(after.includes('Velux'), 'the text typed for the type is still there');
  });
});
