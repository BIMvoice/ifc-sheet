/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Defensive readers for the two `KeyboardEvent` fields whose TypeScript types
 * are stricter than what browsers actually dispatch.
 *
 * `KeyboardEvent.key` is typed `string` by the DOM lib, but it is genuinely
 * absent on some real events:
 *  - Chromium fires a `keyup` carrying no `key` when the user accepts a browser
 *    autofill / password-manager suggestion (reproduced on Edge 150 / Windows).
 *  - Events synthesised by extensions or by `dispatchEvent(new Event('keyup'))`
 *    have no `key` either — `Event` has no `key`, and nothing stops that event
 *    from reaching a `keyup` listener.
 *
 * Reading `.toLowerCase()` on that threw an uncaught
 * `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`,
 * which aborted the rest of the handler. In the fly-through controls that left
 * the movement loop armed on a key whose `keyup` never cleared it, so panning
 * kept running until the next matching keypress.
 *
 * `event.target` is likewise `null` for an event dispatched at no node, and is
 * not necessarily an `HTMLElement` (an `SVGElement`, `document` or `window`
 * has no `tagName`/`isContentEditable`), so the "is the user typing?" guard
 * every key handler opens with needs the same treatment.
 */

/**
 * The event's `key`, lower-cased — or `null` when the browser omitted it.
 *
 * Callers should treat `null` as "no identifiable key" and skip the event:
 * every comparison against a concrete key would be false anyway.
 */
export function eventKey(e: KeyboardEvent): string | null {
  // Read through an untyped view: the DOM lib promises a string, the browser
  // does not.
  const key = (e as { key?: unknown }).key;
  return typeof key === 'string' ? key.toLowerCase() : null;
}

/**
 * Keys the Walk tool's movement loop owns (see `useKeyboardControls`). While
 * `activeTool === 'walk'`, global single-key shortcuts must not also fire on
 * them — A would otherwise "Show all" and D toggle the presentation dock.
 */
export const WALK_MOVEMENT_KEYS: ReadonlySet<string> = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'w', 's', 'a', 'd',
]);

/** ARIA roles whose widgets consume plain keys (type-ahead, arrows, values). */
const INPUT_ROLE_SELECTOR =
  '[role=combobox],[role=listbox],[role=slider],[role=menu],[role=menuitem],.cm-editor';

/**
 * True when `target` is a surface that consumes plain key presses — a
 * text-entry element (`<input>`, `<textarea>`, a `contenteditable` host), a
 * native `<select>` (type-ahead), or an element inside an ARIA combobox,
 * listbox, slider or menu — so single-key shortcuts must not fire.
 *
 * Returns `false` for a missing or non-HTML target rather than throwing.
 */
export function isTextEntryElement(target: unknown): boolean {
  const el = target as (Partial<HTMLElement> | null | undefined);
  if (!el) return false;
  if (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  ) {
    return true;
  }
  return typeof el.closest === 'function' && el.closest(INPUT_ROLE_SELECTOR) !== null;
}

/**
 * True when `target` edits text itself (`<input>`, `<textarea>`, a native
 * `<select>`, a `contenteditable` host, a CodeMirror editor), so Ctrl+Z there
 * is the browser's text undo. An ARIA combobox or menu BUTTON is not one:
 * after a pick it keeps focus, and Ctrl+Z must still undo the model edit the
 * pick made (#6232 M2.5).
 */
export function isTextEditingElement(target: unknown): boolean {
  const el = target as (Partial<HTMLElement> | null | undefined);
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true) return true;
  return typeof el.closest === 'function' && el.closest('.cm-editor') !== null;
}

/** {@link isTextEntryElement} for a key event's target. */
export function isTextEntryTarget(e: Event): boolean {
  return isTextEntryElement(e.target);
}

/**
 * Whether a modified keypress types a character (so a text field must get it,
 * not a shortcut): Option+S on a Mac types ß and Option+E starts an accent,
 * and AltGr on a Windows layout reports as Ctrl+Alt with the
 * character it types as `key`. Alt+S that types nothing (a Windows layout
 * without AltGr, where `key` is still `s`) is not text. A plain keypress is
 * not "modified": it is the field's own typing, and callers decide on that.
 */
export function producesText(e: KeyboardEvent): boolean {
  const key = (e as { key?: unknown }).key;
  if (typeof key !== 'string' || e.metaKey) return false;
  if (e.ctrlKey && e.altKey) return key.length === 1;
  if (!e.altKey || e.ctrlKey) return false;
  if (key === 'Dead') return true;
  if (key.length !== 1) return false;
  // Option+letter / digit types a glyph other than the key's own; any other key: a non-ASCII glyph.
  const code = typeof e.code === 'string' ? e.code : '';
  const base = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : /^Digit[0-9]$/.test(code) ? code.slice(5) : null;
  return base !== null ? key.toLowerCase() !== base : key.charCodeAt(0) > 127;
}
