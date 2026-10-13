/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { ProjectDrawer } from './ProjectDrawer.js';
import { useWallNav } from './wall-nav.js';

/**
 * The project drawer: a click goes to a sheet, brings a drawing forward on
 * its sheet, or adds a schedule on a sheet of its own; the cross deletes.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, drawer: true });
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

const button = (ui: HTMLElement, text: string | RegExp) => {
  const b = [...ui.querySelectorAll('button')].find((x) => (typeof text === 'string' ? x.textContent === text : text.test(x.textContent ?? '')));
  assert.ok(b, `a button ${String(text)}`);
  return b;
};

describe('ProjectDrawer', () => {
  it('steps into a sheet and closes', () => {
    let closed = 0;
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => { closed++; }} />);
    click(button(ui, /^A-201/));
    const sheet = useProjectStore.getState().sheets.find((s) => s.number === 'A-201');
    assert.equal(useWallNav.getState().stepped, sheet?.id);
    assert.equal(closed, 1);
  });

  it('brings a drawing forward on the sheet it hangs on', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'East Elevation'));
    const east = useProjectStore.getState().views.find((v) => v.name === 'East Elevation');
    const sheet = useProjectStore.getState().sheets.find((s) => s.viewports?.some((vp) => vp.viewId === east?.id));
    assert.deepEqual([useWallNav.getState().stepped, useWallNav.getState().focus], [sheet?.id, east?.id]);
  });

  it('adds a material takeoff on a new A-6xx sheet and goes there', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, '+ Material takeoff'));
    const sheet = useProjectStore.getState().sheets.find((s) => s.number === 'A-601');
    assert.ok(sheet);
    assert.equal(useProjectStore.getState().schedules?.find((s) => s.id === sheet.viewports?.[0]?.viewId)?.kind, 'materials');
    assert.equal(useWallNav.getState().stepped, sheet.id);
  });

  it('starts a blank sheet past the set\'s series', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, '+ Sheet'));
    assert.ok(useProjectStore.getState().sheets.some((s) => s.number === 'A-901'));
  });

  it('deletes with the cross', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    const remove = ui.querySelector<HTMLButtonElement>('button[aria-label="Remove North Elevation"]');
    assert.ok(remove);
    click(remove);
    assert.ok(!useProjectStore.getState().views.some((v) => v.name === 'North Elevation'));
  });
});
