/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render, type } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { WALL_ACTIONS } from '@/lib/commands/action-registry';
import { effectiveKeys, rebindAction, resetAllBindings } from '@/lib/commands/key-bindings';
import { ariaKeyShortcuts } from '@/lib/commands/shortcut-label';
import { WALL_KEY_COMMANDS, type WallKeyId } from '@/lib/commands/wall-key-commands';
import { resolveEnglish as t } from '@/i18n/registry';
import { useDraftingKeys } from '../drafting/useDraftingKeys.js';
import { toggleOrtho, useDraftingSession } from '@/drafting/session';
import { KeyboardSettings } from './KeyboardSettings.js';
import { useWallKeys, type WallHandlers } from './wall-key-bus.js';

/**
 * The keyboard settings (#166): a key pressed in the recorder becomes the
 * action's key and runs it at once on the Wall; a key another action has is
 * refused with a message; keys stay silent in text fields; reset restores the
 * defaults; and the panel works from the keyboard with a screen reader.
 */

beforeEach(() => setPlatform('Win32'));
afterEach(() => {
  cleanup();
  resetAllBindings();
  localStorage.clear();
  setPlatform(null);
});

function counting(): { handlers: WallHandlers; calls: WallKeyId[] } {
  const calls: WallKeyId[] = [];
  const handlers = Object.fromEntries(WALL_KEY_COMMANDS.map(({ id }) => [id, () => { calls.push(id); }])) as unknown as WallHandlers;
  return { handlers, calls };
}

function Wall({ handlers }: { handlers: WallHandlers }) {
  useWallKeys(handlers);
  return (
    <div>
      <input aria-label="a field" />
      <KeyboardSettings />
    </div>
  );
}

/** The drafting view as it mounts on a stepped sheet: its key handler and command line, with the Wall's handlers. */
function WithCommandLine({ handlers, typed }: { handlers: WallHandlers; typed: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  useDraftingKeys({ inputRef, setText: (v) => { const next = typeof v === 'function' ? v(text) : v; typed.push(next); setText(next); }, submit: () => {} });
  useWallKeys(handlers);
  return <input ref={inputRef} aria-label="command line" value={text} onChange={(e) => setText(e.target.value)} />;
}

const changeButton = (ui: HTMLElement, id: string) => ui.querySelector<HTMLButtonElement>(`[data-key-action="${id}"] button`)!;
const row = (ui: HTMLElement, id: string) => ui.querySelector<HTMLElement>(`[data-key-action="${id}"]`)!;

/** Press Change on the action's row, then the key, as a person does. */
function record(ui: HTMLElement, id: string, key: string, init: KeyboardEventInit = {}): void {
  const button = changeButton(ui, id);
  act(() => button.focus());
  click(button);
  press(button, key, init);
}

describe('rebinding from the keyboard settings', () => {
  it('makes the pressed key run the action at once, and the old key stop', () => {
    const { handlers, calls } = counting();
    const ui = render(<Wall handlers={handlers} />);
    record(ui, 'wall.draw.line', 'l', { code: 'KeyL' });
    assert.equal(row(ui, 'wall.draw.line').querySelector('kbd')?.textContent, 'L');
    assert.match(ui.querySelector('output')?.textContent ?? '', /^Line: L\.$/);
    press(document.body, 'l');
    assert.deepEqual(calls, ['wall.draw.line'], 'a bare L runs Line: no command line, no Enter');
    calls.length = 0;
    press(document.body, 'Dead', { code: 'Digit1', altKey: true, shiftKey: true });
    assert.deepEqual(calls, [], 'Alt+Shift+1 no longer runs it');
  });

  it('gives an action that shipped with no key a key that runs it', () => {
    const { handlers, calls } = counting();
    const ui = render(<Wall handlers={handlers} />);
    assert.equal(row(ui, 'wall.exportDxf').querySelector('kbd')?.textContent, t('wall.keys.none'));
    record(ui, 'wall.exportDxf', 'e', { code: 'KeyE', ctrlKey: true, shiftKey: true });
    press(document.body, 'e', { ctrlKey: true, shiftKey: true });
    assert.deepEqual(calls, ['wall.exportDxf']);
  });

  it('refuses a key another action has, says which, and keeps both bindings', () => {
    const { handlers } = counting();
    const ui = render(<Wall handlers={handlers} />);
    record(ui, 'wall.draw.line', 'Dead', { code: 'Digit1', altKey: true });
    assert.equal(ui.querySelector('[role="alert"]')?.textContent, 'Alt+1 already runs Dimension. Choose another key, or change Dimension first.');
    assert.equal(row(ui, 'wall.draw.line').querySelector('kbd')?.textContent, 'Alt+Shift+1');
    assert.deepEqual(effectiveKeys('wall.tool.dimaligned'), [{ key: 'code:Digit1', alt: true }]);
  });

  it('cancels on Escape or on leaving the recorder, and never takes Tab', () => {
    const ui = render(<Wall handlers={counting().handlers} />);
    const button = changeButton(ui, 'wall.fit');
    record(ui, 'wall.fit', 'Escape');
    assert.equal(button.textContent, t('wall.keys.change'));
    assert.equal(row(ui, 'wall.fit').querySelector('kbd')?.textContent, 'Alt+0');
    click(button);
    const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { button.dispatchEvent(tab); });
    assert.equal(tab.defaultPrevented, false, 'Tab still moves focus');
    assert.equal(button.textContent, t('wall.keys.change'));
  });
});

describe('where the keys are silent', () => {
  it('never runs a binding while typing in a text field, nor in the panel itself', () => {
    const { handlers, calls } = counting();
    const ui = render(<Wall handlers={handlers} />);
    record(ui, 'wall.draw.line', 'l', { code: 'KeyL' });
    press(ui.querySelector('input[aria-label="a field"]')!, 'l');
    const search = ui.querySelector<HTMLInputElement>('input[type="search"]')!;
    press(search, 'l');
    press(changeButton(ui, 'wall.fit'), 'l');
    assert.deepEqual(calls, []);
    press(document.body, 'l');
    assert.deepEqual(calls, ['wall.draw.line'], 'control: the same key outside them runs it');
  });

  it('with a drawing in front: a bound bare key runs its action, but text being typed keeps it', () => {
    const { handlers, calls } = counting();
    const typed: string[] = [];
    rebindAction('wall.draw.line', { key: 'l' });
    const ui = render(<WithCommandLine handlers={handlers} typed={typed} />);
    const line = ui.querySelector('input')!;
    press(document.body, 'l');
    assert.deepEqual(calls, ['wall.draw.line'], 'L runs Line, it is not typed');
    assert.deepEqual(typed, []);
    press(document.body, 'p');
    assert.deepEqual(typed, ['p'], 'an unbound letter still goes to the command line');
    act(() => line.blur());
    press(document.body, 'l');
    assert.deepEqual(typed, ['p', 'pl'], 'with text in the line, L is the next letter of it');
    assert.deepEqual(calls, ['wall.draw.line']);
    press(line, 'l');
    assert.deepEqual(calls, ['wall.draw.line'], 'in the command line itself, never');
  });
});

describe('a drafting toggle given a key of the person\'s own', () => {
  it('runs Ortho on exactly that key: the modifiers must match, as they were chosen', () => {
    const typed: string[] = [];
    rebindAction('drafting.ortho', { key: 'o' });
    render(<WithCommandLine handlers={counting().handlers} typed={typed} />);
    const before = useDraftingSession.getState().ortho;
    press(document.body, 'o', { ctrlKey: true });
    assert.equal(useDraftingSession.getState().ortho, before, 'Ctrl+O is not O');
    press(document.body, 'o');
    assert.equal(useDraftingSession.getState().ortho, !before, 'O toggles Ortho at once');
    assert.deepEqual(typed, [], 'and is not typed into the command line');
    act(() => toggleOrtho());
  });
});

describe('resetting', () => {
  it('puts one action back from its row, and every action back with Reset all', () => {
    const ui = render(<Wall handlers={counting().handlers} />);
    record(ui, 'wall.draw.line', 'l', { code: 'KeyL' });
    record(ui, 'wall.fit', 'y', { code: 'KeyY' });
    const reset = row(ui, 'wall.draw.line').querySelector<HTMLButtonElement>(`button[aria-label="${t('wall.keys.resetAria', { action: 'Line' })}"]`)!;
    click(reset);
    assert.equal(row(ui, 'wall.draw.line').querySelector('kbd')?.textContent, 'Alt+Shift+1');
    assert.equal(row(ui, 'wall.fit').querySelector('kbd')?.textContent, 'Y');
    const all = () => [...ui.querySelectorAll('button')].filter((b) => b.textContent === t('wall.keys.resetAll'));
    click(all()[0]);
    assert.equal(row(ui, 'wall.fit').querySelector('kbd')?.textContent, 'Y', 'asks first');
    click(all()[0]);
    assert.equal(row(ui, 'wall.fit').querySelector('kbd')?.textContent, 'Alt+0');
    assert.equal(ui.querySelector('output')?.textContent, t('wall.keys.resetAllDone'));
  });
});

describe('the panel for keyboard and screen-reader users', () => {
  it('lists every action, names each control by its action, and announces each key in aria-keyshortcuts', () => {
    const ui = render(<KeyboardSettings />);
    assert.ok(ui.querySelector('section[data-owns-keys]'), 'the panel keeps its own keys');
    for (const a of WALL_ACTIONS) {
      const r = row(ui, a.id);
      assert.ok(r, a.id);
      const name = t(a.labelKey);
      assert.equal(changeButton(ui, a.id).getAttribute('aria-label'), t('wall.keys.changeAria', { action: name }), a.id);
      assert.equal(r.querySelector('kbd')?.getAttribute('aria-keyshortcuts') ?? '', ariaKeyShortcuts(a.id), a.id);
    }
    assert.equal(row(ui, 'wall.print').querySelector('kbd')?.getAttribute('aria-keyshortcuts'), 'Control+P');
    assert.ok(ui.querySelector('input[type="search"]')?.getAttribute('aria-label'));
    assert.ok(ui.querySelector('input[type="file"]')?.getAttribute('aria-label'));
  });

  it('tells a screen reader it is listening, and finds actions by name or key', () => {
    const ui = render(<KeyboardSettings />);
    click(changeButton(ui, 'wall.fit'));
    assert.equal(changeButton(ui, 'wall.fit').getAttribute('aria-label'), t('wall.keys.recordingAria', { action: 'Fit' }));
    type(ui.querySelector<HTMLInputElement>('input[type="search"]')!, 'polyl');
    assert.deepEqual([...ui.querySelectorAll('[data-key-action]')].map((r) => r.getAttribute('data-key-action')), ['wall.draw.polyline']);
    type(ui.querySelector<HTMLInputElement>('input[type="search"]')!, 'F8');
    assert.deepEqual([...ui.querySelectorAll('[data-key-action]')].map((r) => r.getAttribute('data-key-action')), ['drafting.ortho']);
  });
});
