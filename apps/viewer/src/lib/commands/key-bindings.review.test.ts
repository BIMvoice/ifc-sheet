/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chordFromEvent, type KeyChord } from './chord.js';
import { KEY_COMMANDS } from './keyboard-commands.js';
import {
  IMPORT_MAX_CHARS, KEY_BINDINGS_STORAGE_KEY, MAX_CHORDS_PER_ACTION, effectiveKeys, importKeyBindings, loadKeyBindings,
  rebindAction, resetAllBindings, takeDroppedBindings, unbindAction,
} from './key-bindings.js';

/** Review fixes on the keyboard set (#166, PR 213): what a file or storage may carry, and what a key may be taken from. */

afterEach(() => {
  resetAllBindings();
  takeDroppedBindings();
  localStorage.clear();
});

const key = (k: string, mods: Omit<KeyChord, 'key'> = {}): KeyChord => ({ key: k, ...mods });
const file = (bindings: Record<string, unknown>) => JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings });
const store = (bindings: Record<string, unknown>) => { localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, file(bindings)); loadKeyBindings(); };

describe('a chord from a file or from storage', () => {
  it('is never Tab, which moves focus: import refuses it, and storage does not carry it', () => {
    const outcome = importKeyBindings(file({ 'wall.back': [{ key: 'tab' }] }));
    assert.equal(outcome.ok, false);
    assert.equal(!outcome.ok && outcome.reason, 'reserved');
    assert.deepEqual(effectiveKeys('wall.back'), []);
    for (const k of ['shift', 'control', 'alt', 'meta', 'altgraph', 'dead', 'unidentified', 'Tab']) {
      assert.equal(importKeyBindings(file({ 'wall.back': [{ key: k }] })).ok, false, k);
    }
    store({ 'wall.back': [{ key: 'tab' }] });
    assert.deepEqual(effectiveKeys('wall.back'), [], 'from storage, Tab runs nothing');
  });

  it('is lower-cased, as the dispatcher compares keys, so an imported "Q" fires; a position keeps its case', () => {
    assert.deepEqual(importKeyBindings(file({ 'wall.back': [{ key: 'Q' }], 'wall.fit': [{ key: 'code:KeyF', alt: true }] })), { ok: true, applied: 2, skipped: 0 });
    assert.deepEqual(effectiveKeys('wall.back'), [key('q')]);
    assert.deepEqual(effectiveKeys('wall.fit'), [key('code:KeyF', { alt: true })]);
  });

  it('has a key of 1 to 32 characters', () => {
    assert.equal(importKeyBindings(file({ 'wall.back': [{ key: 'a'.repeat(32) }] })).ok, true);
    assert.deepEqual(importKeyBindings(file({ 'wall.back': [{ key: 'a'.repeat(33) }] })), { ok: false, reason: 'invalid' });
    assert.deepEqual(importKeyBindings(file({ 'wall.back': [{ key: '' }] })), { ok: false, reason: 'invalid' });
  });

  it('has modifiers that are exactly true when present', () => {
    for (const flag of ['mod', 'alt', 'shift']) {
      for (const bad of [false, 1, 'true', null, {}]) {
        assert.deepEqual(importKeyBindings(file({ 'wall.back': [{ key: 'q', [flag]: bad }] })), { ok: false, reason: 'invalid' }, `${flag}=${JSON.stringify(bad)}`);
      }
      assert.equal(importKeyBindings(file({ 'wall.back': [{ key: 'q', [flag]: true }] })).ok, true, flag);
      resetAllBindings();
    }
  });
});

describe('a key the viewer keeps live on the Wall', () => {
  it('cannot be taken by a Wall action: T is the theme, and says so', () => {
    assert.deepEqual(rebindAction('wall.back', key('t')), { ok: false, reason: 'conflict', holder: 'ui.toggleTheme' });
    assert.deepEqual(rebindAction('wall.back', key('?')), { ok: false, reason: 'conflict', holder: 'help.shortcuts' });
    assert.deepEqual(effectiveKeys('wall.back'), []);
    const outcome = importKeyBindings(file({ 'wall.back': [{ key: 't' }] }));
    assert.equal(!outcome.ok && outcome.reason, 'conflict');
    assert.deepEqual(effectiveKeys('wall.back'), []);
  });

  it('lets a key a Wall action ships with go to another action: the Wall\'s handler takes the press before the viewer\'s', () => {
    assert.equal(KEY_COMMANDS.find((c) => c.id === 'selection.delete')?.keys.some((c) => c.key === 'delete'), true);
    unbindAction('drafting.erase');
    assert.deepEqual(rebindAction('wall.back', key('delete')), { ok: true });
    assert.deepEqual(rebindAction('drafting.erase', key('delete')), { ok: false, reason: 'conflict', holder: 'wall.back' });
    assert.deepEqual(importKeyBindings(file({ 'wall.fit': [{ key: 'code:Digit1', alt: true }] })), { ok: false, reason: 'conflict', first: 'wall.fit', second: 'wall.tool.dimaligned', chord: key('code:Digit1', { alt: true }) });
  });

  it('sees a shifted symbol as the symbol: Shift+/ is the "?" of the shortcut list', () => {
    assert.deepEqual(rebindAction('wall.back', key('?', { shift: true })), { ok: false, reason: 'conflict', holder: 'help.shortcuts' });
  });
});

describe('a stored set that collides with a default', () => {
  it('keeps the bindings that do not collide, drops the ones that do, and says so once', () => {
    store({ 'wall.fit': [key('code:Digit1', { alt: true })], 'wall.draw.line': [key('l')] });
    assert.deepEqual(effectiveKeys('wall.draw.line'), [key('l')]);
    assert.deepEqual(effectiveKeys('wall.fit'), [key('code:Digit0', { alt: true })], 'the colliding one is back on its default');
    assert.equal(takeDroppedBindings(), 1);
    assert.equal(takeDroppedBindings(), 0, 'told once');
    // The next change must not erase what was kept.
    rebindAction('wall.print', key('o', { mod: true }));
    const saved = localStorage.getItem(KEY_BINDINGS_STORAGE_KEY) ?? '';
    assert.ok(saved.includes('wall.draw.line') && saved.includes('wall.print'), saved);
    assert.ok(!saved.includes('wall.fit'), 'the dropped one is gone from storage');
  });

  it('keeps one of two actions that took the same key', () => {
    store({ 'wall.fit': [key('l')], 'wall.draw.line': [key('l')] });
    const holders = ['wall.fit', 'wall.draw.line'].filter((id) => effectiveKeys(id).some((c) => c.key === 'l'));
    assert.equal(holders.length, 1);
    assert.equal(takeDroppedBindings(), 1);
  });

  it('keeps a chord when only part of an action\'s keys collide', () => {
    store({ 'drafting.redo': [key('code:Digit1', { alt: true }), key('r', { mod: true, shift: true })] });
    assert.deepEqual(effectiveKeys('drafting.redo'), [key('r', { mod: true, shift: true })]);
    assert.equal(takeDroppedBindings(), 1);
  });
});

describe('import limits', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => key(`f${i + 1}`, { alt: true }));

  it('takes up to four chords for an action and refuses more, naming the action', () => {
    assert.equal(MAX_CHORDS_PER_ACTION, 4);
    assert.deepEqual(importKeyBindings(file({ 'wall.back': many(4) })), { ok: true, applied: 1, skipped: 0 });
    resetAllBindings();
    assert.deepEqual(importKeyBindings(file({ 'wall.back': many(5) })), { ok: false, reason: 'tooMany', action: 'wall.back', max: 4 });
    assert.deepEqual(effectiveKeys('wall.back'), []);
    const huge = importKeyBindings(file({ 'wall.back': Array.from({ length: 20000 }, () => key('q')) }));
    assert.equal(!huge.ok && huge.reason, 'tooMany');
  });

  it('refuses a file over the size cap without reading it, and takes one exactly at it', () => {
    assert.equal(IMPORT_MAX_CHARS, 256 * 1024);
    const text = file({ 'wall.back': [key('q')] });
    const pad = (n: number) => text + ' '.repeat(n - text.length);
    assert.deepEqual(importKeyBindings(pad(IMPORT_MAX_CHARS + 1)), { ok: false, reason: 'tooLarge' });
    assert.deepEqual(importKeyBindings(pad(IMPORT_MAX_CHARS)), { ok: true, applied: 1, skipped: 0 });
  });

  it('does not trust a stored set with more chords than that', () => {
    store({ 'wall.back': many(5) });
    assert.deepEqual(effectiveKeys('wall.back'), []);
  });
});

describe('recording a key', () => {
  const ev = (init: KeyboardEventInit) => new window.KeyboardEvent('keydown', init);
  it('records Alt with a letter by position, since Option+S types ß; a bare letter or digit by what it types', () => {
    assert.deepEqual(chordFromEvent(ev({ key: 'ß', code: 'KeyS', altKey: true })), key('code:KeyS', { alt: true }));
    assert.deepEqual(chordFromEvent(ev({ key: 'S', code: 'KeyS', altKey: true, shiftKey: true })), key('code:KeyS', { alt: true, shift: true }));
    assert.deepEqual(chordFromEvent(ev({ key: 's', code: 'KeyS' })), key('s'));
    assert.deepEqual(chordFromEvent(ev({ key: 's', code: 'KeyS', ctrlKey: true })), key('s', { mod: true }));
    assert.deepEqual(chordFromEvent(ev({ key: '1', code: 'Digit1' })), key('1'));
    assert.deepEqual(chordFromEvent(ev({ key: '!', code: 'Digit1', shiftKey: true })), key('code:Digit1', { shift: true }));
  });
});
