/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '@/i18n/en';
import { WALL_ACTIONS, defaultKeys, isWallAction } from './action-registry.js';
import { chordFromEvent, type KeyChord } from './chord.js';
import {
  KEY_BINDINGS_STORAGE_KEY, effectiveKeys, exportKeyBindings, importKeyBindings, isCustomised, loadKeyBindings,
  rebindAction, resetAction, resetAllBindings, unbindAction, useKeyBindings,
} from './key-bindings.js';
import { KEY_COMMANDS } from './keyboard-commands.js';
import { shortcutLabel } from './shortcut-label.js';

/** The Wall's action registry and the person's bindings over it (#166). */

afterEach(() => {
  resetAllBindings();
  localStorage.clear();
});

/** Every row of the Wall's and the drafting view's keymap as it shipped before #166, written out by hand. */
const SHIPPED: Readonly<Record<string, readonly KeyChord[]>> = {
  'wall.tool.dimaligned': [{ key: 'code:Digit1', alt: true }],
  'wall.tool.tag': [{ key: 'code:Digit2', alt: true }],
  'wall.tool.leader': [{ key: 'code:Digit3', alt: true }],
  'wall.tool.level': [{ key: 'code:Digit4', alt: true }],
  'wall.tool.sectionline': [{ key: 'code:Digit5', alt: true }],
  'wall.tool.symbol': [{ key: 'code:Digit6', alt: true }],
  'wall.draw.line': [{ key: 'code:Digit1', alt: true, shift: true }],
  'wall.draw.polyline': [{ key: 'code:Digit2', alt: true, shift: true }],
  'wall.draw.circle': [{ key: 'code:Digit3', alt: true, shift: true }],
  'wall.draw.text': [{ key: 'code:Digit4', alt: true, shift: true }],
  'wall.draw.hatch': [{ key: 'code:Digit5', alt: true, shift: true }],
  'wall.draw.revcloud': [{ key: 'code:Digit6', alt: true, shift: true }],
  'wall.draw.ptext': [{ key: 'code:Digit7', alt: true, shift: true }],
  'wall.addDrawing': [{ key: 'code:KeyA', alt: true }],
  'wall.fit': [{ key: 'code:Digit0', alt: true }],
  'wall.print': [{ key: 'p', mod: true }],
  'wall.prevSheet': [{ key: 'pageup' }],
  'wall.nextSheet': [{ key: 'pagedown' }],
  'drafting.undo': [{ key: 'z', mod: true }],
  'drafting.redo': [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }],
  'drafting.snap': [{ key: 'f3' }],
  'drafting.ortho': [{ key: 'f8' }],
  'drafting.cancel': [{ key: 'escape' }],
  'drafting.erase': [{ key: 'delete' }, { key: 'backspace' }],
  'drafting.confirm': [{ key: 'enter' }, { key: ' ' }],
};

const key = (k: string, mods: Omit<KeyChord, 'key'> = {}): KeyChord => ({ key: k, ...mods });

describe('the action registry', () => {
  it('is the keymap: every Wall and drafting row is an action, with a label in the catalogue and a category', () => {
    const rows = KEY_COMMANDS.filter((c) => c.when === 'wall' || c.when === 'drafting').map((c) => c.id);
    assert.deepEqual(WALL_ACTIONS.map((a) => a.id), rows);
    for (const a of WALL_ACTIONS) {
      assert.ok(en[a.labelKey], `${a.id}: label ${a.labelKey}`);
      assert.ok(a.category === 'wall' || a.category === 'drafting', a.id);
    }
  });

  it('gives each default key to one action at most, and lets an action ship with none', () => {
    const owner = new Map<string, string>();
    for (const a of WALL_ACTIONS) {
      for (const chord of defaultKeys(a.id)) {
        const slot = JSON.stringify(chord);
        assert.equal(owner.get(slot), undefined, `${a.id} and ${owner.get(slot)} share ${slot}`);
        owner.set(slot, a.id);
      }
    }
    assert.ok(WALL_ACTIONS.some((a) => a.keys.length === 0), 'some actions ship without a key');
  });

  it('keeps every key a person who never customises had before (#166 changes no default)', () => {
    for (const [id, chords] of Object.entries(SHIPPED)) {
      assert.ok(isWallAction(id), id);
      assert.deepEqual(effectiveKeys(id), chords, id);
    }
    // The actions added with #166 ship with no key, so nothing a person presses does anything new.
    for (const a of WALL_ACTIONS.filter((x) => !(x.id in SHIPPED))) assert.deepEqual(effectiveKeys(a.id), [], a.id);
    assert.equal(shortcutLabel('wall.print', false), 'Ctrl+P');
    assert.equal(shortcutLabel('drafting.ortho', false), 'F8');
  });
});

describe('rebinding', () => {
  it('gives the action the new key in place of its default, everywhere the key is read', () => {
    assert.deepEqual(rebindAction('wall.draw.line', key('l')), { ok: true });
    assert.deepEqual(effectiveKeys('wall.draw.line'), [key('l')]);
    assert.equal(shortcutLabel('wall.draw.line', false), 'L');
    assert.equal(isCustomised('wall.draw.line'), true);
    assert.equal(isCustomised('wall.draw.polyline'), false);
  });

  it('refuses a key another action has, and names it; nothing changes', () => {
    const outcome = rebindAction('wall.draw.line', key('code:Digit1', { alt: true }));
    assert.deepEqual(outcome, { ok: false, reason: 'conflict', holder: 'wall.tool.dimaligned' });
    assert.deepEqual(effectiveKeys('wall.draw.line'), SHIPPED['wall.draw.line']);
    // A drafting key is live on the Wall too, and the palette's key is kept for the palette.
    assert.deepEqual(rebindAction('wall.fit', key('f8')), { ok: false, reason: 'conflict', holder: 'drafting.ortho' });
    assert.deepEqual(rebindAction('wall.fit', key('k', { mod: true })), { ok: false, reason: 'conflict', holder: 'ui.commandPalette' });
  });

  it('sees the same physical key whether it was recorded by position or written as a character', () => {
    assert.equal(rebindAction('wall.fit', key('1', { alt: true })).ok, false);
  });

  it('frees a key when its action is given another, so a third can take it', () => {
    assert.ok(rebindAction('wall.tool.dimaligned', key('d')).ok);
    assert.ok(rebindAction('wall.draw.line', key('code:Digit1', { alt: true })).ok);
  });

  it('refuses Tab, which moves focus between controls, and a bare modifier', () => {
    assert.deepEqual(rebindAction('wall.fit', key('tab')), { ok: false, reason: 'reserved' });
    assert.deepEqual(rebindAction('wall.fit', key('tab', { shift: true })), { ok: false, reason: 'reserved' });
    assert.deepEqual(rebindAction('wall.fit', key('shift')), { ok: false, reason: 'reserved' });
  });

  it('can leave an action with no key', () => {
    unbindAction('wall.print');
    assert.deepEqual(effectiveKeys('wall.print'), []);
    assert.equal(shortcutLabel('wall.print'), '');
  });
});

describe('reset', () => {
  it('puts one action back on its default, and all of them back at once', () => {
    rebindAction('wall.draw.line', key('l'));
    rebindAction('wall.fit', key('f'));
    assert.deepEqual(resetAction('wall.draw.line'), { ok: true });
    assert.deepEqual(effectiveKeys('wall.draw.line'), SHIPPED['wall.draw.line']);
    assert.deepEqual(effectiveKeys('wall.fit'), [key('f')]);
    resetAllBindings();
    for (const [id, chords] of Object.entries(SHIPPED)) assert.deepEqual(effectiveKeys(id), chords, id);
    assert.equal(localStorage.getItem(KEY_BINDINGS_STORAGE_KEY), null, 'nothing is left in storage');
  });

  it('will not reset onto a default another action has taken since, and says which', () => {
    rebindAction('wall.tool.dimaligned', key('d'));
    rebindAction('wall.fit', key('code:Digit1', { alt: true }));
    assert.deepEqual(resetAction('wall.tool.dimaligned'), { ok: false, reason: 'conflict', holder: 'wall.fit' });
    assert.deepEqual(effectiveKeys('wall.tool.dimaligned'), [key('d')]);
  });
});

describe('saving, export and import', () => {
  it('saves per browser and reads the bindings back', () => {
    rebindAction('wall.draw.line', key('l'));
    assert.ok(localStorage.getItem(KEY_BINDINGS_STORAGE_KEY)?.includes('wall.draw.line'));
    useKeyBindings.setState({ overrides: {} }); // a new page: nothing in memory
    assert.deepEqual(effectiveKeys('wall.draw.line'), SHIPPED['wall.draw.line']);
    loadKeyBindings();
    assert.deepEqual(effectiveKeys('wall.draw.line'), [key('l')]);
  });

  it('round-trips: what is exported imports to the same bindings', () => {
    rebindAction('wall.draw.line', key('l'));
    rebindAction('drafting.ortho', key('o'));
    unbindAction('wall.print');
    const file = exportKeyBindings();
    resetAllBindings();
    assert.deepEqual(effectiveKeys('wall.draw.line'), SHIPPED['wall.draw.line']);
    assert.deepEqual(importKeyBindings(file), { ok: true, applied: 3, skipped: 0 });
    assert.deepEqual(effectiveKeys('wall.draw.line'), [key('l')]);
    assert.deepEqual(effectiveKeys('drafting.ortho'), [key('o')]);
    assert.deepEqual(effectiveKeys('wall.print'), []);
    assert.equal(exportKeyBindings(), file);
  });

  it('refuses a file that is not a keyboard set, or gives one key two actions, and changes nothing', () => {
    rebindAction('wall.fit', key('f'));
    assert.deepEqual(importKeyBindings('not json'), { ok: false, reason: 'invalid' });
    assert.deepEqual(importKeyBindings(JSON.stringify({ format: 'other', version: 1, bindings: {} })), { ok: false, reason: 'invalid' });
    assert.deepEqual(importKeyBindings(JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: { 'wall.fit': [{ key: 3 }] } })), { ok: false, reason: 'invalid' });
    const clash = JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: { 'wall.fit': [key('l')], 'wall.draw.line': [key('l')] } });
    const outcome = importKeyBindings(clash);
    assert.equal(outcome.ok, false);
    assert.equal(!outcome.ok && outcome.reason, 'conflict');
    assert.deepEqual(effectiveKeys('wall.fit'), [key('f')]);
  });

  it('leaves out, and counts, actions a file names that this Wall does not have', () => {
    const file = JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: { 'wall.someday': [key('q')], 'wall.fit': [key('f')] } });
    assert.deepEqual(importKeyBindings(file), { ok: true, applied: 1, skipped: 1 });
  });

  it('still works when storage is blocked: the change holds for the session, nothing throws', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      assert.ok(rebindAction('wall.draw.line', key('l')).ok);
      assert.deepEqual(effectiveKeys('wall.draw.line'), [key('l')]);
      loadKeyBindings();
      assert.deepEqual(effectiveKeys('wall.draw.line'), SHIPPED['wall.draw.line'], 'with nothing readable, the defaults');
    } finally {
      if (real) Object.defineProperty(globalThis, 'localStorage', real);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('does not trust a stored set that gives one key two actions', () => {
    localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: { 'wall.fit': [key('code:Digit1', { alt: true })] } }));
    loadKeyBindings();
    assert.deepEqual(effectiveKeys('wall.fit'), SHIPPED['wall.fit']);
  });
});

describe('recording a key', () => {
  const ev = (init: KeyboardEventInit) => new window.KeyboardEvent('keydown', init);
  it('waits for the key a modifier comes with, and records Alt and Shift digits by position', () => {
    assert.equal(chordFromEvent(ev({ key: 'Shift', shiftKey: true })), null);
    assert.deepEqual(chordFromEvent(ev({ key: 'L', code: 'KeyL', shiftKey: true })), key('l', { shift: true }));
    assert.deepEqual(chordFromEvent(ev({ key: '¡', code: 'Digit1', altKey: true })), key('code:Digit1', { alt: true }));
    assert.deepEqual(chordFromEvent(ev({ key: 'p', code: 'KeyP', metaKey: true })), key('p', { mod: true }));
    assert.deepEqual(chordFromEvent(ev({ key: 'F8', code: 'F8' })), key('f8'));
  });
});
