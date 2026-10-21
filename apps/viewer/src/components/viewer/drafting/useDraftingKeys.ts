/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keyboard for the drafting view in front: typing goes to the command line
 * (CAD style — no need to click it first); the keys (undo, redo, snap, ortho,
 * cancel, erase, confirm) are the rows of `lib/commands/drafting-key-commands.ts`,
 * read as bound now (`key-bindings.ts`, #166), as the shortcut list reads them;
 * holding Ctrl locks ortho while down.
 */

import { useEffect, useRef } from 'react';
import { redoEarliest, undoLatest } from '@/project/unified-undo';
import { getCommandRuntime } from '@/lib/commands/modeling/runtime';
import { pressEnter, pressEscape, startDraftCommand, setOrthoHeld, toggleOrtho, toggleSnap, useDraftingSession } from '@/drafting/session';
import { eventMatchesChords } from '@/lib/commands/dispatcher';
import { isTypedChord } from '@/lib/commands/chord';
import { DRAFTING_EXACT_MODIFIERS, type DraftingKeyId } from '@/lib/commands/drafting-key-commands';
import { effectiveKeys, isCustomised } from '@/lib/commands/key-bindings';
import { claimWallKey } from '../wall/wall-key-bus';

/**
 * Whether the event is one of the keys in force for the row `id` (the keymap's,
 * or what the person bound, #166). A key the person chose matches with its
 * modifiers exactly. While text is being typed into the command line (`typing`),
 * a bare printable key is the text's, never an action's.
 */
function isKeyIn(id: DraftingKeyId, e: KeyboardEvent, typing: boolean): boolean {
  const keys = effectiveKeys(id).filter((chord) => !(typing && isTypedChord(chord)));
  return eventMatchesChords(keys, e, !DRAFTING_EXACT_MODIFIERS.has(id) && !isCustomised(id));
}

interface Params {
  inputRef: React.RefObject<HTMLInputElement | null>;
  setText: React.Dispatch<React.SetStateAction<string>>;
  /** Confirm with an empty line (Enter / Space outside the input). */
  submit: () => void;
}

/**
 * Whether a key event belongs to another text field than the command line,
 * or to a panel that keeps its own keys (`data-owns-keys`: Enter and Space
 * press its buttons, and nothing it is given reaches a running tool).
 */
function inOtherField(target: EventTarget | null, input: HTMLInputElement | null): boolean {
  if (!(target instanceof HTMLElement) || target === input) return false;
  if (target.closest('[data-owns-keys]')) return true;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useDraftingKeys({ inputRef, setText, submit }: Params): void {
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const input = inputRef.current;
      if (inOtherField(e.target, input)) return;
      // A running BIM tool owns the keys (Enter, Escape, typed lengths: its own bindings).
      if (getCommandRuntime().command) return;
      const mod = e.ctrlKey || e.metaKey;
      // The command line has the keys while it has focus or holds text.
      const typing = e.target === input || (input?.value ?? '') !== '';
      const isKey = (id: DraftingKeyId) => isKeyIn(id, e, typing);
      if (isKey('drafting.undo')) {
        e.preventDefault();
        undoLatest();
        return;
      }
      if (isKey('drafting.redo')) {
        e.preventDefault();
        redoEarliest();
        return;
      }
      if (isKey('drafting.snap')) {
        e.preventDefault();
        toggleSnap();
        return;
      }
      if (isKey('drafting.ortho')) {
        e.preventDefault();
        toggleOrtho();
        return;
      }
      if (e.target === input) return; // the command line handles its own Enter / Escape / typing
      if (isKey('drafting.cancel')) {
        pressEscape();
        return;
      }
      if (isKey('drafting.erase')) {
        if (useDraftingSession.getState().selection.size > 0 && !useDraftingSession.getState().commandId) {
          e.preventDefault();
          startDraftCommand('erase');
          pressEnter();
        }
        return;
      }
      if (isKey('drafting.confirm')) {
        e.preventDefault();
        submitRef.current();
        return;
      }
      if (!mod && !e.altKey && e.key.length === 1 && /[\w@<.,-]/.test(e.key) && input) {
        e.preventDefault();
        // A bare key the person bound to a Wall action runs it at once (#166), unless text is being
        // typed. Any other key reaches the Wall's handlers on its own; the defaults bind no bare key.
        if (!typing && claimWallKey(e)) return;
        input.focus();
        setText((prev) => prev + e.key);
      }
    };
    // Capture phase: the command line claims its keys before the viewer's global shortcuts
    // (which skip a prevented event) — typing "DIM" must not toggle panels.
    window.addEventListener('keydown', onKey, true);
    // Ctrl held = ortho. Tracked apart from `onKey`, which skips text fields and running BIM tools;
    // a window that loses focus never sees the key come up, so blur releases it.
    const onCtrl = (e: KeyboardEvent) => setOrthoHeld(e.ctrlKey);
    const release = () => setOrthoHeld(false);
    window.addEventListener('keydown', onCtrl, true);
    window.addEventListener('keyup', onCtrl, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', onCtrl, true);
      window.removeEventListener('keyup', onCtrl, true);
      window.removeEventListener('blur', release);
      release();
    };
  }, [inputRef, setText]);
}
