/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { registerLocale, setLocale } from '@/i18n/registry';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import type { ProjectLevel } from '@/project/types';
import { AddDrawing } from './AddDrawing.js';

/**
 * "Add a drawing" (#20 step 11): a plan of a storey reuses that storey's plan
 * or makes one, an elevation reuses its side's, a section starts the line on a
 * plan, and a detail marks its area on the drawing in front.
 */

const LEVELS: ProjectLevel[] = [
  { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] },
  { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] },
];

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS).filter((v) => !(v.kind === 'plan' && v.level.name === 'First Floor')) });
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const button = (ui: HTMLElement, text: RegExp) => {
  const b = [...ui.querySelectorAll('button')].find((x) => text.test(x.textContent ?? ''));
  assert.ok(b, `a button ${text}`);
  return b;
};

describe('AddDrawing', () => {
  it('makes the plan of a storey that has none, and reuses one that has', () => {
    const made: string[] = [];
    const ui = render(<AddDrawing onView={(id) => made.push(id)} onSection={() => {}} onDetail={() => {}} onClose={() => {}} />);
    click(button(ui, /Plan of a storey/));
    click(button(ui, /^First Floor$/));
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan' && v.level.name === 'First Floor');
    assert.ok(plan, 'a plan was made for the first floor');
    assert.deepEqual(made, [plan.id]);
    cleanup();
    const again = render(<AddDrawing onView={(id) => made.push(id)} onSection={() => {}} onDetail={() => {}} onClose={() => {}} />);
    click(button(again, /Plan of a storey/));
    click(button(again, /^First Floor$/));
    assert.equal(made[1], plan.id, 'the same plan, not a second one');
  });

  it('reuses the elevation of the side picked', () => {
    const made: string[] = [];
    const ui = render(<AddDrawing onView={(id) => made.push(id)} onSection={() => {}} onDetail={() => {}} onClose={() => {}} />);
    click(button(ui, /^Elevation/));
    click(button(ui, /^East Elevation$/));
    const east = useProjectStore.getState().views.find((v) => v.kind === 'elevation' && v.direction === 'east');
    assert.deepEqual(made, [east?.id]);
  });

  it('starts a section line, and starts a detail', () => {
    let section = 0;
    let detail = 0;
    const ui = render(<AddDrawing onView={() => {}} onSection={() => { section++; }} onDetail={() => { detail++; }} onClose={() => {}} />);
    click(button(ui, /^Section/));
    assert.equal(section, 1);
    assert.equal(button(ui, /Detail of an area/).disabled, false);
    click(button(ui, /Detail of an area/));
    assert.equal(detail, 1);
  });

  // PR #124 review: the side buttons and the name of a façade added here
  // come from `names.view.*`, the same names the starting set uses.
  const sides = (locale: string, elevationChoice: RegExp) => {
    useProjectStore.setState({ views: useProjectStore.getState().views.filter((v) => v.kind !== 'elevation') });
    act(() => setLocale(locale));
    const ui = render(<AddDrawing onView={() => {}} onSection={() => {}} onDetail={() => {}} onClose={() => {}} />);
    click(button(ui, elevationChoice));
    const labels = [...ui.querySelectorAll('section > :not(:first-child) button')].map((b) => b.textContent ?? '');
    click(button(ui, new RegExp(`^${labels[0]}$`)));
    const added = useProjectStore.getState().views.filter((v) => v.kind === 'elevation').map((v) => v.name);
    return { labels, added };
  };

  it('names the sides, and a façade added through it, in Romanian under ro', () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    assert.deepEqual(sides('ro', /^Fațadă/), { labels: ['Fațada nord', 'Fațada est', 'Fațada sud', 'Fațada vest'], added: ['Fațada nord'] });
  });

  it('names them exactly as before under en', () => {
    assert.deepEqual(sides('en', /^Elevation/), { labels: ['North Elevation', 'East Elevation', 'South Elevation', 'West Elevation'], added: ['North Elevation'] });
  });
});
