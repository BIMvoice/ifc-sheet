/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WALL_ACTIONS, defaultKeys, isWallAction, type WallActionId } from './action-registry.js';
import { AUTOCAD_ALIASES } from './autocad-aliases.js';
import { autocadModeOn, setAutocadMode } from './autocad-mode.js';
import {
  KEY_PRESET_STORAGE_KEY, currentPreset, effectiveKeys, exportKeyBindings, importKeyBindings, isCustomised, loadKeyBindings,
  presetConflict, rebindAction, resetAction, resetAllBindings, setKeyPreset, unbindAction,
} from './key-bindings.js';
import type { KeyChord } from './chord.js';
import { KEY_PRESETS, presetKeys } from './key-presets.js';

/** The key presets (#166): a table each, the person's own keys on top. */

afterEach(() => {
  setKeyPreset('default');
  resetAllBindings();
  setAutocadMode(false);
  localStorage.clear();
});

/** Every Wall action with the keys in force, as a listing prints them. */
const listed = (): string => JSON.stringify(WALL_ACTIONS.map((a) => [a.id, effectiveKeys(a.id)]));
const changedBy = (before: string, after: string): string[] => {
  const a = new Map(JSON.parse(before) as [string, unknown][]);
  return (JSON.parse(after) as [string, unknown][]).filter(([id, keys]) => JSON.stringify(a.get(id)) !== JSON.stringify(keys)).map(([id]) => id);
};

describe('the preset tables', () => {
  it('"IfcSheet default" is today\'s bindings: it overrides nothing, so every action is on its shipped key', () => {
    assert.deepEqual(presetKeys('default'), {});
    for (const a of WALL_ACTIONS) assert.deepEqual(effectiveKeys(a.id), defaultKeys(a.id), a.id);
  });

  it('every preset names only registry actions, each with at most four keys, and none collides', () => {
    for (const preset of KEY_PRESETS) {
      for (const [id, keys] of Object.entries(preset.keys)) {
        assert.ok(isWallAction(id), `${preset.id}: ${id}`);
        assert.ok((keys?.length ?? 0) <= 4);
      }
      assert.equal(presetConflict(preset.keys), null, preset.id);
    }
  });

  it('the conflict check rejects a preset that gives one key to two actions', () => {
    const collision = { 'wall.fit': [{ key: 'code:Digit1', alt: true }] } as const; // wall.tool.dimaligned's key
    const found = presetConflict(collision);
    assert.ok(found);
    assert.equal(found.first, 'wall.fit');
    assert.equal(found.second, 'wall.tool.dimaligned');
    // Two actions of one table on the same key.
    assert.ok(presetConflict({ 'wall.fit': [{ key: 'f9' }], 'wall.print': [{ key: 'f9' }] }));
  });

  it('the AutoCAD-like set sits beside the aliases: it only moves keys of actions the aliases or the drafting view name', () => {
    const aliased = new Set<string>(AUTOCAD_ALIASES.map((a) => a.action));
    for (const id of Object.keys(presetKeys('autocad'))) {
      assert.ok(isWallAction(id));
      assert.ok(aliased.has(id) || id.startsWith('drafting.') || id.startsWith('wall.'), id);
    }
  });
});

describe('switching presets', () => {
  it('AutoCAD-like changes exactly the listed bindings, and switching back restores the default byte for byte', () => {
    const before = listed();
    const outcome = setKeyPreset('autocad');
    assert.deepEqual(outcome, { ok: true, dropped: 0 });
    assert.equal(currentPreset(), 'autocad');
    const after = listed();
    assert.deepEqual(changedBy(before, after).sort(), Object.keys(presetKeys('autocad')).sort());
    for (const [id, keys] of Object.entries(presetKeys('autocad'))) assert.deepEqual(effectiveKeys(id), keys, id);
    assert.deepEqual(effectiveKeys('drafting.erase'), [{ key: 'delete' }]);
    setKeyPreset('default');
    assert.equal(listed(), before);
  });

  it('keeps the person\'s own rebinding across a switch, and "reset to preset" removes it', () => {
    const own: KeyChord = { key: 'code:KeyF', alt: true };
    assert.deepEqual(rebindAction('wall.fit', own), { ok: true });
    setKeyPreset('autocad');
    assert.deepEqual(effectiveKeys('wall.fit'), [own]);
    assert.ok(isCustomised('wall.fit'));
    setKeyPreset('default');
    assert.deepEqual(effectiveKeys('wall.fit'), [own]);
    setKeyPreset('autocad');
    resetAllBindings();
    assert.deepEqual(effectiveKeys('wall.fit'), defaultKeys('wall.fit'));
    assert.equal(currentPreset(), 'autocad', 'reset keeps the chosen preset');
    assert.deepEqual(effectiveKeys('drafting.erase'), [{ key: 'delete' }]);
  });

  it('a custom binding on a key the preset moves wins over the preset, and one action resets to the PRESET\'s key', () => {
    setKeyPreset('autocad');
    unbindAction('drafting.erase');
    assert.deepEqual(effectiveKeys('drafting.erase'), []);
    assert.deepEqual(resetAction('drafting.erase'), { ok: true });
    assert.deepEqual(effectiveKeys('drafting.erase'), [{ key: 'delete' }], 'not the default Delete + Backspace');
  });

  it('refuses, under a preset, a rebinding onto a key that preset gave another action', () => {
    const ctrlPageUp = { key: 'pageup', mod: true } as const;
    assert.deepEqual(rebindAction('wall.fit', ctrlPageUp), { ok: true }, 'free under the default set');
    resetAllBindings();
    setKeyPreset('autocad');
    assert.deepEqual(rebindAction('wall.fit', ctrlPageUp), { ok: false, reason: 'conflict', holder: 'wall.prevSheet' });
  });

  it('drops, and counts, a custom key the new preset needs for another action', () => {
    const ctrlPageUp = { key: 'pageup', mod: true } as const;
    assert.deepEqual(rebindAction('wall.fit', ctrlPageUp), { ok: true });
    const outcome = setKeyPreset('autocad');
    assert.equal(outcome.dropped, 1);
    assert.deepEqual(effectiveKeys('wall.fit'), defaultKeys('wall.fit'));
    assert.deepEqual(effectiveKeys('wall.prevSheet'), presetKeys('autocad')['wall.prevSheet']);
    const holders = new Map<string, WallActionId>();
    for (const a of WALL_ACTIONS) for (const c of effectiveKeys(a.id)) {
      const k = JSON.stringify(c);
      assert.equal(holders.has(k) && holders.get(k) !== a.id, false, `${k} on two actions`);
      holders.set(k, a.id as WallActionId);
    }
  });

  it('never turns AutoCAD mode on by itself', () => {
    setKeyPreset('autocad');
    assert.equal(autocadModeOn(), false);
  });
});

describe('persistence and files', () => {
  it('the chosen preset is saved and read again; the default leaves no entry', () => {
    setKeyPreset('autocad');
    assert.equal(localStorage.getItem(KEY_PRESET_STORAGE_KEY), 'autocad');
    setKeyPreset('default');
    assert.equal(localStorage.getItem(KEY_PRESET_STORAGE_KEY), null);
    localStorage.setItem(KEY_PRESET_STORAGE_KEY, 'autocad');
    loadKeyBindings();
    assert.equal(currentPreset(), 'autocad');
    localStorage.setItem(KEY_PRESET_STORAGE_KEY, 'nonsense');
    loadKeyBindings();
    assert.equal(currentPreset(), 'default');
  });

  it('an exported set carries its preset, and importing it restores both layers', () => {
    setKeyPreset('autocad');
    rebindAction('wall.fit', { key: 'code:KeyF', alt: true });
    const file = exportKeyBindings();
    assert.equal(JSON.parse(file).preset, 'autocad');
    setKeyPreset('default');
    resetAllBindings();
    assert.deepEqual(importKeyBindings(file), { ok: true, applied: 1, skipped: 0 });
    assert.equal(currentPreset(), 'autocad');
    assert.deepEqual(effectiveKeys('wall.fit'), [{ key: 'code:KeyF', alt: true }]);
  });

  it('a file from before presets (no preset) puts the shipped keys under it; an unknown preset is not a keyboard set', () => {
    setKeyPreset('autocad');
    const old = JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, bindings: {} });
    assert.deepEqual(importKeyBindings(old), { ok: true, applied: 0, skipped: 0 });
    assert.equal(currentPreset(), 'default');
    const bad = JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, preset: 'emacs', bindings: {} });
    assert.deepEqual(importKeyBindings(bad), { ok: false, reason: 'invalid' });
  });

  it('a file whose own keys collide with its preset changes nothing', () => {
    const file = JSON.stringify({ format: 'ifcsheet-keyboard', version: 1, preset: 'autocad', bindings: { 'wall.fit': [{ key: 'pageup', mod: true }] } });
    const outcome = importKeyBindings(file);
    assert.equal(outcome.ok, false);
    assert.equal(currentPreset(), 'default');
  });
});
