/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { setEditionForTests } from '@/edition';
import { KEY_COMMANDS } from '@/lib/commands/keyboard-commands';
import { shortcutLabel } from '@/lib/commands/shortcut-label';
import { WALL_KEY_COMMANDS } from '@/lib/commands/wall-key-commands';
import { DRAFTING_KEY_COMMANDS } from '@/lib/commands/drafting-key-commands';
import { ShortcutsTab } from './ShortcutsTab.js';

/** The list of keys is generated from the keymap (#99): a row for each entry, with the entry's keys. */

afterEach(() => {
  cleanup();
  setEditionForTests(null);
});

const shown = (ui: HTMLElement) => new Map([...ui.querySelectorAll('[data-shortcut-command]')]
  .map((row) => [row.getAttribute('data-shortcut-command') ?? '', row.querySelector('kbd')?.textContent ?? '']));

describe('the shortcut list on IfcSheet\'s face', () => {
  it('has a row for every entry of the Wall in the keymap that has a key, with the keymap\'s keys', () => {
    setEditionForTests('docs');
    const rows = shown(render(<ShortcutsTab />));
    // An action that ships with no key (#166) is not a shortcut: the keyboard settings list it instead.
    for (const c of WALL_KEY_COMMANDS) assert.equal(rows.get(c.id), c.keys.length > 0 ? shortcutLabel(c.id) : undefined, c.id);
    assert.ok(WALL_KEY_COMMANDS.some((c) => c.keys.length === 0), 'the control has an unbound row to skip');
    assert.ok(rows.has('ui.commandPalette') && rows.has('help.shortcuts'));
    assert.equal(rows.has('walk.move'), false, 'no key of the 3D viewer');
  });

  it('lists the drafting keys that work on the Wall, read from the drafting keymap (#119 review)', () => {
    setEditionForTests('docs');
    const rows = shown(render(<ShortcutsTab />));
    for (const c of DRAFTING_KEY_COMMANDS) assert.equal(rows.get(c.id), shortcutLabel(c.id, false), c.id);
    assert.equal(rows.get('drafting.undo'), 'Ctrl+Z');
    assert.equal(rows.get('drafting.snap'), 'F3');
    assert.equal(rows.get('drafting.ortho'), 'F8');
  });

  it('adds a row when an entry is added to the table', () => {
    setEditionForTests('docs');
    const base = [...WALL_KEY_COMMANDS];
    const before = shown(render(<ShortcutsTab commands={base} />)).size;
    cleanup();
    const extra = { ...WALL_KEY_COMMANDS[0], id: 'wall.extra', keys: [{ key: 'code:KeyJ', alt: true as const }] };
    const after = shown(render(<ShortcutsTab commands={[...base, extra]} />));
    assert.equal(after.size, before + 1);
    assert.equal(after.get('wall.extra'), 'Alt+J');
  });

  it('keeps the whole keymap in the full edition', () => {
    setEditionForTests('full');
    const rows = shown(render(<ShortcutsTab />));
    for (const c of KEY_COMMANDS) assert.equal(rows.has(c.id), c.keys.length > 0, c.id);
  });
});
