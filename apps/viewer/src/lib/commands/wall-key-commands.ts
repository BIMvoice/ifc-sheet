/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's keys, as rows of the one keyboard table (`keyboard-commands.ts`
 * spreads these in). Tooltips, the shortcut list and the palette read the keys
 * from here, and the Wall's handlers (`wall/wall-key-bus.ts`) are bound by
 * these ids, so a key is never shown that nothing performs.
 *
 * Why Alt and Ctrl/Cmd chords, and no bare letters: the drafting view takes
 * every typed letter, digit and `. , - @ <` for its command line ("L" starts
 * LINE, "PL" a polyline, digits are lengths), so a bare letter bound here
 * would never be heard once a drawing is in front. Alt chords are never typed
 * into it. The tools are positional (`code:Digit1`, as the viewer's Alt+digit
 * panel keys are): Option+1 on a Mac types a glyph, not "1".
 *
 * Ctrl/Cmd+P is print: it is taken over only where the Wall's own print path
 * applies (a sheet in front, its print button showing); anywhere else the
 * handler declines and the browser prints.
 */

import type { KeyCommandDefinition } from './keyboard-commands';

const digit = (n: number, shift = false) => ({ key: `code:Digit${n}`, alt: true as const, ...(shift ? { shift: true as const } : {}) });

export const WALL_KEY_COMMANDS = [
  { id: 'wall.tool.dimaligned', labelKey: 'wall.tool.dimension', category: 'wall', when: 'wall', keys: [digit(1)] },
  { id: 'wall.tool.tag', labelKey: 'wall.tool.tag', category: 'wall', when: 'wall', keys: [digit(2)] },
  { id: 'wall.tool.leader', labelKey: 'wall.tool.text', category: 'wall', when: 'wall', keys: [digit(3)] },
  { id: 'wall.tool.level', labelKey: 'wall.tool.level', category: 'wall', when: 'wall', keys: [digit(4)] },
  { id: 'wall.tool.sectionline', labelKey: 'wall.tool.section', category: 'wall', when: 'wall', keys: [digit(5)] },
  { id: 'wall.tool.symbol', labelKey: 'wall.tool.symbol', category: 'wall', when: 'wall', keys: [digit(6)] },
  { id: 'wall.draw.line', labelKey: 'wall.draw.line', category: 'wall', when: 'wall', keys: [digit(1, true)] },
  { id: 'wall.draw.polyline', labelKey: 'wall.draw.polyline', category: 'wall', when: 'wall', keys: [digit(2, true)] },
  { id: 'wall.draw.circle', labelKey: 'wall.draw.circle', category: 'wall', when: 'wall', keys: [digit(3, true)] },
  { id: 'wall.draw.text', labelKey: 'wall.draw.text', category: 'wall', when: 'wall', keys: [digit(4, true)] },
  { id: 'wall.draw.hatch', labelKey: 'wall.draw.hatch', category: 'wall', when: 'wall', keys: [digit(5, true)] },
  { id: 'wall.draw.revcloud', labelKey: 'wall.draw.revcloud', category: 'wall', when: 'wall', keys: [digit(6, true)] },
  { id: 'wall.addDrawing', labelKey: 'wall.addDrawing', category: 'wall', when: 'wall', keys: [{ key: 'code:KeyA', alt: true }] },
  { id: 'wall.fit', labelKey: 'wall.fit', category: 'wall', when: 'wall', keys: [digit(0)] },
  { id: 'wall.print', labelKey: 'wall.export.pdf', category: 'wall', when: 'wall', keys: [{ key: 'p', mod: true }] },
  { id: 'wall.prevSheet', labelKey: 'commands.wall.prevSheet', category: 'wall', when: 'wall', keys: [{ key: 'pageup' }] },
  { id: 'wall.nextSheet', labelKey: 'commands.wall.nextSheet', category: 'wall', when: 'wall', keys: [{ key: 'pagedown' }] },
] as const satisfies readonly KeyCommandDefinition[];

export type WallKeyId = (typeof WALL_KEY_COMMANDS)[number]['id'];

/** The rail's tool (by its draft command) to the key that starts it. */
const TOOL_KEYS: Readonly<Record<string, WallKeyId>> = {
  dimaligned: 'wall.tool.dimaligned', tag: 'wall.tool.tag', leader: 'wall.tool.leader', level: 'wall.tool.level',
  sectionline: 'wall.tool.sectionline', symbol: 'wall.tool.symbol',
  line: 'wall.draw.line', polyline: 'wall.draw.polyline', circle: 'wall.draw.circle', text: 'wall.draw.text', hatch: 'wall.draw.hatch', revcloud: 'wall.draw.revcloud',
};

export function wallToolKey(command: string): WallKeyId | undefined {
  return TOOL_KEYS[command];
}

/** The draft command a tool key starts: the inverse of {@link wallToolKey}. */
export function wallKeyTool(id: WallKeyId): string | undefined {
  return Object.keys(TOOL_KEYS).find((command) => TOOL_KEYS[command] === id);
}

/**
 * The rows the shortcut list shows when IfcSheet's own face is up: the Wall's,
 * the drafting view's (undo, snap, ortho… on every sheet and drawing), and the
 * palette and the list itself. The viewer's other keys (walk, measure, basket)
 * act on a 3D view the Wall does not show, so listing them would list keys
 * that do nothing there.
 */
export function shownOnTheWall<T extends { id: string; when: string }>(commands: readonly T[]): T[] {
  return commands.filter((c) => c.when === 'wall' || c.when === 'drafting' || c.id === 'ui.commandPalette' || c.id === 'help.shortcuts');
}
