/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { autocadModeOn, setAutocadMode } from '@/lib/commands/autocad-mode';
import { currentPreset, effectiveKeys, rebindAction, resetAllBindings, setKeyPreset } from '@/lib/commands/key-bindings';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { registerLocale, setLocale } from '@/i18n/registry';
import { KeyboardSettings } from './KeyboardSettings.js';

/** The key set picker in the keyboard dialog (#166). */

beforeEach(() => setPlatform('Win32'));
afterEach(() => {
  act(() => setLocale('en'));
  cleanup();
  setKeyPreset('default');
  resetAllBindings();
  setAutocadMode(false);
  localStorage.clear();
  setPlatform(null);
});

const picker = (ui: HTMLElement) => ui.querySelector<HTMLSelectElement>('select')!;
function choose(ui: HTMLElement, value: string): void {
  const select = picker(ui);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
const shown = (ui: HTMLElement, id: string) => ui.querySelector(`[data-key-action="${id}"] kbd`)?.textContent;
const named = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

describe('the key set picker', () => {
  it('lists the sets, starts on the default, and applies the AutoCAD-like keys to the listing when chosen', () => {
    const ui = render(<KeyboardSettings />);
    assert.deepEqual([...picker(ui).options].map((o) => o.textContent), ['IfcSheet default', 'AutoCAD-like']);
    assert.equal(picker(ui).value, 'default');
    assert.equal(shown(ui, 'drafting.erase'), 'Del, Backspace');
    choose(ui, 'autocad');
    assert.equal(currentPreset(), 'autocad');
    assert.equal(shown(ui, 'drafting.erase'), 'Del');
    assert.equal(shown(ui, 'drafting.redo')?.startsWith('Ctrl+Y'), true);
    assert.match(ui.querySelector('output')?.textContent ?? '', /Key set: AutoCAD-like\./);
    choose(ui, 'default');
    assert.equal(shown(ui, 'drafting.erase'), 'Del, Backspace');
  });

  it('says what the person\'s own changes sit on, and "Reset to preset" removes them but keeps the set', () => {
    const ui = render(<KeyboardSettings />);
    assert.match(ui.textContent ?? '', /No changes of your own: every action is on a key of IfcSheet default\./);
    act(() => { rebindAction('wall.fit', { key: 'code:KeyF', alt: true }); });
    choose(ui, 'autocad');
    assert.match(ui.textContent ?? '', /Your own changes: 1 action on a key of your choice, on top of AutoCAD-like\./);
    click(named(ui, 'Reset to preset')!);
    click(named(ui, 'Reset to preset')!);
    assert.equal(currentPreset(), 'autocad');
    assert.deepEqual(effectiveKeys('wall.fit'), [{ key: 'code:Digit0', alt: true }]);
    assert.match(ui.textContent ?? '', /No changes of your own/);
  });

  it('OFFERS AutoCAD mode with the AutoCAD-like set and turns it on only when asked', () => {
    const ui = render(<KeyboardSettings />);
    choose(ui, 'autocad');
    assert.equal(autocadModeOn(), false);
    const turnOn = named(ui, 'Turn on AutoCAD mode');
    assert.ok(turnOn, 'the offer is there');
    click(turnOn);
    assert.equal(autocadModeOn(), true);
    assert.equal(named(ui, 'Turn on AutoCAD mode'), undefined, 'the offer goes once taken');
  });

  it('lets the offer be declined, makes none when the mode is already on or the default is chosen', () => {
    const ui = render(<KeyboardSettings />);
    choose(ui, 'autocad');
    click(named(ui, 'Not now')!);
    assert.equal(autocadModeOn(), false);
    assert.equal(named(ui, 'Turn on AutoCAD mode'), undefined);
    choose(ui, 'default');
    assert.equal(named(ui, 'Turn on AutoCAD mode'), undefined);
    act(() => setAutocadMode(true));
    choose(ui, 'autocad');
    assert.equal(named(ui, 'Turn on AutoCAD mode'), undefined);
  });

  it('reads in Romanian under ro', () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    const ui = render(<KeyboardSettings />);
    assert.deepEqual([...picker(ui).options].map((o) => o.textContent), ['Implicit IfcSheet', 'Ca în AutoCAD']);
    choose(ui, 'autocad');
    assert.match(ui.textContent ?? '', /Set de taste: Ca în AutoCAD\./);
    assert.ok(named(ui, 'Porniți modul AutoCAD'));
    assert.ok(named(ui, 'Resetați la preset'));
  });
});
