/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A cell of a joinery schedule whose text the user typed over the model's (#446). A joinery schedule has one column per TYPE, so an
 * override is keyed by the type's identity and the row's id, never by place: it follows its type when the types are sorted, split into
 * sub-reports or renumbered, and it applies to that type's cell in every joinery schedule of the project (they are the project's, like the
 * catalogue they are read from).
 *
 * The identity of a type is the GlobalId of its IfcTypeObject when the model has one (`ScheduleEntry.typeGlobalId`), else the schedule
 * entry's own key: the catalogue id of a type that is only configured, or `untyped:<kind>:<size>` for elements the model gives no type.
 * A cell is found by either, so an override typed while the type had no IfcTypeObject still finds it once the model gains one.
 *
 * The size in an `untyped:` key is measured when the IFC states none (#485), and a measurement moves: re-tessellation and the rounding to the
 * millimetre turn 1200 into 1201. So a saved `untyped:` key also reaches the groups whose MEASURED sides are within `MEASURED_TOLERANCE_MM`
 * of its own and whose stated sides are equal (`keyDistance`). Two live groups can be within reach of one saved key (1200 and 1203), so each
 * saved cell belongs to ONE group, the nearest of all the live groups (`ownersOf`), and a group reads, sets and resets only the cells that
 * belong to it: typing on one group never shows on, overwrites or deletes the cell of its neighbour. A side that moved further is a real
 * change of the model, and the override is reported as orphaned. The key is never the typed size: the size is a cell that can be typed over
 * like any other.
 *
 * The overrides are part of the project (`joineryOverrides`). The data of a schedule carries them (`ScheduleData.overrides`, put there by
 * `scheduleOf`), and `joineryCellText` is the one step that says what a cell prints, so the sheet, the CSV, the XLSX and a headless read of
 * the saved project print the same text.
 */

import { isModelRowId } from './joinery-model-rows.js';
import { cleanText } from './schedule-text.js';

/** The most overrides a project keeps; a damaged file cannot grow the project without bound. */
export const MAX_JOINERY_OVERRIDES = 2000;
const MAX_VALUE = 200;
const MAX_ABOUT = 120;
/** A model row's id (`source:set:name`) is the longest row id: `property:` or `quantity:` and a set name and a property name of up to 120 characters each. */
const MAX_ROW_ID = 260;

/**
 * The rows whose text can be typed over: every row of the schedule (#485). The ones read from the model per type (name, operation, sill, U value,
 * fire rating), the measured ones (the size, the total and the count of each level, `levelRowId`), which a person fixes as a last resort when the
 * model, or the measuring of it, has it wrong, and the properties and quantities the schedule lists (`ModelRow`).
 */
export const OVERRIDABLE_ROWS = ['name', 'size', 'operation', 'sill', 'u', 'fire', 'total'] as const;
export type OverridableRow = (typeof OVERRIDABLE_ROWS)[number];
const LEVEL_PREFIX = 'levels:';
/** The id of the count row of the level `level`, which a type's cell is typed over by. */
export const levelRowId = (level: string): string => `${LEVEL_PREFIX}${level}`;
export const isOverridableRow = (row: string): boolean => (OVERRIDABLE_ROWS as readonly string[]).includes(row) || (row.startsWith(LEVEL_PREFIX) && row.length > LEVEL_PREFIX.length) || isModelRowId(row);

/**
 * One typed number. A separator followed by exactly three digits, after one to three digits that do not start with 0, is a thousands separator
 * (`1,250` and `1.250` are 1250, as are `1 250` and `1,250,000` read as a million); any other single `,` or `.` is the decimal mark (`1,25` and
 * `1.5` are 1.25 and 1.5, `0,250` is 0.25). Both marks in one number: the last is the decimal mark. Not a number: NaN.
 */
function typedNumber(text: string): number {
  const p = text.trim().replace(/\s/g, '');
  if (!/^-?\d[\d.,]*$/.test(p)) return NaN;
  const marks = p.match(/[.,]/g) ?? [];
  if (marks.length === 0) return Number(p);
  const grouped = (s: string): boolean => /^-?[1-9]\d{0,2}([.,]\d{3})*$/.test(s);
  const last = Math.max(p.lastIndexOf(','), p.lastIndexOf('.'));
  const whole = p.slice(0, last), fraction = p.slice(last + 1);
  if (new Set(marks).size > 1) return grouped(whole) && /^\d+$/.test(fraction) ? Number(`${whole.replace(/[.,]/g, '')}.${fraction}`) : NaN;
  if (marks.length > 1) return grouped(p) ? Number(p.replace(/[.,]/g, '')) : NaN;
  if (fraction.length === 3 && grouped(p)) return Number(p.replace(/[.,]/g, ''));
  return /^\d+$/.test(fraction) ? Number(`${whole}.${fraction}`) : NaN;
}

/** The numbers a typed cell holds, for the CSV and the XLSX: `1200 × 1500` is two, `3` one; text that is not a number is none. */
export function overrideNumbers(value: string): number[] {
  const nums = value.split(/[×x*]/).map(typedNumber);
  return nums.length > 0 && nums.every((n) => Number.isFinite(n)) ? nums : [];
}

export interface JoineryCellOverride {
  /** The type's identity (`typeIdentityOf`): the GlobalId of its IfcTypeObject, else its entry key. */
  type: string;
  /** The row's id (`OverridableRow`). */
  row: string;
  /** What the cell prints instead of the model's text. Empty: the cell prints blank. */
  value: string;
  /** What the type was called when the value was typed ("W1 Window 1200×1500"), for when it is gone from the model. */
  about: string;
}

/** The part of a schedule entry that names its type; `measuredWidth` / `measuredHeight`: that side of the key was measured, so it may move (#485). */
export interface TypeFacts { key: string; typeGlobalId?: string; measuredWidth?: boolean; measuredHeight?: boolean }

/** The identity an override is saved under: the IfcTypeObject's GlobalId when the type has one, else the entry's key. */
export const typeIdentityOf = (e: TypeFacts): string => e.typeGlobalId ?? e.key;

/**
 * How far a measured side may have moved, in millimetres, and still be the same group: re-tessellation and the rounding to the millimetre
 * move it by 1 mm; a door or window that really changed size changes by tens of millimetres.
 */
const MEASURED_TOLERANCE_MM = 5;
const UNTYPED_SIZE = /^untyped:([a-z]+):(\d+)×(\d+)$/;
/** A group whose size is not read yet: no geometry loaded, or none to measure (`?`, or a side of 0). */
const UNREAD_SIZE = /^untyped:([a-z]+):(\?|0×\d+|\d+×0)$/;

/**
 * How far the saved identity `type` is from the entry: 0 for its GlobalId or its key, else the larger move in mm of a measured side within
 * tolerance (stated sides equal), else Infinity. A key saved before sizes were measured, `untyped:<kind>:?`, named every group of that kind
 * with a side the IFC does not state, so it finds each of them, after any nearer key.
 */
function keyDistance(type: string, e: TypeFacts): number {
  if (type === e.key || (e.typeGlobalId !== undefined && type === e.typeGlobalId)) return 0;
  if (type.endsWith(':?') && e.key.startsWith(type.slice(0, -1)) && (e.measuredWidth || e.measuredHeight)) return MEASURED_TOLERANCE_MM + 1;
  const saved = UNTYPED_SIZE.exec(type), live = UNTYPED_SIZE.exec(e.key);
  if (!saved || !live || saved[1] !== live[1]) return Infinity;
  const dw = Math.abs(Number(saved[2]) - Number(live[2])), dh = Math.abs(Number(saved[3]) - Number(live[3]));
  const same = (d: number, measured: boolean | undefined): boolean => d === 0 || (measured === true && d <= MEASURED_TOLERANCE_MM);
  return same(dw, e.measuredWidth) && same(dh, e.measuredHeight) ? Math.max(dw, dh) : Infinity;
}

const isOf = (o: JoineryCellOverride, e: TypeFacts): boolean => keyDistance(o.type, e) !== Infinity;

/** A key saved before sizes were measured (`untyped:<kind>:?`): it named every group of its kind, so it belongs to each group it reaches. */
const isUnsizedKey = (type: string): boolean => /^untyped:[a-z]+:\?$/.test(type);
const sameGroup = (a: TypeFacts, b: TypeFacts): boolean => a.key === b.key;
/** `groups` with `entry` in its own group's place, or added: the entry asked about is always live, with the facts it states. */
const liveWith = (groups: readonly TypeFacts[], entry: TypeFacts): readonly TypeFacts[] =>
  (groups.some((g) => sameGroup(g, entry)) ? groups.map((g) => (sameGroup(g, entry) ? entry : g)) : [...groups, entry]);

/**
 * The live groups the saved cell `o` belongs to: the one group of `groups` nearest to its key (`keyDistance`), a tie going to the group whose
 * IfcTypeObject GlobalId is the key, then to the group whose own key it is, then to the first by GlobalId and key so the choice never depends
 * on the order of the groups. None when no group is within reach (the cell is orphaned). An `untyped:<kind>:?` key belongs to every group it reaches.
 */
function ownersOf(o: JoineryCellOverride, groups: readonly TypeFacts[]): TypeFacts[] {
  if (isUnsizedKey(o.type)) return groups.filter((g) => isOf(o, g));
  let best: TypeFacts | undefined, bestDistance = Infinity;
  for (const g of groups) {
    const d = keyDistance(o.type, g);
    if (d === Infinity) continue;
    if (!best || d < bestDistance || (d === bestDistance && beats(o.type, g, best))) { best = g; bestDistance = d; }
  }
  return best ? [best] : [];
}

/** Of two groups as near to the saved key `type`, `a` wins over `b`: its GlobalId is the key, else its key is, else it sorts first. */
function beats(type: string, a: TypeFacts, b: TypeFacts): boolean {
  const rank = (g: TypeFacts): number => (g.typeGlobalId === type ? 0 : g.key === type ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) < rank(b);
  const ga = a.typeGlobalId ?? '', gb = b.typeGlobalId ?? '';
  return ga !== gb ? ga < gb : a.key < b.key;
}

/** The saved cells of `row` that belong to `entry` among the live `groups`. */
const cellsOf = (overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string, groups: readonly TypeFacts[]): JoineryCellOverride[] => {
  const live = liveWith(groups, entry);
  return (overrides ?? []).filter((o) => o.row === row && ownersOf(o, live).some((g) => sameGroup(g, entry)));
};

/** The overrides as saved, read back: a damaged one or one of a row that cannot be typed over is dropped, a repeat of the same cell keeps the last, and none is `undefined`. */
export function readJoineryOverrides(raw: unknown): JoineryCellOverride[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const byCell = new Map<string, JoineryCellOverride>();
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    const type = cleanText(o.type, 200), row = cleanText(o.row, MAX_ROW_ID);
    if (!type || !isOverridableRow(row) || typeof o.value !== 'string') continue;
    const cell = `${type}\u0000${row}`;
    if (!byCell.has(cell) && byCell.size >= MAX_JOINERY_OVERRIDES) continue;
    byCell.set(cell, { type, row, value: cleanText(o.value, MAX_VALUE), about: cleanText(o.about, MAX_ABOUT) });
  }
  return byCell.size ? [...byCell.values()] : undefined;
}

/**
 * The override of the type's cell in `row`, if any. `groups`: every live group of the schedule's kind (the whole schedule, not one part of a
 * split), so a saved cell nearer to another group is that group's (`ownersOf`). Of the cells that belong to `entry`, one saved under the
 * IfcTypeObject's GlobalId wins over one saved under the entry key, which wins over the nearest measured size.
 */
export function joineryOverrideOf(overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string, groups: readonly TypeFacts[]): JoineryCellOverride | undefined {
  const mine = cellsOf(overrides, entry, row, groups);
  return mine.find((o) => o.type === entry.typeGlobalId) ?? mine.reduce<JoineryCellOverride | undefined>((best, o) => (!best || keyDistance(o.type, entry) < keyDistance(best.type, entry) ? o : best), undefined);
}

/** What the cell of `entry` in `row` prints: the typed text, else `model` (`groups` as for `joineryOverrideOf`). The one rule the sheet, the exports and a headless read share. */
export const joineryCellText = (overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string, model: string, groups: readonly TypeFacts[]): string =>
  joineryOverrideOf(overrides, entry, row, groups)?.value ?? model;

/**
 * `overrides` with the cell set; `about` names the type; `groups` as for `joineryOverrideOf`. An override of the same type under its other
 * identity is replaced; a cell that belongs to another group is kept. A project full of overrides takes no new cell.
 */
export function setJoineryOverride(overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string, value: string, about: string, groups: readonly TypeFacts[]): JoineryCellOverride[] {
  if (!isOverridableRow(row)) return [...(overrides ?? [])];
  const rest = clearJoineryOverride(overrides, entry, row, groups);
  if (rest.length >= MAX_JOINERY_OVERRIDES) return rest;
  return [...rest, { type: typeIdentityOf(entry), row, value: cleanText(value, MAX_VALUE), about: cleanText(about, MAX_ABOUT) }];
}

/**
 * `overrides` without the type's cell in `row`: "Reset to model value" (`groups` as for `joineryOverrideOf`). Only the cells that belong to
 * `entry` go; a cell that belongs to another group stays. An `untyped:<kind>:?` cell that other groups still read is kept for them, saved
 * under each one's own key.
 */
export function clearJoineryOverride(overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string, groups: readonly TypeFacts[]): JoineryCellOverride[] {
  const live = liveWith(groups, entry);
  return (overrides ?? []).flatMap((o) => {
    if (o.row !== row) return [o];
    const owners = ownersOf(o, live);
    if (!owners.some((g) => sameGroup(g, entry))) return [o];
    return owners.filter((g) => !sameGroup(g, entry) && joineryOverrideOf(overrides, g, row, live) === o).map((g) => ({ ...o, type: typeIdentityOf(g) }));
  });
}

/** `overrides` without those of the types in `types` (the identities `orphanedJoineryOverrides` lists). */
export const dropJoineryOverrides = (overrides: readonly JoineryCellOverride[] | undefined, types: readonly string[]): JoineryCellOverride[] => (overrides ?? []).filter((o) => !types.includes(o.type));

/** The overrides whose type none of `entries` (every type the model and the catalogue list now) names, each type once: what "What is missing" lists. */
export function orphanedJoineryOverrides(overrides: readonly JoineryCellOverride[] | undefined, entries: readonly TypeFacts[]): { type: string; about: string; count: number }[] {
  const out = new Map<string, { type: string; about: string; count: number }>();
  // A group of doors or windows with no stated size is keyed by its measured size (`untyped:<kind>:<w>×<h>`), which is unread before the geometry has loaded
  // and in a run without geometry: a typed cell of a group of that kind is not missing then, it is not matched yet, so it is neither reported nor offered for deletion.
  const unread = new Set(entries.map((e) => UNREAD_SIZE.exec(e.key)?.[1]).filter((k) => k !== undefined));
  for (const o of overrides ?? []) {
    if (entries.some((e) => isOf(o, e))) continue;
    const kind = /^untyped:([a-z]+):/.exec(o.type)?.[1];
    if (kind !== undefined && unread.has(kind)) continue;
    const found = out.get(o.type);
    if (found) { found.count++; if (!found.about) found.about = o.about; } else out.set(o.type, { type: o.type, about: o.about, count: 1 });
  }
  return [...out.values()];
}
