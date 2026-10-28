/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The "?" menu (#455): reachable by keyboard, labelled, its items in English and Romanian, each doing what it says. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { EVENT_SHOW_SHORTCUTS } from '@/lib/tours/events';
import { EVENT_OPEN_SETTINGS } from '@/lib/settings/open-settings';
import { HelpMenu } from './HelpMenu.js';

afterEach(() => {
  cleanup();
  setLocale('en');
});

const trigger = (): HTMLButtonElement => {
  const b = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  assert.ok(b, 'the ? button');
  return b;
};
const items = (): string[] => [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent ?? '');

function open(onTour: () => void = () => {}): void {
  render(<HelpMenu className="" onTour={onTour} />);
  act(() => trigger().focus());
  press(trigger(), 'Enter');
}

describe('the ? menu', () => {
  it('is a labelled button that opens from the keyboard', () => {
    open();
    assert.equal(trigger().textContent, '?');
    assert.equal(trigger().getAttribute('aria-label'), 'Help');
    assert.ok(document.querySelector('[role="menu"]'), 'opened by Enter');
  });

  it('offers shortcuts, the six how-tos, report or suggest, the project on GitHub, the tour and the hints setting in English', () => {
    open();
    assert.deepEqual(items(), ['Keyboard shortcuts', 'Open a model', 'Hang the set', 'Dimension and tag', 'Schedules', 'Title block', 'Export', 'Report a bug or suggest a feature', 'IfcSheet on GitHub', 'Tour of the Wall', 'Hints in Settings']);
  });

  it('offers the same items in Romanian', () => {
    registerLocale('ro', ro);
    setLocale('ro');
    open();
    const got = items();
    assert.equal(got.length, 11);
    assert.ok(got.includes('IfcSheet pe GitHub'));
    assert.equal(got[0], 'Scurtături de tastatură');
    assert.ok(got.includes('Raportați o problemă sau propuneți o funcție'));
    assert.equal(document.querySelector('[role="menu"]') !== null && trigger().getAttribute('aria-label'), 'Ajutor');
  });

  it('links to the repository in a new tab', () => {
    open();
    const link = [...document.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]')].find((e) => e.textContent === 'IfcSheet on GitHub');
    assert.ok(link, 'a GitHub menu item');
    assert.equal(link.getAttribute('href'), 'https://github.com/BIMvoice/ifcsheet');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.match(link.getAttribute('rel') ?? '', /noopener/);
  });

  it('opens the shortcut list, the settings and a how-to page', () => {
    const seen: string[] = [];
    const record = (e: Event) => seen.push(e.type);
    window.addEventListener(EVENT_SHOW_SHORTCUTS, record);
    window.addEventListener(EVENT_OPEN_SETTINGS, record);
    try {
      open();
      click(document.querySelectorAll('[role="menuitem"]')[0]);
      assert.deepEqual(seen, [EVENT_SHOW_SHORTCUTS]);
      press(trigger(), 'Enter');
      click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === 'Hints in Settings')!);
      assert.deepEqual(seen, [EVENT_SHOW_SHORTCUTS, EVENT_OPEN_SETTINGS]);
    } finally {
      window.removeEventListener(EVENT_SHOW_SHORTCUTS, record);
      window.removeEventListener(EVENT_OPEN_SETTINGS, record);
    }
  });

  it('reads a how-to page in the app, steps numbered', async () => {
    open();
    click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === 'Hang the set')!);
    await new Promise((r) => setTimeout(r, 50));
    const steps = document.querySelectorAll('[data-howto-steps] li');
    assert.equal(steps.length, 6);
    assert.match(steps[0].textContent ?? '', /Hang it on the wall/);
  });

  it('runs the tour from its item', () => {
    let ran = 0;
    open(() => { ran += 1; });
    click([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === 'Tour of the Wall')!);
    assert.equal(ran, 1);
  });
});
