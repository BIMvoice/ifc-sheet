/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { IMPORT_MAX_CHARS, KEY_BINDINGS_STORAGE_KEY, loadKeyBindings, rebindAction, resetAllBindings, takeDroppedBindings, useKeyBindings } from '@/lib/commands/key-bindings';
import { WALL_KEY_COMMANDS, type WallKeyId } from '@/lib/commands/wall-key-commands';
import { resolveEnglish as t } from '@/i18n/registry';
import { useDraftingKeys } from '../drafting/useDraftingKeys.js';
import { toggleSnap, useDraftingSession } from '@/drafting/session';
import { KeyboardSettings } from './KeyboardSettings.js';
import { claimWallKey, useWallKeys, type WallHandlers } from './wall-key-bus.js';
import { steppedHandlers, type SteppedActions } from './stepped-keys.js';

/** Review fixes on the keyboard settings and the drafting keys (#166, PR 213). */

beforeEach(() => setPlatform('Win32'));
afterEach(() => {
  cleanup();
  resetAllBindings();
  takeDroppedBindings();
  localStorage.clear();
  setPlatform(null);
});

function counting(): { handlers: WallHandlers; calls: WallKeyId[] } {
  const calls: WallKeyId[] = [];
  const handlers = Object.fromEntries(WALL_KEY_COMMANDS.map(({ id }) => [id, () => { calls.push(id); }])) as unknown as WallHandlers;
  return { handlers, calls };
}

/** The drafting view as it mounts: its key handler, its command line, and the Wall's handlers. */
function Drafting({ handlers, typed, submitted }: { handlers: WallHandlers; typed: string[]; submitted: number[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  useDraftingKeys({ inputRef, setText: (v) => { const next = typeof v === 'function' ? v(text) : v; typed.push(next); setText(next); }, submit: () => { submitted.push(1); } });
  useWallKeys(handlers);
  return <input ref={inputRef} aria-label="command line" value={text} onChange={(e) => setText(e.target.value)} />;
}

describe('Space confirms for a person who never customised', () => {
  it('runs the confirm when focus has left a command line that holds text', () => {
    const typed: string[] = [];
    const submitted: number[] = [];
    const ui = render(<Drafting handlers={counting().handlers} typed={typed} submitted={submitted} />);
    const line = ui.querySelector('input')!;
    press(document.body, 'l');
    assert.deepEqual(typed, ['l']);
    act(() => line.blur());
    press(document.body, ' ');
    assert.equal(submitted.length, 1, 'Space is the confirm, not a space typed into the line');
    assert.deepEqual(typed, ['l']);
  });

  it('still keeps a bare key the person chose out of the action while text is typed', () => {
    const typed: string[] = [];
    rebindAction('drafting.ortho', { key: 'o' });
    const ui = render(<Drafting handlers={counting().handlers} typed={typed} submitted={[]} />);
    const line = ui.querySelector('input')!;
    const before = useDraftingSession.getState().ortho;
    press(document.body, 'l');
    act(() => line.blur());
    press(document.body, 'o');
    assert.equal(useDraftingSession.getState().ortho, before, 'with text in the line, O is the next letter of it');
    assert.deepEqual(typed, ['l', 'lo']);
  });
});

describe('an open dialog owns the keys', () => {
  it('does not run a Wall action or type into the command line behind a modal', () => {
    rebindAction('wall.back', { key: 'g' });
    const { handlers, calls } = counting();
    const typed: string[] = [];
    render(<Drafting handlers={handlers} typed={typed} submitted={[]} />);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const inside = document.createElement('button');
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    try {
      inside.focus();
      calls.length = 0;
      const before = typed.length;
      press(inside, 'g');
      assert.deepEqual(calls, [], 'Back does not run behind the dialog');
      assert.equal(typed.length, before, 'and nothing is typed behind it');
      press(inside, ' ');
    } finally {
      dialog.remove();
    }
    press(document.body, 'g');
    assert.deepEqual(calls, ['wall.back'], 'with the dialog closed, the key runs');
  });

  it('does not run behind an open menu either', () => {
    rebindAction('wall.back', { key: 'g' });
    const { handlers, calls } = counting();
    render(<Drafting handlers={handlers} typed={[]} submitted={[]} />);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    try {
      press(document.body, 'g');
      assert.deepEqual(calls, []);
    } finally {
      menu.remove();
    }
  });
});

describe('a key that types a character', () => {
  it('does not run a drafting action from the command line: Option+S types ß, AltGr+S types ș', () => {
    setPlatform('MacIntel');
    rebindAction('drafting.snap', { key: 'code:KeyS', alt: true });
    rebindAction('drafting.ortho', { key: 'code:KeyO', mod: true, alt: true });
    const typed: string[] = [];
    const ui = render(<Drafting handlers={counting().handlers} typed={typed} submitted={[]} />);
    const line = ui.querySelector('input')!;
    const snap = useDraftingSession.getState().snap;
    const ortho = useDraftingSession.getState().ortho;
    const optionS = new window.KeyboardEvent('keydown', { key: 'ß', code: 'KeyS', altKey: true, bubbles: true, cancelable: true });
    act(() => { line.dispatchEvent(optionS); });
    assert.equal(useDraftingSession.getState().snap, snap, 'Option+S in the line is a ß');
    assert.equal(optionS.defaultPrevented, false, 'and the letter is not swallowed');
    const altGr = new window.KeyboardEvent('keydown', { key: 'ø', code: 'KeyO', ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
    act(() => { line.dispatchEvent(altGr); });
    assert.equal(useDraftingSession.getState().ortho, ortho, 'Ctrl+Alt+O in the line is AltGr');
    assert.equal(altGr.defaultPrevented, false);
    // Not in a text field, the same press is the person's binding.
    act(() => { document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ß', code: 'KeyS', altKey: true, bubbles: true, cancelable: true })); });
    assert.equal(useDraftingSession.getState().snap, !snap);
    act(() => toggleSnap());
  });

  it('still runs when the Alt chord types nothing (Windows Alt+S)', () => {
    rebindAction('drafting.snap', { key: 'code:KeyS', alt: true });
    const ui = render(<Drafting handlers={counting().handlers} typed={[]} submitted={[]} />);
    const snap = useDraftingSession.getState().snap;
    act(() => { ui.querySelector('input')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', code: 'KeyS', altKey: true, bubbles: true, cancelable: true })); });
    assert.equal(useDraftingSession.getState().snap, !snap);
    act(() => toggleSnap());
  });
});

describe('the Wall\'s live handlers', () => {
  function Claim({ handlers }: { handlers: WallHandlers }) {
    useWallKeys(handlers);
    return null;
  }
  const down = (key: string) => new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

  it('are the only ones a drafting claim reaches: an action not on offer is skipped, and the next bound one is not', () => {
    rebindAction('wall.back', { key: 'g' });
    const { handlers, calls } = counting();
    render(<Claim handlers={{ ...handlers, 'wall.back': null }} />);
    assert.equal(claimWallKey(down('g')), false, 'Back is not on offer');
    assert.deepEqual(calls, []);
    cleanup();
    render(<Claim handlers={handlers} />);
    assert.equal(claimWallKey(down('g')), true);
    assert.deepEqual(calls, ['wall.back']);
  });

  it('are the only ones a claim looks at, even when a stale set gives two actions one key', () => {
    // The two cannot be set through the settings; an older build's storage could hold them.
    useKeyBindings.setState({ overrides: { 'wall.back': [{ key: 'g' }], 'wall.comment': [{ key: 'g' }] } });
    const { handlers, calls } = counting();
    render(<Claim handlers={{ ...handlers, 'wall.back': null }} />);
    assert.equal(claimWallKey(down('g')), true, 'the one on offer runs');
    assert.deepEqual(calls, ['wall.comment']);
  });

  it('claims nothing when no sheet is mounted', () => {
    rebindAction('wall.back', { key: 'g' });
    assert.equal(claimWallKey(down('g')), false);
  });

  it('carry each sheet action to its own key row, Back included', () => {
    const ran: string[] = [];
    const rec = (name: string) => () => { ran.push(name); };
    const actions: SteppedActions = {
      startTool: (c) => { ran.push(`tool:${c}`); }, toggleAdd: rec('add'), fit: rec('fit'), print: rec('print'), previous: rec('previous'), next: rec('next'),
      back: rec('back'), leaveEdit: rec('leaveEdit'), comment: rec('comment'), paper: rec('paper'), titleBlock: rec('titleBlock'),
      revisions: rec('revisions'), printPreview: rec('printPreview'), exportDxf: rec('exportDxf'),
    };
    const h = steppedHandlers(actions);
    const expected: Record<string, string> = {
      'wall.addDrawing': 'add', 'wall.fit': 'fit', 'wall.print': 'print', 'wall.prevSheet': 'previous', 'wall.nextSheet': 'next', 'wall.back': 'back',
      'wall.leaveEdit': 'leaveEdit', 'wall.comment': 'comment', 'wall.paper': 'paper', 'wall.titleBlock': 'titleBlock', 'wall.revisions': 'revisions',
      'wall.printPreview': 'printPreview', 'wall.exportDxf': 'exportDxf',
    };
    for (const [id, name] of Object.entries(expected)) {
      ran.length = 0;
      h[id as WallKeyId]?.();
      assert.deepEqual(ran, [name], id);
    }
  });
});

describe('the recorder', () => {
  it('stops recording when the button loses focus', () => {
    const ui = render(<KeyboardSettings />);
    const button = ui.querySelector<HTMLButtonElement>('[data-key-action="wall.fit"] button')!;
    act(() => button.focus());
    click(button);
    assert.equal(button.hasAttribute('data-recording'), true);
    act(() => button.blur());
    assert.equal(button.hasAttribute('data-recording'), false, 'the next key is not taken for a binding');
  });
});

describe('import and storage messages', () => {
  const choose = (ui: HTMLElement, file: unknown) => {
    const input = ui.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    act(() => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
  };
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  const alert = (ui: HTMLElement) => ui.querySelector('[role="alert"]')?.textContent ?? '';

  it('refuses a file over the cap before reading it, and says so', async () => {
    const ui = render(<KeyboardSettings />);
    let read = false;
    choose(ui, { size: IMPORT_MAX_CHARS + 1, text: () => { read = true; return Promise.resolve('{}'); } });
    await settle();
    assert.equal(read, false);
    assert.equal(alert(ui), t('wall.keys.importTooLarge', { kb: 256 }));
  });

  it('says which action had too many keys', async () => {
    const ui = render(<KeyboardSettings />);
    const text = JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: { 'wall.back': Array.from({ length: 5 }, (_, i) => ({ key: `f${i + 1}` })) } });
    choose(ui, { size: text.length, text: () => Promise.resolve(text) });
    await settle();
    assert.equal(alert(ui), t('wall.keys.importTooMany', { action: t('wall.keys.action.back'), max: 4 }));
  });

  it('says a file gave a key that moves focus', async () => {
    const ui = render(<KeyboardSettings />);
    const text = JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: { 'wall.back': [{ key: 'tab' }] } });
    choose(ui, { size: text.length, text: () => Promise.resolve(text) });
    await settle();
    assert.equal(alert(ui), t('wall.keys.reserved', { keys: 'Tab' }));
  });

  it('tells the person once that stored keys were dropped because they collide', () => {
    localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: { 'wall.fit': [{ key: 'code:Digit1', alt: true }], 'wall.draw.line': [{ key: 'l' }] } }));
    loadKeyBindings();
    const ui = render(<KeyboardSettings />);
    assert.equal(ui.querySelector('output')?.textContent, t('wall.keys.storedDropped', { count: 1 }));
    cleanup();
    const again = render(<KeyboardSettings />);
    assert.equal(again.querySelector('output')?.textContent, '', 'not again');
  });
});
