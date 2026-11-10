/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Typing `m2` or `m3` right after a number in a drafted text gives `m²` or `m³` (#674): "25.2 m2", "25,2m2" and "12 m3" convert; "m2" inside a word
 * ("cm2", "a5m2") and "m2" with no number before it (a sheet named "M2", "m2" on its own) stay as typed.
 *
 * `unitAt` is the plain rule. `onTypedText` is what a text field calls from its change handler: it puts the superscript in through the browser's own
 * editing command (`insertText`), so the conversion is one more step of the field's native undo and Ctrl/Cmd+Z right after it brings the plain digit back.
 */

const SUPERSCRIPT: Record<string, string> = { '2': '²', '3': '³' };

/** A number (not the tail of a word), an optional space, then `m` and the digit just typed, ending at the caret. */
const UNIT_AFTER_NUMBER = /(?<![\p{L}\p{N}_])\d+(?:[.,]\d+)?\s?m([23])$/u;

/** Where the digit of an `m2`/`m3` that ends at `caret` is, and the superscript to put in its place; null when it is not a unit. */
export function unitAt(text: string, caret: number): { at: number; char: string } | null {
  const hit = UNIT_AFTER_NUMBER.exec(text.slice(0, caret));
  if (!hit) return null;
  // `m25` and `m2x`: the unit is not finished, or is a word.
  if (/[\p{L}\p{N}]/u.test(text.charAt(caret))) return null;
  return { at: caret - 1, char: SUPERSCRIPT[hit[1]] };
}

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * A text field's change handler: `prev` is the value before this change and `set` takes the value after it. Only typing or pasting converts: a deletion
 * ("25 m2x", Backspace) and an undo or redo hand the field's value on as it is, so undo is never converted again.
 */
export function onTypedText(el: Field, inputType: string | undefined, prev: string, set: (value: string) => void): void {
  const next = el.value;
  const caret = el.selectionStart ?? next.length;
  const typing = next.length > prev.length && !inputType?.startsWith('history') && !inputType?.startsWith('delete');
  const hit = typing ? unitAt(next, caret) : null;
  if (!hit) {
    set(next);
    return;
  }
  const converted = next.slice(0, hit.at) + hit.char + next.slice(hit.at + 1);
  el.setSelectionRange(hit.at, hit.at + 1);
  // The editing command raises its own input event, which reports the converted value (and is not typing a digit, so it converts nothing).
  if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, hit.char) && el.value === converted) return;
  el.setRangeText(hit.char, hit.at, hit.at + 1, 'end');
  set(el.value);
}

/** The `inputType` of a React change event, when the browser gave one. */
export const inputTypeOf = (e: { nativeEvent: Event }): string | undefined => (e.nativeEvent instanceof InputEvent ? e.nativeEvent.inputType : undefined);
