/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan's overhead band on the Wall (#490): on by default, up to the floor
 * above (the height field empty, its hint saying so); switched off it stores 0
 * and leaves the height out; a height of its own; and no control on a reflected
 * ceiling plan.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { PlanProjectView, ProjectSheet, SheetViewport } from '@/project/types';
import { ViewportCard } from './ViewportCard.js';

const PLAN: PlanProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const VIEWPORT: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null };
const SHEET: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [VIEWPORT] };

const stored = (): PlanProjectView => useProjectStore.getState().views.find((v) => v.id === 'p') as PlanProjectView;

function card(): HTMLElement {
  return render(<ViewportCard sheet={SHEET} slot={VIEWPORT} onOpen={() => {}} onChoose={() => {}} />);
}
const toggle = (ui: HTMLElement): HTMLInputElement | null => ui.querySelector('input[aria-label="Draw what is overhead"]');
const height = (ui: HTMLElement): HTMLInputElement | null => ui.querySelector('input[aria-label="Overhead height"]');

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ views: [PLAN], sheets: [SHEET] });
});
afterEach(() => cleanup());

describe('a plan\'s overhead band on the Wall (#490)', () => {
  it('is on by default, up to the floor above', () => {
    const ui = card();
    assert.equal(toggle(ui)?.checked, true);
    assert.equal(height(ui)?.value, '');
    assert.equal(height(ui)?.placeholder, 'To the floor above');
  });

  it('switched off stores 0 and leaves the height out', () => {
    const ui = card();
    click(toggle(ui)!);
    assert.equal(stored().overheadHeight, 0);
    assert.equal(toggle(ui)?.checked, false);
    assert.equal(height(ui), null, 'no height while off');
    click(toggle(ui)!);
    assert.equal(stored().overheadHeight, null);
    assert.equal(toggle(ui)?.checked, true);
    assert.ok(height(ui), 'the height is back');
  });

  it('takes a height of its own, and an empty field is the floor above again', () => {
    const ui = card();
    type(height(ui)!, '2.5');
    blur(height(ui)!);
    assert.equal(stored().overheadHeight, 2.5);
    const own = height(ui)!;
    assert.equal(own.value, '2.5');
    type(own, '');
    blur(own);
    assert.equal(stored().overheadHeight, null);
  });

  it('is not offered on a reflected ceiling plan', () => {
    useProjectStore.setState({ views: [{ ...PLAN, reflected: true }] });
    const ui = card();
    assert.equal(toggle(ui), null);
  });
});
