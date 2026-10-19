/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DRAW_TOOLS, WALL_TOOLS } from '@/components/viewer/wall/wall-actions';
import { en } from '@/i18n/en';
import { KEY_COMMANDS } from './keyboard-commands.js';
import { shortcutLabel } from './shortcut-label.js';
import { WALL_KEY_COMMANDS, shownOnTheWall, wallKeyTool, wallToolKey } from './wall-key-commands.js';

/**
 * The Wall's rows of the one keymap: every tool the rail offers has a key, no
 * key can be swallowed by the drafting view's command line, and the labels
 * every surface shows are real.
 */

describe('the Wall in the keymap', () => {
  it('gives every tool on the rail a key, and no key starts a tool the rail does not have', () => {
    for (const tool of [...WALL_TOOLS, ...DRAW_TOOLS]) {
      const id = wallToolKey(tool.command);
      assert.ok(id, `${tool.command} has a key`);
      assert.equal(wallKeyTool(id), tool.command);
      assert.ok(WALL_KEY_COMMANDS.some((c) => c.id === id), `${id} is a row of the table`);
    }
    const tools = new Set([...WALL_TOOLS, ...DRAW_TOOLS].map((t) => t.command));
    for (const c of WALL_KEY_COMMANDS.filter((x) => x.id.startsWith('wall.tool.') || x.id.startsWith('wall.draw.'))) {
      assert.ok(tools.has(wallKeyTool(c.id) ?? ''), `${c.id} starts a tool on the rail`);
    }
  });

  it('binds nothing the drafting view types into its command line', () => {
    // useDraftingKeys types any bare printable key (letters, digits, . , - @ <), shifted or not, and takes Ctrl/Cmd chords for undo.
    for (const c of WALL_KEY_COMMANDS) {
      for (const chord of c.keys) {
        const typed = chord.key.length === 1 && !('alt' in chord && chord.alt) && !('mod' in chord && chord.mod);
        assert.equal(typed, false, `${c.id}: ${chord.key} would be typed into the command line`);
      }
    }
  });

  it('shares no chord with another row of the Wall, and every row has a label in the catalogue and a key to show', () => {
    const seen = new Set<string>();
    for (const c of WALL_KEY_COMMANDS) {
      assert.ok(en[c.labelKey], `${c.id}: label ${c.labelKey}`);
      assert.ok(shortcutLabel(c.id, true) && shortcutLabel(c.id, false), c.id);
      for (const chord of c.keys) {
        const slot = JSON.stringify(chord);
        assert.equal(seen.has(slot), false, `${c.id} repeats ${slot}`);
        seen.add(slot);
      }
    }
  });

  it('writes the keys for the platform: ⌘ on a Mac, Ctrl elsewhere', () => {
    assert.equal(shortcutLabel('wall.print', true), '⌘P');
    assert.equal(shortcutLabel('wall.print', false), 'Ctrl+P');
    assert.equal(shortcutLabel('wall.tool.tag', true), '⌥2');
    assert.equal(shortcutLabel('wall.tool.tag', false), 'Alt+2');
    assert.equal(shortcutLabel('wall.draw.line', false), 'Alt+Shift+1');
    assert.equal(shortcutLabel('wall.addDrawing', false), 'Alt+A');
  });

  it('lists the Wall, the palette and the list itself on IfcSheet\'s face, and nothing of the 3D viewer', () => {
    const ids = shownOnTheWall(KEY_COMMANDS).map((c) => c.id);
    assert.deepEqual(ids.filter((id) => !id.startsWith('wall.')), ['ui.commandPalette', 'help.shortcuts']);
    assert.equal(ids.filter((id) => id.startsWith('wall.')).length, WALL_KEY_COMMANDS.length);
  });
});
