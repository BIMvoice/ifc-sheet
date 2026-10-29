/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting view's keys, as rows of the one keyboard table
 * (`keyboard-commands.ts` spreads these in). The drafting view's own key
 * handler (`components/viewer/drafting/useDraftingKeys.ts`) matches events
 * against these rows, and the shortcut list reads them from here, so the list
 * cannot name a drafting key the view does not perform, or miss one it does.
 *
 * They work wherever a drawing is in front: on the Wall's sheets and drawings
 * and in the 2D views. Typed letters and digits go to the command line and
 * are not keys of this table.
 */

import type { KeyCommandDefinition } from './keyboard-commands';

export const DRAFTING_KEY_COMMANDS = [
  { id: 'drafting.undo', labelKey: 'commands.drafting.undo', category: 'drafting', when: 'drafting', keys: [{ key: 'z', mod: true }] },
  { id: 'drafting.redo', labelKey: 'commands.drafting.redo', category: 'drafting', when: 'drafting', keys: [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }] },
  { id: 'drafting.snap', labelKey: 'commands.drafting.snap', category: 'drafting', when: 'drafting', keys: [{ key: 'f3' }] },
  { id: 'drafting.ortho', labelKey: 'commands.drafting.ortho', category: 'drafting', when: 'drafting', keys: [{ key: 'f8' }] },
  { id: 'drafting.copy', labelKey: 'commands.drafting.copy', category: 'drafting', when: 'drafting', keys: [{ key: 'c', mod: true }] },
  { id: 'drafting.paste', labelKey: 'commands.drafting.paste', category: 'drafting', when: 'drafting', keys: [{ key: 'v', mod: true }] },
  { id: 'drafting.duplicate', labelKey: 'commands.drafting.duplicate', category: 'drafting', when: 'drafting', keys: [{ key: 'd', mod: true }] },
  { id: 'drafting.cancel', labelKey: 'commands.drafting.cancel', category: 'drafting', when: 'drafting', keys: [{ key: 'escape' }] },
  { id: 'drafting.erase', labelKey: 'commands.drafting.erase', category: 'drafting', when: 'drafting', keys: [{ key: 'delete' }, { key: 'backspace' }] },
  { id: 'drafting.confirm', labelKey: 'commands.drafting.confirm', category: 'drafting', when: 'drafting', keys: [{ key: 'enter' }, { key: ' ' }] },
] as const satisfies readonly KeyCommandDefinition[];

export type DraftingKeyId = (typeof DRAFTING_KEY_COMMANDS)[number]['id'];

/**
 * The rows whose modifiers matter. The others take a key with any modifier
 * held, as the drafting view always has (Shift+Enter still confirms, and Ctrl
 * held for ortho does not stop F3 or Escape).
 */
export const DRAFTING_EXACT_MODIFIERS: ReadonlySet<DraftingKeyId> = new Set(['drafting.undo', 'drafting.redo', 'drafting.copy', 'drafting.paste', 'drafting.duplicate']);
