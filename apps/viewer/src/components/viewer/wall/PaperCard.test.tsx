/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { drawingArea, type ModelExtent } from '@/project/drawing-set.js';
import { startDrawingSet } from '@/project/drawing-set-actions.js';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import { defaultViews } from '@/project/view-defaults.js';
import type { ProjectLevel, ProjectSheet } from '@/project/types.js';
import { paperMm } from '@/project/paper.js';
import { PaperCard } from './PaperCard.js';

/**
 * The paper card of a stepped-into sheet: size, orientation, frame and
 * template, each laying the sheet's drawings out again.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

const plans = (): ProjectSheet => useProjectStore.getState().sheets[0];
const card = (): HTMLElement => render(<PaperCard sheet={plans()} extent={HOUSE} onClose={() => {}} />);
const select = (ui: HTMLElement, label: string): HTMLSelectElement => {
  const found = [...ui.querySelectorAll('label')].find((l) => l.firstChild?.textContent === label)?.querySelector('select');
  assert.ok(found, `a select ${label}`);
  return found;
};
const choose = (el: HTMLSelectElement, value: string): void => {
  act(() => {
    el.value = value;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
};

describe('PaperCard', () => {
  it('switches the sheet to A1 portrait and lays its drawing out inside the new drawing area', () => {
    const ui = card();
    choose(select(ui, 'Size'), 'A1');
    cleanup();
    choose(select(card(), 'Orientation'), 'portrait');
    const sheet = plans();
    assert.deepEqual([sheet.paper, sheet.orientation], ['A1', 'portrait']);
    const area = drawingArea(sheet);
    for (const vp of sheet.viewports ?? []) assert.ok(vp.x >= area.x && vp.x <= area.x + area.w && vp.y >= area.y && vp.y <= area.y + area.h);
  });

  it('keeps a viewport\'s whole box, as the sheet draws it, inside the smaller paper (review of #129)', () => {
    const sheet = plans();
    const vp = sheet.viewports![0];
    useProjectStore.setState({ sheets: [{ ...sheet, viewports: [{ ...vp, x: 300, y: 200 }] }, ...useProjectStore.getState().sheets.slice(1)] });
    const box = { width: 200, height: 100 };
    choose(select(render(<PaperCard sheet={plans()} extent={null} boxOf={() => box} onClose={() => {}} />), 'Size'), 'A4');
    const after = plans().viewports![0];
    const area = drawingArea(plans());
    assert.ok(after.x - box.width / 2 >= area.x && after.x + box.width / 2 <= area.x + area.w, 'across');
    assert.ok(after.y - box.height / 2 >= area.y && after.y + box.height / 2 <= area.y + area.h, 'down');
  });

  it('offers elongated sizes and takes a custom one typed in', () => {
    const ui = card();
    choose(select(ui, 'Size'), 'A3×3');
    assert.deepEqual(plans().paper, { kind: 'elongated', base: 'A3', factor: 3 });
    cleanup();
    const again = card();
    choose(select(again, 'Size'), 'custom');
    const long = again.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    assert.ok(long);
    type(long, '700');
    blur(long);
    assert.deepEqual(plans().paper, { kind: 'custom', widthMm: 700, heightMm: 420 });
  });

  it('takes a custom size as width × height on the sheet, as typed: 300 × 500 is a sheet 300 wide (review of #129)', () => {
    let ui = card();
    choose(select(ui, 'Size'), 'custom');
    const field = (label: string): HTMLInputElement => [...ui.querySelectorAll('label')].find((l) => l.firstChild?.textContent === label)!.querySelector('input')!;
    type(field('Width (mm)'), '300');
    blur(field('Width (mm)'));
    // The Wall hands the card the sheet as it now is.
    cleanup();
    ui = card();
    type(field('Height (mm)'), '500');
    blur(field('Height (mm)'));
    cleanup();
    ui = card();
    assert.deepEqual(paperMm(plans().paper!, plans().orientation), { w: 300, h: 500 });
    assert.equal(plans().orientation, 'portrait');
    assert.equal(field('Width (mm)').value, '300');
    assert.equal(field('Height (mm)').value, '500');
  });

  it('refuses a custom side out of bounds', () => {
    const ui = card();
    choose(select(ui, 'Size'), 'custom');
    const long = ui.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    const before = plans().paper;
    type(long, '20');
    blur(long);
    assert.equal(plans().paper, before);
    assert.equal(long.getAttribute('aria-invalid'), 'true');
  });

  it('refuses a value past the top of its range, which the sheet itself could take: a 20 m side, a 60 mm margin', () => {
    const ui = card();
    choose(select(ui, 'Size'), 'custom');
    const width = [...ui.querySelectorAll('label')].find((l) => l.firstChild?.textContent === 'Width (mm)')!.querySelector('input')!;
    const before = plans().paper;
    type(width, '20000');
    blur(width);
    assert.equal(plans().paper, before, 'a custom side over 10 000 mm is not applied');
    assert.equal(width.getAttribute('aria-invalid'), 'true');

    const frame = plans().frame;
    const left = [...ui.querySelectorAll('label')].find((l) => l.firstChild?.textContent === 'Left')!.querySelector('input')!;
    type(left, '60');
    blur(left);
    assert.deepEqual(plans().frame, frame, 'a margin over 50 mm is not applied');
    assert.equal(left.getAttribute('aria-invalid'), 'true');
  });

  it('refuses margins that leave no room for the title block, and says why (review of #129)', () => {
    useProjectStore.setState({ sheets: [{ ...plans(), paper: { kind: 'custom', widthMm: 200, heightMm: 200 } }, ...useProjectStore.getState().sheets.slice(1)] });
    const ui = card();
    const before = plans();
    for (const side of ['Left', 'Right']) {
      const input = [...ui.querySelectorAll('label')].find((l) => l.firstChild?.textContent === side)!.querySelector('input')!;
      type(input, '50');
      blur(input);
    }
    // Left 50 still leaves a 140 mm frame: too narrow for the 180 mm title block already, so it is refused, and so is right.
    assert.deepEqual(plans().frame, before.frame);
    assert.match(ui.querySelector('[role="alert"]')?.textContent ?? '', /title block/);
  });

  it('starts from a template and then follows the person: a hand change lets go of it', () => {
    choose(select(card(), 'Template'), 'builtin:a3-details');
    assert.deepEqual([plans().paper, plans().templateId, plans().frame?.margins.left], ['A3', 'builtin:a3-details', 20]);
    cleanup();
    choose(select(card(), 'Title block'), 'right');
    assert.equal(plans().frame?.titleBlock, 'right');
    assert.equal(plans().templateId, undefined);
  });

  it('saves the sheet as a template of the project, and a series can start from it', () => {
    choose(select(card(), 'Size'), 'A0');
    cleanup();
    const ui = card();
    const name = [...ui.querySelectorAll('input')].find((i) => i.closest('label')?.textContent?.startsWith('Save these settings'));
    assert.ok(name);
    type(name, 'Big plans');
    click([...ui.querySelectorAll('button')].find((b) => b.textContent === 'Save template')!);
    const saved = useProjectStore.getState().sheetTemplates ?? [];
    assert.deepEqual(saved.map((t) => [t.name, t.paper]), [['Big plans', 'A0']]);
    cleanup();
    choose(select(card(), 'New Plans sheets start from'), saved[0].id);
    assert.equal(useProjectStore.getState().seriesTemplates?.plans, saved[0].id);
  });
});
