/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheet numbering: the scheme a project numbers its sheets by, and the pure
 * functions that apply it. Pure: sheets and a scheme in, numbers out.
 *
 * A number is `<discipline><prefix><separator><n>`, `n` zero-padded to
 * `digits`, running from the group's `start` by `step`. Today's numbers
 * (A-001 general sheets such as the site plan, A-101 plans, A-201 elevations, A-301 sections, A-401 interior elevations, A-501 details, A-601 schedules, A-901
 * the rest) are `DEFAULT_SCHEME`.
 *
 * The sheet's number is its one stored copy. Everything else that names a
 * sheet by number (title block, drawing list, file names, findings, detail
 * marks) reads it from the sheet, so a renumbering changes the sheet and
 * nothing else needs editing.
 */

import type { GroupPattern, NumberGroup, NumberingScheme, ProjectSheet } from './types';

export const NUMBER_GROUPS: readonly NumberGroup[] = ['general', 'plans', 'elevations', 'sections', 'interiors', 'details', 'schedules', 'other'];

const pattern = (start: number): GroupPattern => ({ prefix: '', separator: '-', start, digits: 3, step: 1 });

/** A-001 general sheets (the site plan; the drawing register takes A-000 before them), A-101 plans, A-201 elevations, A-301 sections, A-401 interior elevations, A-501 details, A-601 schedules, A-901 the rest. */
export const DEFAULT_SCHEME: NumberingScheme = {
  discipline: 'A',
  continuous: false,
  groups: { general: pattern(1), plans: pattern(101), elevations: pattern(201), sections: pattern(301), interiors: pattern(401), details: pattern(501), schedules: pattern(601), other: pattern(901) },
};

/** A01, A02, A03… through the whole set, in set order. */
export const SEQUENTIAL_SCHEME: NumberingScheme = {
  discipline: 'A',
  continuous: true,
  groups: Object.fromEntries(NUMBER_GROUPS.map((g) => [g, { prefix: '', separator: '', start: 1, digits: 2, step: 1 }])) as Record<NumberGroup, GroupPattern>,
};

export const SCHEME_PRESETS = { default: DEFAULT_SCHEME, sequential: SEQUENTIAL_SCHEME } as const;

/** `n` written by `p` under `discipline`. */
export function formatNumber(discipline: string, p: GroupPattern, n: number): string {
  return `${discipline}${p.prefix}${p.separator}${String(n).padStart(p.digits, '0')}`;
}

/** The ordinal-th number (0 is the first) of a group; a continuous scheme numbers every group by the plans pattern. */
export function numberAt(scheme: NumberingScheme, group: NumberGroup, ordinal: number): string {
  const p = scheme.groups[scheme.continuous ? 'plans' : group];
  return formatNumber(scheme.discipline, p, p.start + ordinal * p.step);
}

/** Sheets from files before groups were stored: the series is read back from the number (A-0xx general, A-1xx plans, A-2xx elevations, A-3xx sections, A-4xx interior elevations, A-5xx details, A-6xx schedules). */
function legacyGroup(number: string): NumberGroup {
  const m = /^A-(\d)\d\d$/.exec(number);
  return m ? ({ '0': 'general', '1': 'plans', '2': 'elevations', '3': 'sections', '4': 'interiors', '5': 'details', '6': 'schedules' } as Record<string, NumberGroup>)[m[1]] ?? 'other' : 'other';
}

/** The group a sheet is numbered in: the one it was made in, else the one its number reads as. */
export function numberGroupOf(sheet: Pick<ProjectSheet, 'number' | 'series'>): NumberGroup {
  return sheet.series ?? legacyGroup(sheet.number);
}

const key = (number: string): string => number.trim().toLowerCase();

/** The first number of the group's run that no sheet has; the new sheet's number. */
export function nextNumber(sheets: readonly Pick<ProjectSheet, 'number'>[], group: NumberGroup, scheme: NumberingScheme = DEFAULT_SCHEME): string {
  const taken = new Set(sheets.map((s) => key(s.number)));
  for (let i = 0; ; i++) {
    const number = numberAt(scheme, group, i);
    if (!taken.has(key(number))) return number;
  }
}

export type OverrideMode = 'keep' | 'renumber';

type Numbered = Pick<ProjectSheet, 'id' | 'number' | 'series' | 'numberOverride'>;

/**
 * The number of every sheet under `scheme`, in the order given (the set's).
 * A group's sheets take its run in turn; a sheet whose number was typed by
 * hand keeps it when `overrides` is `keep`, and the run skips that number so
 * two sheets never share one. Sheet id to number.
 */
export function numberSheets(sheets: readonly Numbered[], scheme: NumberingScheme, overrides: OverrideMode = 'keep'): Map<string, string> {
  const out = new Map<string, string>();
  const kept = (s: Numbered): boolean => overrides === 'keep' && s.numberOverride === true;
  const taken = new Set(sheets.filter(kept).map((s) => key(s.number)));
  const ordinal = new Map<string, number>();
  for (const sheet of sheets) {
    if (kept(sheet)) {
      out.set(sheet.id, sheet.number);
      continue;
    }
    const group = numberGroupOf(sheet);
    const run = scheme.continuous ? 'all' : group;
    let number: string;
    do {
      const i = ordinal.get(run) ?? 0;
      ordinal.set(run, i + 1);
      number = numberAt(scheme, group, i);
    } while (taken.has(key(number)));
    taken.add(key(number));
    out.set(sheet.id, number);
  }
  return out;
}

export interface RenumberRow {
  id: string;
  from: string;
  to: string;
  /** Typed by hand and left as it is. */
  kept: boolean;
}

/** The old to new table a renumbering would apply, in set order. */
export function planRenumber(sheets: readonly Numbered[], scheme: NumberingScheme, overrides: OverrideMode = 'keep'): RenumberRow[] {
  const numbers = numberSheets(sheets, scheme, overrides);
  return sheets.map((s) => ({ id: s.id, from: s.number, to: numbers.get(s.id) ?? s.number, kept: overrides === 'keep' && s.numberOverride === true }));
}

/** `sheets` renumbered as `rows` say; each takes the series it is numbered in, which a number can no longer tell. Same array when nothing changes. */
export function renumbered<T extends Numbered>(sheets: readonly T[], rows: readonly RenumberRow[], overrides: OverrideMode): T[] {
  const to = new Map(rows.map((r) => [r.id, r.to]));
  return sheets.map((s) => {
    const { numberOverride: _typed, ...rest } = s;
    return { ...(overrides === 'renumber' ? rest : s), number: to.get(s.id) ?? s.number, series: numberGroupOf(s) } as T;
  });
}

// ---- reading a saved scheme ----

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v.slice(0, 8) : fallback);
const whole = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;

/** A scheme from a project file; a field that is missing or out of range takes today's value. `undefined` when there is none. */
export function readNumberingScheme(raw: unknown): NumberingScheme | undefined {
  if (!isObject(raw)) return undefined;
  const groups = isObject(raw.groups) ? raw.groups : {};
  return {
    discipline: text(raw.discipline, DEFAULT_SCHEME.discipline),
    continuous: raw.continuous === true,
    groups: Object.fromEntries(NUMBER_GROUPS.map((g) => {
      const d = DEFAULT_SCHEME.groups[g];
      const p = isObject(groups[g]) ? groups[g] : {};
      return [g, { prefix: text(p.prefix, d.prefix), separator: text(p.separator, d.separator), start: whole(p.start, d.start, 0, 999999), digits: whole(p.digits, d.digits, 1, 8), step: whole(p.step, d.step, 1, 1000) }];
    })) as Record<NumberGroup, GroupPattern>,
  };
}
