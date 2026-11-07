/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { blur, cleanup, click, press, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { detailedScaleThatFits, drawingArea, type ModelExtent } from '@/project/drawing-set';
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
/** The ground plan's drawing: 10 × 6 m; at 1:10 it is larger than any sheet the set picks for it. */
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
    // The sheet's own paper (the set picks the smallest that fits) gives the area and the scale offered.
    const area = drawingArea(plans().paper);
    const fits = detailedScaleThatFits(PLAN, plans().paper);
    assert.ok(fits && fits > 10);
    const warning = again.querySelector('output');
    assert.ok((warning?.textContent ?? '').includes(`larger than the sheet's drawing area (${Math.round(area.w)} × ${Math.round(area.h)} mm)`));
    const fix = [...again.querySelectorAll('button')].find((b) => b.textContent === `Use 1 : ${fits}, it fits`);
    assert.ok(fix);
    click(fix);
    assert.equal(slot().scale, fits);
  });

  it('says nothing while the drawing fits', () => {
    const ui = card();
    assert.equal(ui.querySelector('output'), null);
  });

  describe('typed scale: Apply, Cancel and leaving the field (#168)', () => {
    function open(): { ui: HTMLElement; input: HTMLInputElement } {
      const ui = card();
      choose(ui.querySelector('select')!, 'other');
      return { ui, input: ui.querySelector<HTMLInputElement>('input[inputmode="numeric"]')! };
    }
    const button = (ui: HTMLElement, name: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent === name)!;

    it('Apply sets the typed scale and closes the field', () => {
      const { ui, input } = open();
      type(input, '1:33');
      click(button(ui, 'Apply'));
      assert.equal(slot().scale, 33);
      assert.equal(!!ui.querySelector('input[inputmode="numeric"]'), false, 'the field closed');
    });

    it('leaving the field with a valid value applies it', () => {
      const { ui, input } = open();
      type(input, '50');
      blur(input);
      assert.equal(slot().scale, 50);
      assert.equal(!!ui.querySelector('input[inputmode="numeric"]'), false, 'the field closed');
    });

    it('leaving the field empty closes it and changes nothing', () => {
      const before = slot().scale;
      const { ui, input } = open();
      blur(input);
      assert.equal(slot().scale, before);
      assert.equal(!!ui.querySelector('input[inputmode="numeric"]'), false, 'the field closed');
    });

    it('leaving the field with an invalid value keeps it open with the alert', () => {
      const before = slot().scale;
      const { ui, input } = open();
      type(input, 'abc');
      blur(input);
      assert.equal(slot().scale, before);
      assert.ok(ui.querySelector('input[inputmode="numeric"]'));
      assert.ok(ui.querySelector('[role="alert"]'));
    });

    it('Cancel leaves the scale unchanged, even when the field blurs toward it first', () => {
      const before = slot().scale;
      const { ui, input } = open();
      type(input, '40');
      const cancel = button(ui, 'Cancel');
      act(() => {
        input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: cancel }));
      });
      click(cancel);
      assert.equal(slot().scale, before);
      assert.equal(!!ui.querySelector('input[inputmode="numeric"]'), false, 'the field closed');
    });

    it('Apply with an invalid value shows the alert and applies nothing', () => {
      const before = slot().scale;
      const { ui, input } = open();
      type(input, '0');
      click(button(ui, 'Apply'));
      assert.equal(slot().scale, before);
      assert.ok(ui.querySelector('[role="alert"]'));
      assert.ok(ui.querySelector('input[inputmode="numeric"]'));
    });

    it('Escape closes the field without applying', () => {
      const before = slot().scale;
      const { ui, input } = open();
      type(input, '40');
      press(input, 'Escape');
      assert.equal(slot().scale, before);
      assert.equal(!!ui.querySelector('input[inputmode="numeric"]'), false, 'the field closed');
    });
  });
});
