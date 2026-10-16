/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, click, press, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { parseScale } from './ScaleField.js';
import { ViewportCard } from './ViewportCard.js';

/**
 * The scale of a drawing on a sheet, on the Wall: any offered scale, any
 * other typed in, and a warning (with the scale that fits) when the drawing
 * is larger than the sheet's drawing area.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
/** The ground plan's drawing: 10 × 6 m. On A2 it fits at 1:20, not at 1:10. */
const PLAN = { min: { x: 0, y: 0 }, max: { x: 10, y: 6 } };

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

const plans = () => useProjectStore.getState().sheets[0];
const slot = () => plans().viewports![0];

function card(): HTMLElement {
  return render(<ViewportCard sheet={plans()} slot={slot()} onOpen={() => {}} onChoose={() => {}} drawingBounds={PLAN} />);
}

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

describe('parseScale', () => {
  it('reads a denominator however it is typed, and refuses what is not one', () => {
    assert.deepEqual(['33', '1:33', ' 1 : 33 '].map(parseScale), [33, 33, 33]);
    assert.deepEqual(['0', '1:0', '2.5', 'abc', '1:200000'].map(parseScale), [null, null, null, null, null]);
  });
});

describe('ScaleField (in the drawing card)', () => {
  it('takes a scale that is not offered, typed in', () => {
    const ui = card();
    choose(ui.querySelector('select')!, 'other');
    const input = ui.querySelector<HTMLInputElement>('input[inputmode="numeric"]');
    assert.ok(input, 'Other… opens a field to type the scale');
    type(input, '1:33');
    press(input, 'Enter');
    assert.equal(slot().scale, 33);
    const plan = useProjectStore.getState().views.find((v) => v.id === slot().viewId);
    assert.equal(plan?.scale, 33, 'the view\'s annotation follows the scale');
  });

  it('says when the drawing does not fit the sheet, and sets the scale that fits', () => {
    const ui = card();
    choose(ui.querySelector('select')!, '10');
    cleanup();
    const again = card();
    const warning = again.querySelector('output');
    assert.match(warning?.textContent ?? '', /larger than the sheet's drawing area \(574 × 350 mm\)/);
    const fix = [...again.querySelectorAll('button')].find((b) => b.textContent === 'Use 1 : 20, it fits');
    assert.ok(fix);
    click(fix);
    assert.equal(slot().scale, 20);
  });

  it('says nothing while the drawing fits', () => {
    const ui = card();
    assert.equal(ui.querySelector('output'), null);
  });
});
