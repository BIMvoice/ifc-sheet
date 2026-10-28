/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { setGroupScale, startDrawingSet } from '@/project/drawing-set-actions';
import { updateViewport } from '@/project/sheets';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { ViewportCard } from './ViewportCard.js';

/** #450 on the Wall: the scale field re-lays a generated sheet by itself, and on a hand-arranged one offers it. */

const FLATS: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 15, z: 6 } };
const LEVELS: ProjectLevel[] = [0, 1, 2, 3, 4].map((i) => ({ name: `L${i}`, elevation: i * 3, storeyGlobalIds: [`L${i}`] }));
const sheet = () => useProjectStore.getState().sheets.find((s) => s.number === 'A-101')!;

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, FLATS);
  setGroupScale('plans', 100, FLATS);
});
afterEach(() => cleanup());

function chooseScale(ui: HTMLElement, value: string): void {
  const select = ui.querySelector('select')!;
  act(() => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
const offerButton = (ui: HTMLElement) => [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Lay the sheet out again at 1 : 50');

describe('ScaleField on a sheet of several drawings (#450)', () => {
  it('moves the other drawings with a generated sheet and offers nothing', () => {
    const slot = sheet().viewports![0];
    const ui = render(<ViewportCard sheet={sheet()} slot={slot} onOpen={() => {}} onChoose={() => {}} extent={FLATS} />);
    chooseScale(ui, '50');
    assert.deepEqual(sheet().viewports!.map((v) => v.scale), [50, 50]);
    assert.equal(offerButton(ui), undefined);
  });

  it('changes only its own drawing on a hand-arranged sheet, and the offer lays the sheet out again', () => {
    const slot = sheet().viewports![0];
    updateViewport(sheet().id, slot.id, { x: slot.x - 15 });
    const ui = render(<ViewportCard sheet={sheet()} slot={sheet().viewports![0]} onOpen={() => {}} onChoose={() => {}} extent={FLATS} />);
    chooseScale(ui, '50');
    assert.deepEqual(sheet().viewports!.map((v) => v.scale), [50, 100]);
    const offer = offerButton(ui);
    assert.ok(offer, 'the hand-arranged sheet is offered the layout');
    click(offer);
    assert.deepEqual(sheet().viewports!.map((v) => v.scale), [50, 50]);
    assert.equal(offerButton(ui), undefined);
  });
});
