/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan's view depth on the Wall: empty is the automatic depth (down to this
 * floor, as deep as the cut is high), a depth of its own reaches the floor
 * below, 0 the cut only, a negative value is refused; and the switch that
 * leaves the floor below's dashed lines out, neither offered on a reflected
 * ceiling plan.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { viewProjection } from '@bimvoice/ifcsheet';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { PlanProjectView, ProjectSheet, SheetViewport } from '@/project/types';
import { ViewportCard } from './ViewportCard.js';

const PLAN: PlanProjectView = { id: 'p', kind: 'plan', name: 'Upper', createdAt: 0, level: { name: 'Upper', elevation: 2.8, storeyGlobalIds: [] }, cutHeight: 1.2 };
const VIEWPORT: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null };
const SHEET: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [VIEWPORT] };

const stored = (): PlanProjectView => useProjectStore.getState().views.find((v) => v.id === 'p') as PlanProjectView;
const card = (): HTMLElement => render(<ViewportCard sheet={SHEET} slot={VIEWPORT} onOpen={() => {}} onChoose={() => {}} />);
const depth = (ui: HTMLElement): HTMLInputElement | null => ui.querySelector('input[aria-label="View depth"]');
const lowerFloor = (ui: HTMLElement): HTMLInputElement | null => ui.querySelector('input[aria-label="Draw the floor below"]');

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ views: [PLAN], sheets: [SHEET] });
});
afterEach(() => cleanup());

describe('a plan\'s view depth on the Wall', () => {
  it('is automatic, down to this floor at the cut height', () => {
    const ui = card();
    assert.equal(depth(ui)?.value, '');
    assert.equal(depth(ui)?.placeholder, 'To this floor (1.20 m)');
    assert.deepEqual(viewProjection(stored()), { showConstructionProjection: true, constructionProjectionDepth: 1.2 });
  });

  it('takes a depth of its own, and the drawing reads it', () => {
    const ui = card();
    type(depth(ui)!, '4');
    blur(depth(ui)!);
    assert.equal(stored().viewDepth, 4);
    assert.equal(depth(ui)?.value, '4');
    assert.deepEqual(viewProjection(stored()), { showConstructionProjection: true, constructionProjectionDepth: 4 });
  });

  it('emptied, it is automatic again; 0 is the cut only', () => {
    const ui = card();
    type(depth(ui)!, '4');
    blur(depth(ui)!);
    type(depth(ui)!, '');
    blur(depth(ui)!);
    assert.equal(stored().viewDepth, null);
    type(depth(ui)!, '0');
    blur(depth(ui)!);
    assert.equal(stored().viewDepth, 0);
    assert.deepEqual(viewProjection(stored()), { showConstructionProjection: false, constructionProjectionDepth: 0 });
  });

  it('refuses a negative depth and puts the field back', () => {
    const ui = card();
    type(depth(ui)!, '-2');
    blur(depth(ui)!);
    assert.equal(stored().viewDepth, undefined);
    assert.equal(depth(ui)?.value, '');
  });

  it('draws the floor below by default, and can leave its dashed lines out', () => {
    const ui = card();
    assert.equal(lowerFloor(ui)?.checked, true);
    click(lowerFloor(ui)!);
    assert.equal(stored().showLowerFloor, false);
    assert.equal(lowerFloor(ui)?.checked, false);
    click(lowerFloor(ui)!);
    assert.equal(stored().showLowerFloor, true);
    assert.equal(lowerFloor(ui)?.checked, true);
  });

  it('is not offered on a reflected ceiling plan', () => {
    useProjectStore.setState({ views: [{ ...PLAN, reflected: true }] });
    const ui = card();
    assert.equal(depth(ui), null);
    assert.equal(lowerFloor(ui), null);
  });
});
