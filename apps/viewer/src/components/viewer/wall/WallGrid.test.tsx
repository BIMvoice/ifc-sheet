/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activate, cleanup, click, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { groupScale, startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { WallGrid } from './WallGrid.js';

/**
 * The Wall: the whole set in view by kind; a sheet is taken away with its
 * cross, stepped into with a double-click (or Enter), and the plans' scale is
 * one tap above it.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [
  { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] },
  { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] },
];

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

const sheetButtons = (ui: HTMLElement) => [...ui.querySelectorAll<HTMLButtonElement>('button')].filter((b) => /^A-\d{3} /.test(b.getAttribute('aria-label') ?? ''));

describe('WallGrid', () => {
  it('hangs every sheet, grouped by plans, elevations and sections', () => {
    const ui = render(<WallGrid extent={HOUSE} onStep={() => {}} />);
    assert.deepEqual(sheetButtons(ui).map((b) => b.getAttribute('aria-label')), [
      'A-101 Floor plans', 'A-201 Elevations, south and north', 'A-202 Elevations, east and west', 'A-301 Sections',
    ]);
    assert.deepEqual([...ui.querySelectorAll('section h2')].map((h) => h.textContent), ['Plans', 'Elevations', 'Sections']);
    assert.equal(ui.querySelectorAll('svg').length >= 4, true, 'each sheet is drawn as its paper');
  });

  it('takes a sheet away with its cross', () => {
    const ui = render(<WallGrid extent={HOUSE} onStep={() => {}} />);
    const remove = ui.querySelector<HTMLButtonElement>('button[aria-label="Remove A-202 Elevations, east and west"]');
    assert.ok(remove);
    click(remove);
    assert.deepEqual(useProjectStore.getState().sheets.map((s) => s.number), ['A-101', 'A-201', 'A-301']);
  });

  it('steps into a sheet on double-click and on Enter', () => {
    const stepped: string[] = [];
    const ui = render(<WallGrid extent={HOUSE} onStep={(id) => stepped.push(id)} />);
    const [plans, , , sections] = sheetButtons(ui);
    plans.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    activate(sections, 'Enter');
    const ids = useProjectStore.getState().sheets;
    assert.deepEqual(stepped, [ids[0].id, ids[3].id]);
  });

  it('sets the scale of the plans and only of the plans', () => {
    const ui = render(<WallGrid extent={HOUSE} onStep={() => {}} />);
    const chip = [...ui.querySelectorAll('button')].find((b) => b.textContent === '1 : 50');
    assert.ok(chip);
    click(chip);
    assert.equal(groupScale('plans'), 50);
    assert.deepEqual(useProjectStore.getState().sheets.filter((x) => x.number.startsWith('A-2')).map((x) => x.viewports?.map((v) => v.scale)), [[100, 100], [50, 50]], 'the elevations stay as the set made them');
    assert.equal(chip.getAttribute('aria-pressed'), 'true');
  });

  it('sets the scale of the elevations from their own row, leaving the plans', () => {
    const ui = render(<WallGrid extent={HOUSE} onStep={() => {}} />);
    const row = [...ui.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent === 'Scale of the elevations');
    assert.ok(row, 'a scale row for the elevations');
    const chip = [...row.querySelectorAll('button')].find((b) => b.textContent === '1 : 200');
    assert.ok(chip);
    click(chip);
    assert.equal(groupScale('elevations'), 200);
    assert.equal(groupScale('plans'), 50);
  });
});
