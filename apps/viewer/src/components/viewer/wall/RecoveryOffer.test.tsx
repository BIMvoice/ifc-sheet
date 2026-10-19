/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { addProjectSheet, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { discardRecovery, offerRecovery, useRecoveryStore } from '@/project/recovery-store';
import type { ModelExtent } from '@/project/drawing-set';
import { WallIntro } from './WallIntro.js';

/** #71: the intro screen offers the autosave back, with its time and model name, and the buttons keep their own keys. */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

beforeEach(() => {
  resetProject();
  discardRecovery();
  addProjectSheet('Drawn before the crash');
  const doc = projectDocument();
  resetProject();
  offerRecovery({ key: 'k', doc, savedAt: new Date('2026-10-19T10:00:00Z').getTime(), modelName: 'house.ifc' });
});
afterEach(() => cleanup());

const button = (ui: HTMLElement, text: string) => {
  const b = [...ui.querySelectorAll('button')].find((x) => x.textContent === text);
  assert.ok(b, `a button ${text}`);
  return b;
};

describe('the intro screen with an autosave on offer', () => {
  it('names the model and the time', () => {
    const ui = render(<WallIntro modelName="house.ifc" extent={HOUSE} onHang={() => {}} />);
    assert.match(ui.textContent ?? '', /house\.ifc: autosaved .*2026/);
    button(ui, 'Restore it');
    button(ui, 'Discard');
  });

  it('Restore puts the work back and goes on to the wall', () => {
    let hung = 0;
    const ui = render(<WallIntro modelName="house.ifc" extent={HOUSE} onHang={() => { hung++; }} />);
    click(button(ui, 'Restore it'));
    assert.deepEqual(useProjectStore.getState().sheets.map((s) => s.name), ['Drawn before the crash']);
    assert.equal(hung, 1);
  });

  it('Discard closes the offer and stays on the intro, with nothing restored', () => {
    let hung = 0;
    const ui = render(<WallIntro modelName="house.ifc" extent={HOUSE} onHang={() => { hung++; }} />);
    click(button(ui, 'Discard'));
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.equal(useProjectStore.getState().sheets.length, 0);
    assert.equal(hung, 0);
  });

  it('Enter on one of its buttons answers the offer and does not also hang the set', () => {
    let hung = 0;
    const ui = render(<WallIntro modelName="house.ifc" extent={HOUSE} onHang={() => { hung++; }} />);
    button(ui, 'Discard').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(hung, 0);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(hung, 1, 'outside the offer, Enter still hangs it');
  });
});
