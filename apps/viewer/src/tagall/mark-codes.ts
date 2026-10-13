/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The short code a door or window carries on a plan: the model's own mark when
 * it is short (`labels/label-extras.ts`: up to MAX_MARK_LENGTH characters, not an
 * identifier), else a code for its kind of door or window, `W1`, `W2`, `D1`.
 * Doors and windows of one kind (the same defining type and width, or lacking a
 * type, the same name without its running number and the same width) share a code.
 * Kinds are numbered in the order of their keys, so the same model gives the
 * same codes; a code already given (`known`, from the labels the project holds)
 * is kept, and new kinds are numbered after the highest in use. Pure.
 */

import { MAX_MARK_LENGTH } from '@/labels/label-extras';

export interface MarkSubject {
  guid: string;
  /** The IFC class as declared. */
  className: string;
  /** The model's mark (its Tag unless that is only a unique id). */
  mark: string;
  /** The defining type's name, or ''. */
  typeName: string;
  name: string;
  /** The opening's width in the plan, metres. */
  width: number;
}

export interface MarkCode {
  code: string;
  /** The kind the code stands for; null where the code is the model's own mark. */
  key: string | null;
}

const letterOf = (className: string): 'D' | 'W' => (/^ifcdoor/i.test(className) ? 'D' : 'W');

/** The kind of a door or window: letter, type (or name without its running number) and width to the centimetre. */
export function kindKey(s: MarkSubject): string {
  const type = s.typeName.trim() || s.name.trim().replace(/[\s_-]*\d+$/, '');
  return `${letterOf(s.className)}|${type}|${Math.round(s.width * 100)}`;
}

export const hasOwnMark = (mark: string): boolean => mark.trim() !== '' && mark.trim().length <= MAX_MARK_LENGTH;

/** `known`: kind key to the code a kind already has. `reserved`: marks that stand for something else (a catalogue type's, another element's own) and are not given to a kind. */
export function assignMarkCodes(subjects: readonly MarkSubject[], known: ReadonlyMap<string, string> = new Map(), reserved: Iterable<string> = []): Map<string, MarkCode> {
  const out = new Map<string, MarkCode>();
  const used = new Set<string>([...known.values(), ...reserved]);
  const kinds = new Map<string, string>(known);
  const keys = new Set<string>();
  for (const s of subjects) {
    if (hasOwnMark(s.mark)) { out.set(s.guid, { code: s.mark.trim(), key: null }); used.add(s.mark.trim()); } else keys.add(kindKey(s));
  }
  const next = { D: 0, W: 0 };
  for (const code of used) {
    const m = /^([DW])(\d+)$/.exec(code);
    if (m) next[m[1] as 'D' | 'W'] = Math.max(next[m[1] as 'D' | 'W'], Number(m[2]));
  }
  for (const key of [...keys].filter((k) => !kinds.has(k)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const letter = key[0] as 'D' | 'W';
    let code: string;
    do code = `${letter}${++next[letter]}`; while (used.has(code));
    used.add(code);
    kinds.set(key, code);
  }
  for (const s of subjects) if (!out.has(s.guid)) out.set(s.guid, { code: kinds.get(kindKey(s))!, key: kindKey(s) });
  return out;
}
