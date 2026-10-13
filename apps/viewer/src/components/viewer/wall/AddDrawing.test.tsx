/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import type { ProjectLevel } from '@/project/types';
import { AddDrawing } from './AddDrawing.js';

/**
 * "Add a drawing" (#20 step 11): a plan of a storey reuses that storey's plan
 * or makes one, an elevation reuses its side's, a section starts the line on a
 * plan, and a detail is not offered yet.
 */

const LEVELS: ProjectLevel[] = [
  { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] },
  { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] },
];

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS).filter((v) => !(v.kind === 'plan' && v.level.name === 'First Floor')) });
});
afterEach(() => cleanup());

const button = (ui: HTMLElement, text: RegExp) => {
  const b = [...ui.querySelectorAll('button')].find((x) => text.test(x.textContent ?? ''));
  assert.ok(b, `a button ${text}`);
  return b;
};

describe('AddDrawing', () => {
  it('makes the plan of a storey that has none, and reuses one that has', () => {
    const made: string[] = [];
    const ui = render(<AddDrawing onView={(id) => made.push(id)} onSection={() => {}} onClose={() => {}} />);
    click(button(ui, /Plan of a storey/));
    click(button(ui, /^First Floor$/));
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan' && v.level.name === 'First Floor');
    assert.ok(plan, 'a plan was made for the first floor');
    assert.deepEqual(made, [plan.id]);
    cleanup();
    const again = render(<AddDrawing onView={(id) => made.push(id)} onSection={() => {}} onClose={() => {}} />);
    click(button(again, /Plan of a storey/));
    click(button(again, /^First Floor$/));
    assert.equal(made[1], plan.id, 'the same plan, not a second one');
  });

  it('reuses the elevation of the side picked', () => {
    const made: string[] = [];
    const ui = render(<AddDrawing onView={(id) => made.push(id)} onSection={() => {}} onClose={() => {}} />);
    click(button(ui, /^Elevation/));
    click(button(ui, /^East Elevation$/));
    const east = useProjectStore.getState().views.find((v) => v.kind === 'elevation' && v.direction === 'east');
    assert.deepEqual(made, [east?.id]);
  });

  it('starts a section line, and does not offer a detail yet', () => {
    let section = 0;
    const ui = render(<AddDrawing onView={() => {}} onSection={() => { section++; }} onClose={() => {}} />);
    click(button(ui, /^Section/));
    assert.equal(section, 1);
    assert.equal(button(ui, /Detail of an area/).disabled, true);
  });
});
