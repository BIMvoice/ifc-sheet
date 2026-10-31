/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one mark of a door or window (#631): what its tag on a plan and its Mark cell in the joinery schedule both print, so an element is
 * found under the same mark in both. In order:
 *  1. the user's typed mark of its type (`joinery-overrides.ts`, row `mark`);
 *  2. the element's own IFC Tag, when it has one a draughtsman wrote (`tagMark`: a Tag that is only the element's unique id is none);
 *  3. the mark the schedule gives its type (D1, W1).
 * Never the element's Name or a class word ("Window"): an element with none of the three has no mark.
 *
 * The app's plan tags (`labels/label-element.ts`, the TAG tool) and the schedule's header, CSV and XLSX all call `elementMark`, so the two
 * cannot drift. A type's elements may carry different Tags (D01, D02 of one door type): the schedule's Mark cell then lists each mark its
 * elements are found under (`markCell`), and its counts are those of the type, unchanged.
 */

import { joineryOverrideOf, type JoineryCellOverride, type TypeFacts } from './joinery-overrides.js';

/** The row id a type's mark is typed over by. */
export const MARK_ROW = 'mark';

/**
 * A Tag a draughtsman would write on a drawing: tools that fill Tag with the element's unique id (a GUID, or an identifier of hex groups joined
 * by hyphens) leave nothing to show. Empty when the Tag is absent, blank or such an id.
 */
export function tagMark(tag: string | null | undefined): string {
  const t = (tag ?? '').trim();
  return /^[0-9A-Fa-f]{6,}(?:-[0-9A-Fa-f]{2,}){3,}$/.test(t) || /^[0-9A-Za-z_$]{22}$/.test(t) && /\d/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t) ? '' : t;
}

export interface MarkInput {
  /** The element's IFC Tag as the model holds it. */
  tag: string | null | undefined;
  /** The mark the schedule gives the element's type; `—` or empty: the type has none. */
  typeMark: string | null | undefined;
  /** The user's typed mark of the type, when there is one: it wins over the rest (an empty one prints blank). */
  override?: string | undefined;
}

/** The mark of one element; empty when it has none. The one rule. */
export function elementMark({ tag, typeMark, override }: MarkInput): string {
  if (override !== undefined) return override;
  const own = tagMark(tag);
  if (own) return own;
  return typeMark && typeMark !== '—' ? typeMark : '';
}

/** The part of a schedule entry the marks are read from. */
export interface MarkedEntry extends TypeFacts {
  mark: string;
  occurrences: readonly { modelId: string; expressId: number; tag: string | null }[];
}

/** The mark of one occurrence of `entry`, under the project's typed marks (`groups`: every live group of the schedule's kind, as for `joineryOverrideOf`). */
export function occurrenceMarkFor(entry: MarkedEntry, occurrence: { tag: string | null }, overrides: readonly JoineryCellOverride[] | undefined, groups: readonly TypeFacts[]): string {
  return elementMark({ tag: occurrence.tag, typeMark: entry.mark, override: joineryOverrideOf(overrides, entry, MARK_ROW, groups)?.value });
}

/** Every mark the elements of `entry` are found under, each once, in the order of its occurrences; the type's mark alone when it has none placed. */
export function entryMarks(entry: MarkedEntry, overrides: readonly JoineryCellOverride[] | undefined, groups: readonly TypeFacts[]): string[] {
  if (entry.occurrences.length === 0) return [elementMark({ tag: null, typeMark: entry.mark, override: joineryOverrideOf(overrides, entry, MARK_ROW, groups)?.value })];
  return [...new Set(entry.occurrences.map((o) => occurrenceMarkFor(entry, o, overrides, groups)).filter((m) => m !== ''))];
}

/** What the Mark cell of `entry` prints: its marks, separated by commas (`D01, D02`); the type's own placeholder (`—`) when its elements have none. */
export const markCell = (entry: MarkedEntry, overrides: readonly JoineryCellOverride[] | undefined, groups: readonly TypeFacts[]): string => entryMarks(entry, overrides, groups).join(', ') || entry.mark;

/** The key of an element in a `markIndex`. */
export const markKey = (modelId: string, expressId: number): string => `${modelId}\u0000${expressId}`;

/** The mark of every element the schedule lists, by `markKey`: what a plan tag reads. Built from the same entries the schedule prints. */
export function markIndex(entries: readonly MarkedEntry[], overrides?: readonly JoineryCellOverride[], groups: readonly TypeFacts[] = entries): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) for (const o of e.occurrences) out.set(markKey(o.modelId, o.expressId), occurrenceMarkFor(e, o, overrides, groups));
  return out;
}
