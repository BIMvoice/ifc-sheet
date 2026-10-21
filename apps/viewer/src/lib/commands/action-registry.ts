/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's action registry (#166): every action a key can run on the Wall,
 * each with its id, its label (a catalogue key), its category and its default
 * binding. The entries ARE the Wall's and the drafting view's rows of the one
 * keymap (`wall-key-commands.ts`, `drafting-key-commands.ts`): a row's `keys`
 * is the action's default binding, and an empty `keys` is an action that ships
 * with no key. There is no second list to keep in step.
 *
 * What a person binds instead lives in `key-bindings.ts`; every surface that
 * runs or shows a key (the dispatcher, the drafting view, tooltips,
 * `aria-keyshortcuts`, the shortcut list, the palette) reads the binding in
 * force from there. An emulation mode built later (#168: typed aliases,
 * Enter to repeat) is meant to run these same actions by these same ids.
 */

import type { KeyChord } from './chord';
import { DRAFTING_KEY_COMMANDS } from './drafting-key-commands';
import type { KeyCommandDefinition, KeyCommandId } from './keyboard-commands';
import { WALL_KEY_COMMANDS } from './wall-key-commands';

export const WALL_ACTIONS = [...WALL_KEY_COMMANDS, ...DRAFTING_KEY_COMMANDS] as const satisfies readonly KeyCommandDefinition[];

export type WallActionId = (typeof WALL_ACTIONS)[number]['id'];

const BY_ID: ReadonlyMap<string, KeyCommandDefinition> = new Map(WALL_ACTIONS.map((a) => [a.id, a]));

export function isWallAction(id: string): id is WallActionId {
  return BY_ID.has(id);
}

/** The action's default binding: its row's keys, as shipped. */
export function defaultKeys(id: WallActionId): readonly KeyChord[] {
  return BY_ID.get(id)?.keys ?? [];
}

/**
 * Keys that work on the Wall but belong to no Wall action: the palette and the
 * shortcut list. A binding may not take them, or they would stop opening.
 */
export const RESERVED_ON_THE_WALL: readonly KeyCommandId[] = ['ui.commandPalette', 'help.shortcuts'];
