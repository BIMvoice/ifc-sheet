/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The AutoCAD mode switch in the keyboard settings (#168): off by default, named, described, saved, announced. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { resolveEnglish as t } from '@/i18n/registry';
import { AUTOCAD_MODE_STORAGE_KEY, autocadModeOn, loadAutocadMode, setAutocadMode } from '@/lib/commands/autocad-mode';
import { KeyboardSettings } from './KeyboardSettings.js';

afterEach(() => {
  cleanup();
  setAutocadMode(false);
  localStorage.clear();
});

const toggle = (ui: HTMLElement) => ui.querySelector<HTMLInputElement>('input[type="checkbox"][aria-describedby="autocad-mode-hint"]')!;

describe('the AutoCAD mode setting', () => {
  it('is an unchecked checkbox named "AutoCAD mode" and described by what it does', () => {
    localStorage.clear();
    loadAutocadMode();
    const ui = render(<KeyboardSettings />);
    const box = toggle(ui);
    assert.equal(box.checked, false);
    assert.equal(box.closest('label')?.textContent, t('wall.keys.autocad.label'));
    assert.equal(ui.querySelector('#autocad-mode-hint')?.textContent, t('wall.keys.autocad.hint'));
  });

  it('turns the mode on and off, saves it, and announces each change', () => {
    const ui = render(<KeyboardSettings />);
    click(toggle(ui));
    assert.equal(autocadModeOn(), true);
    assert.equal(toggle(ui).checked, true);
    assert.equal(localStorage.getItem(AUTOCAD_MODE_STORAGE_KEY), 'on');
    assert.equal(ui.querySelector('output')?.textContent, t('wall.keys.autocad.turnedOn'));
    click(toggle(ui));
    assert.equal(autocadModeOn(), false);
    assert.equal(localStorage.getItem(AUTOCAD_MODE_STORAGE_KEY), null);
    assert.equal(ui.querySelector('output')?.textContent, t('wall.keys.autocad.turnedOff'));
  });
});
