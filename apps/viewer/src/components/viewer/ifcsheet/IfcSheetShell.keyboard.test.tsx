/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The keyboard shortcuts and the key customisation have a visible way in on the face (#299). */

import '@/test/setup-dom.js';
import { useEffect } from 'react';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render, click, press } from '@/test/render.js';
import { setEditionForTests } from '@/edition';
import { EVENT_SHOW_SHORTCUTS } from '@/lib/tours/events';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { KeyboardShortcutsDialog, useKeyboardShortcutsDialog, type InfoDialogTab } from '../KeyboardShortcutsDialog.js';
import { IfcSheetShell } from './IfcSheetShell.js';

afterEach(() => {
  cleanup();
  setEditionForTests(null);
  setLocale('en');
});

/** What `ViewerLayout` does with the event: the face has no dialog of its own, the layout under it owns the one dialog. */
function Host() {
  const dialog = useKeyboardShortcutsDialog();
  useEffect(() => {
    const show = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: InfoDialogTab } | undefined>).detail?.tab;
      if (tab) dialog.openTab(tab); else dialog.toggle();
    };
    window.addEventListener(EVENT_SHOW_SHORTCUTS, show);
    return () => window.removeEventListener(EVENT_SHOW_SHORTCUTS, show);
  }, [dialog]);
  return (
    <>
      <IfcSheetShell />
      <KeyboardShortcutsDialog open={dialog.open} onClose={dialog.close} initialTab={dialog.tab} />
    </>
  );
}

const keyboardButton = (name: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('header button')].find((b) => name.test(b.textContent ?? ''));

describe('the Keyboard entry of the face (#299)', () => {
  it('opens the shortcut list with Customise keys, and gives focus back to its button', async () => {
    setEditionForTests('docs');
    render(<Host />);
    const button = keyboardButton(/^Keyboard$/);
    assert.ok(button, 'a visible Keyboard button in the header');
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
    act(() => button.focus());
    click(button);
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the dialog opened');
    assert.ok(dialog.textContent?.includes('Customise keys'), 'on the Shortcuts tab, with the customisation');
    const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    assert.ok(close, 'the dialog has a named close button');
    click(close);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, button, 'focus returns to the button that opened it');
  });

  it('closes on Escape and returns focus to the button as well', async () => {
    setEditionForTests('docs');
    render(<Host />);
    const button = keyboardButton(/^Keyboard$/);
    assert.ok(button);
    act(() => button.focus());
    click(button);
    assert.ok(document.querySelector('[role="dialog"]'));
    press(document.activeElement ?? document, 'Escape');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, button);
  });

  it('is named in Romanian under Română', () => {
    registerLocale('ro', ro);
    setLocale('ro');
    render(<Host />);
    assert.ok(keyboardButton(/^Tastatură$/));
  });
});

describe('the hint lines name the way in (#299)', () => {
  it('says that the Keyboard button and the ? key open the shortcuts, on the wall and inside a sheet, in both languages', () => {
    for (const key of ['wall.hint', 'wall.sheetHint.body'] as const) {
      setEditionForTests('docs');
      assert.match(resolve(key), /Keyboard button.*\? key/, key);
      registerLocale('ro', ro);
      setLocale('ro');
      assert.match(resolve(key), /Tastatură.*tasta \?/, key);
      setLocale('en');
    }
  });
});
