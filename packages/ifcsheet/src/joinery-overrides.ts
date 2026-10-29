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

/** The built-in rows whose text can be typed over: the ones read from the model per type. The counts and the sizes are measured, not typed. */
export const OVERRIDABLE_ROWS = ['name', 'operation', 'sill', 'u', 'fire'] as const;
export type OverridableRow = (typeof OVERRIDABLE_ROWS)[number];
/** Whether the text of the row can be typed over: the rows read from the model per type, and the properties and quantities the schedule lists (`ModelRow`). */
export const isOverridableRow = (row: string): boolean => (OVERRIDABLE_ROWS as readonly string[]).includes(row) || isModelRowId(row);

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

/** The part of a schedule entry that names its type. */
export interface TypeFacts { key: string; typeGlobalId?: string }

/** The identity an override is saved under: the IfcTypeObject's GlobalId when the type has one, else the entry's key. */
export const typeIdentityOf = (e: TypeFacts): string => e.typeGlobalId ?? e.key;

const isOf = (o: JoineryCellOverride, e: TypeFacts): boolean => o.type === e.key || (e.typeGlobalId !== undefined && o.type === e.typeGlobalId);

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

/** The override of the type's cell in `row`, if any; one saved under the IfcTypeObject's GlobalId wins over one saved under the entry key. */
export function joineryOverrideOf(overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string): JoineryCellOverride | undefined {
  const mine = (overrides ?? []).filter((o) => o.row === row && isOf(o, entry));
  return mine.find((o) => o.type === entry.typeGlobalId) ?? mine[0];
}

/** What the cell of `entry` in `row` prints: the typed text, else `model`. The one rule the sheet, the exports and a headless read share. */
export const joineryCellText = (overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string, model: string): string => joineryOverrideOf(overrides, entry, row)?.value ?? model;

/** `overrides` with the cell set; `about` names the type. An override under the other identity of the same type is replaced. A project full of overrides takes no new cell. */
export function setJoineryOverride(overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string, value: string, about: string): JoineryCellOverride[] {
  if (!isOverridableRow(row)) return [...(overrides ?? [])];
  const rest = clearJoineryOverride(overrides, entry, row);
  if (rest.length >= MAX_JOINERY_OVERRIDES) return rest;
  return [...rest, { type: typeIdentityOf(entry), row, value: cleanText(value, MAX_VALUE), about: cleanText(about, MAX_ABOUT) }];
}

/** `overrides` without the type's cell in `row`: "Reset to model value". */
export const clearJoineryOverride = (overrides: readonly JoineryCellOverride[] | undefined, entry: TypeFacts, row: string): JoineryCellOverride[] => (overrides ?? []).filter((o) => !(o.row === row && isOf(o, entry)));

/** `overrides` without those of the types in `types` (the identities `orphanedJoineryOverrides` lists). */
export const dropJoineryOverrides = (overrides: readonly JoineryCellOverride[] | undefined, types: readonly string[]): JoineryCellOverride[] => (overrides ?? []).filter((o) => !types.includes(o.type));

/** The overrides whose type none of `entries` (every type the model and the catalogue list now) names, each type once: what "What is missing" lists. */
export function orphanedJoineryOverrides(overrides: readonly JoineryCellOverride[] | undefined, entries: readonly TypeFacts[]): { type: string; about: string; count: number }[] {
  const out = new Map<string, { type: string; about: string; count: number }>();
  for (const o of overrides ?? []) {
    if (entries.some((e) => isOf(o, e))) continue;
    const found = out.get(o.type);
    if (found) { found.count++; if (!found.about) found.about = o.about; } else out.set(o.type, { type: o.type, about: o.about, count: 1 });
  }
  return [...out.values()];
}
