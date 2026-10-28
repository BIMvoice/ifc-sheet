/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's own line types: a name and a dash pattern in paper
 * millimetres, drawn dash, gap, dash, gap, ... (a dash of 0 is a dot). A layer
 * or a drafted element names one by id in the field where it would name a
 * built-in type (`continuous`, `dashed`, `dotted`, `dashdot`), and the pattern
 * is found here (`dashFor` in `styles.ts`).
 */

export interface CustomLineType {
  id: string;
  name: string;
  /** Alternating dash and gap lengths, paper millimetres; an even count, gaps above zero. */
  dash: number[];
}

export const MAX_DASH_PARTS = 8;

/** The pattern text a user types ("4 1 0.3 1") as numbers, or null when it is not a usable dash pattern. */
export function parseDashPattern(text: string): number[] | null {
  const parts = text.trim().split(/[\s,;]+/).filter(Boolean).map(Number);
  if (parts.length < 2 || parts.length > MAX_DASH_PARTS || parts.length % 2 !== 0) return null;
  if (!parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return null;
  for (let i = 1; i < parts.length; i += 2) if (!(parts[i] > 0)) return null;
  return parts;
}

export const formatDashPattern = (dash: readonly number[]): string => dash.join(' ');

/** A line type read from a project file; throws on one that is not a line type, so a bad file says so. */
export function readLineType(v: unknown, path: string): CustomLineType {
  const o = v as { id?: unknown; name?: unknown; dash?: unknown } | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || typeof o.name !== 'string') throw new Error(`Not a project file: ${path} must be a line type { id, name, dash }`);
  const dash = Array.isArray(o.dash) ? parseDashPattern(o.dash.join(' ')) : null;
  if (!dash) throw new Error(`Not a project file: ${path}/dash must be an even number of lengths in millimetres, gaps above zero`);
  return { id: o.id, name: o.name, dash };
}
