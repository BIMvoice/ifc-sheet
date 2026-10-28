/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether a key event is one of the keys in force for a drafting action (the
 * keymap's, or what the person bound, #166). One reading for every handler of
 * these keys (the drafting view's, and the sheet's own Delete), so a key is
 * never also hard-coded somewhere else.
 */

import { eventMatchesChords } from '@/lib/commands/dispatcher';
import { isTypedChord } from '@/lib/commands/chord';
import { DRAFTING_EXACT_MODIFIERS, type DraftingKeyId } from '@/lib/commands/drafting-key-commands';
import { effectiveKeys, isRebound } from '@/lib/commands/key-bindings';
import { isTextEntryTarget, producesText } from '@/lib/keyboard-event';

/**
 * A key the person chose matches with its modifiers exactly. While text is being
 * typed into the command line (`typing`), a bare printable key the person bound
 * is the text's, never an action's; the keymap's own (Space confirms) still is.
 * A press that types a character into a text field (Option+S, AltGr+S) is the
 * field's, whatever it is bound to.
 */
export function isDraftingKey(id: DraftingKeyId, e: KeyboardEvent, typing = false): boolean {
  if (producesText(e) && isTextEntryTarget(e)) return false;
  const custom = isRebound(id);
  const keys = effectiveKeys(id).filter((chord) => !(typing && custom && isTypedChord(chord)));
  return eventMatchesChords(keys, e, !DRAFTING_EXACT_MODIFIERS.has(id) && !custom);
}
