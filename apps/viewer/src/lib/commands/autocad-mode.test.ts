/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** AutoCAD mode's alias table and its switch (#168). */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_COMMANDS } from '@/drafting/commands/registry';
import { isWallAction } from './action-registry';
import { AUTOCAD_ALIASES, autocadAliasAction } from './autocad-aliases';
import { AUTOCAD_MODE_STORAGE_KEY, autocadModeOn, loadAutocadMode, setAutocadMode } from './autocad-mode';

afterEach(() => {
  setAutocadMode(false);
  localStorage.clear();
});

describe('the alias table', () => {
  it('names only actions of the registry, each alias once, in upper case', () => {
    const seen = new Set<string>();
    for (const { alias, action } of AUTOCAD_ALIASES) {
      assert.ok(isWallAction(action), `${alias} -> ${action}`);
      assert.equal(alias, alias.toUpperCase());
      assert.ok(!seen.has(alias), `${alias} twice`);
      seen.add(alias);
    }
  });

  it('never takes a name a drafting command answers to, so a typed word means one thing', () => {
    const names = new Set(DRAFT_COMMANDS.flatMap((c) => c.aliases));
    for (const { alias } of AUTOCAD_ALIASES) assert.ok(!names.has(alias), `${alias} is a drafting command's name`);
  });

  it('reads a typed word in any case, with spaces around it', () => {
    assert.equal(autocadAliasAction(' z '), 'wall.fit');
    assert.equal(autocadAliasAction('Plot'), 'wall.print');
    assert.equal(autocadAliasAction('u'), 'drafting.undo');
    assert.equal(autocadAliasAction('ZZ'), undefined);
    assert.equal(autocadAliasAction(''), undefined);
  });
});

describe('the switch', () => {
  it('is off by default', () => {
    localStorage.clear();
    loadAutocadMode();
    assert.equal(autocadModeOn(), false);
  });

  it('is kept per browser, and read back', () => {
    setAutocadMode(true);
    assert.equal(localStorage.getItem(AUTOCAD_MODE_STORAGE_KEY), 'on');
    loadAutocadMode(); // a new page load
    assert.equal(autocadModeOn(), true);
    setAutocadMode(false);
    assert.equal(localStorage.getItem(AUTOCAD_MODE_STORAGE_KEY), null);
    loadAutocadMode(); // a new page load
    assert.equal(autocadModeOn(), false);
  });

  it('a stored value other than "on" leaves it off', () => {
    localStorage.setItem(AUTOCAD_MODE_STORAGE_KEY, 'true');
    loadAutocadMode();
    assert.equal(autocadModeOn(), false);
  });

  it('blocked storage leaves it off at load and holds a change for the session', () => {
    const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const warn = console.warn;
    console.warn = () => {};
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    try {
      loadAutocadMode();
      assert.equal(autocadModeOn(), false);
      setAutocadMode(true);
      assert.equal(autocadModeOn(), true);
    } finally {
      if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
      console.warn = warn;
    }
  });
});
