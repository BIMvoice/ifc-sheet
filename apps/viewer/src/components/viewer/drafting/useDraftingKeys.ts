/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keyboard for the drafting view in front: typing goes to the command line
 * (CAD style — no need to click it first); the keys (undo, redo, snap, ortho,
 * cancel, erase, confirm) are the rows of `lib/commands/drafting-key-commands.ts`,
 * read as bound now (`key-bindings.ts`, #166, matched in `drafting-key-match.ts`),
 * as the shortcut list reads them; an open dialog or menu keeps every key;
 * holding Ctrl locks ortho while down.
 */

import { useEffect, useRef } from 'react';
import { getCommandRuntime } from '@/lib/commands/modeling/runtime';
import { pressEnter, pressEscape, startDraftCommand, setOrthoHeld, useDraftingSession } from '@/drafting/session';
import { autocadModeOn } from '@/lib/commands/autocad-mode';
import { openKeyboardOverlay } from '@/lib/commands/dispatcher';
import type { DraftingKeyId } from '@/lib/commands/drafting-key-commands';
import { claimWallKey } from '../wall/wall-key-bus';
import { isDraftingKey } from './drafting-key-match';
import { runDraftingAction, type DraftingRunId } from './run-action';

/** The keys that act in place, in the order they are matched. */
const TOGGLES: readonly DraftingRunId[] = ['drafting.undo', 'drafting.redo', 'drafting.snap', 'drafting.ortho'];

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

/**
 * A form control that has no use for Escape: a select (its list closes on the key before the page ever sees it), a number
 * or a choice. Escape from one still ends the running tool, as from the canvas (#453): a tool card's pattern list must not
 * keep it alive. Free text keeps its Escape.
 */
function isPlainControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.closest('[data-owns-keys]')) return false;
  if (target.tagName === 'SELECT') return true;
  return target instanceof HTMLInputElement && ['number', 'range', 'checkbox', 'radio', 'button'].includes(target.type);
}

/** A control that acts on Enter or Space itself: a button, a link, a role=button, a form control. */
const INTERACTIVE = 'button, a[href], [role="button"], select, textarea, input, [contenteditable]:not([contenteditable="false"])';

/**
 * Whether Enter or Space is aimed at a control that acts on it (the command
 * line, which `submit`s on its own, aside). In AutoCAD mode (#168) `confirm`
 * repeats the last alias, so a Space that presses a button must not also do that.
 */
function onInteractiveControl(target: EventTarget | null, input: HTMLInputElement | null): boolean {
  return target instanceof Element && target !== input && target.closest(INTERACTIVE) !== null;
}

export function useDraftingKeys({ inputRef, setText, submit }: Params): void {
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const input = inputRef.current;
      if (inOtherField(e.target, input) && !(e.key === 'Escape' && isPlainControl(e.target))) return;
      // An open dialog or menu owns the keyboard, as it does for the viewer's own keys (the dispatcher).
      if (openKeyboardOverlay()) return;
      // A running BIM tool owns the keys (Enter, Escape, typed lengths: its own bindings).
      if (getCommandRuntime().command) return;
      const mod = e.ctrlKey || e.metaKey;
      // The command line has the keys while it has focus or holds text.
      const typing = e.target === input || (input?.value ?? '') !== '';
      // In AutoCAD mode (#168) every letter builds the typed command: a bare key the person bound is text, as while typing.
      const textFirst = typing || autocadModeOn();
      const isKey = (id: DraftingKeyId) => isDraftingKey(id, e, textFirst);
      const toggle = TOGGLES.find(isKey);
      if (toggle) {
        e.preventDefault();
        runDraftingAction(toggle);
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
        if (autocadModeOn() && onInteractiveControl(e.target, input)) return;
        e.preventDefault();
        submitRef.current();
        return;
      }
      if (!mod && !e.altKey && e.key.length === 1 && /[\w@<.,-]/.test(e.key) && input) {
        e.preventDefault();
        // A bare key the person bound to a Wall action runs it at once (#166), unless text is being
        // typed or AutoCAD mode is on. Any other key reaches the Wall's handlers on its own; the
        // defaults bind no bare key.
        if (!textFirst && claimWallKey(e)) return;
        input.focus();
        setText((prev) => prev + e.key);
      }
    };
    // Capture phase: the command line claims its keys before the viewer's global shortcuts
    // (which skip a prevented event) — typing "DIM" must not toggle panels.
    window.addEventListener('keydown', onKey, true);
    // Ctrl or Shift held = ortho, for as long as it is (the F8 toggle is untouched). Tracked apart from `onKey`, which skips text fields and running BIM tools;
    // a window that loses focus never sees the key come up, so blur releases it.
    const onCtrl = (e: KeyboardEvent) => setOrthoHeld(e.ctrlKey || e.shiftKey);
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
