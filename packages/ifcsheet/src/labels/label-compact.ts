/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room tag cut down to fit a small room, as drawings do for a shaft, a WC or a store: the lines of the room tag type's own
 * template without the room's name (`no-name`: the number and the area), or the number's line alone (`number`). Which lines
 * those are is read from the template's fields, so an office's own room tag type is cut down the same way; a template with
 * no such lines has no compact form. The label keeps following the model: the mode is stamped on it (`LabelExtras.compact`).
 * Pure.
 */

import type { FieldRef, ParsedTemplate, TemplateSegment } from './label-template.js';

export type CompactMode = 'no-name' | 'number';
export const COMPACT_MODES: readonly CompactMode[] = ['no-name', 'number'];
export const asCompactMode = (v: unknown): CompactMode | undefined => (v === 'no-name' || v === 'number' ? v : undefined);

const NAME_FIELDS = new Set(['TagName', 'LongName', 'Name']);
const refsOf = (s: TemplateSegment): FieldRef[] => (s.type === 'field' ? [s.ref, ...(s.alternatives ?? [])] : []);
const names = (line: readonly TemplateSegment[]) => line.some((s) => refsOf(s).some((r) => r.kind === 'attribute' && NAME_FIELDS.has(r.name)));
const numbers = (line: readonly TemplateSegment[]) => line.some((s) => refsOf(s).some((r) => r.kind === 'attribute' && r.name === 'RoomNumber'));

/** The template's lines, each its segments (a text segment split where it breaks the line). */
function linesOf(t: ParsedTemplate): TemplateSegment[][] {
  const lines: TemplateSegment[][] = [[]];
  for (const s of t.segments) {
    if (s.type !== 'text') { lines[lines.length - 1]!.push(s); continue; }
    s.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ type: 'text', text: part });
    });
  }
  return lines;
}

/** The template cut down to `mode`, or null when it has no such form (no number line; nothing left out). */
export function compactTemplate(t: ParsedTemplate, mode: CompactMode): ParsedTemplate | null {
  const lines = linesOf(t);
  if (!lines.some(numbers)) return null;
  const kept = lines.filter((l) => (mode === 'number' ? numbers(l) : !names(l) || numbers(l)));
  if (kept.length === lines.length) return null;
  const segments = kept.flatMap((l, i) => (i === 0 ? l : [{ type: 'text' as const, text: '\n' }, ...l]));
  return { segments, issues: t.issues };
}
