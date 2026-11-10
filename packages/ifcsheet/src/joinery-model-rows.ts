/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Rows of a joinery schedule that are a property or a quantity of the model (#446): "fire rating", "U value" or any set the models carry,
 * chosen from the sheet like a column of a list schedule. A joinery schedule has one column per TYPE, so the row's cell shows what the
 * type's elements say: the value when every element of the type agrees, else the word "varies" (`modelRowText`). An element's value is
 * the Lists engine's own (`executeList`: the element's property, else the one its IfcTypeProduct defines, the model's units applied),
 * so a joinery cell and a list schedule cell for the same property print the same text.
 *
 * The row is named by the list's column key, `source:set:name` (`columnIdOf`), and that key is its id among the schedule's rows, in
 * `rows.order` / `rows.hidden` and in a typed cell (`joineryOverrides`), so a row can be hidden, moved and typed over like a built-in one.
 * The choice is saved on the schedule's content (`properties`); the values are read by `joineryScheduleData` into each occurrence.
 */

import { cleanText } from './schedule-text.js';

/** The most model rows a schedule carries: each is a row of every card, so the table's height is bounded. */
export const MAX_MODEL_ROWS = 12;

export interface ModelRow {
  /** The list's column key, `source:set:name`: also the row's id among the schedule's rows. */
  id: string;
  source: 'property' | 'quantity';
  psetName: string;
  propertyName: string;
}

/** The id of a model row: the same key a list schedule's column has (`columnIdOf`). */
export const modelRowId = (source: ModelRow['source'], psetName: string, propertyName: string): string => `${source}:${psetName}:${propertyName}`;

/** Whether `id` names a model row rather than a built-in or a text row. */
export const isModelRowId = (id: string): boolean => id.startsWith('property:') || id.startsWith('quantity:');

/** The rows as saved, read back: a damaged one is dropped, a repeat keeps the first, the count is bounded, and none is `undefined`. */
export function readModelRows(raw: unknown): ModelRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ModelRow[] = [];
  for (const r of raw) {
    if (out.length >= MAX_MODEL_ROWS || typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    const source = o.source === 'property' || o.source === 'quantity' ? o.source : null;
    const psetName = cleanText(o.psetName, 120), propertyName = cleanText(o.propertyName, 120);
    if (!source || !psetName || !propertyName) continue;
    const id = modelRowId(source, psetName, propertyName);
    if (!out.some((x) => x.id === id)) out.push({ id, source, psetName, propertyName });
  }
  return out.length ? out : undefined;
}

/** Every distinct row of the schedules' contents: what `joineryScheduleData` must read for them all. */
export function modelRowsOf(contents: readonly ({ properties?: readonly ModelRow[] } | undefined)[]): ModelRow[] {
  const byId = new Map<string, ModelRow>();
  for (const c of contents) for (const r of c?.properties ?? []) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()];
}

/** The row's name on the sheet: its property or quantity name, with the set in front where two rows of the schedule share the name. */
export function modelRowLabel(row: ModelRow, all: readonly ModelRow[]): string {
  return all.some((r) => r.id !== row.id && r.propertyName === row.propertyName) ? `${row.psetName}.${row.propertyName}` : row.propertyName;
}

/** The part of a schedule entry a model row is read from. */
export interface ModelRowFacts { occurrences: readonly { modelValues?: Readonly<Record<string, string>>; modelNumbers?: Readonly<Record<string, number>> }[] }

/** What the cell of a type prints for a model row: the value its elements share, a dash when none states one, else `varies` (some differ, or only some state it). */
export function modelRowText(entry: ModelRowFacts, rowId: string, varies = 'varies'): string {
  if (entry.occurrences.length === 0) return '—';
  const values = new Set(entry.occurrences.map((o) => o.modelValues?.[rowId] ?? ''));
  if (values.size > 1) return varies;
  const [only] = values;
  return only || '—';
}

/** The figure the cell of a type holds, for a spreadsheet: the number its elements all state; null when they differ, when one states none, or when the value is text. */
export function modelRowNumber(entry: ModelRowFacts, rowId: string): number | null {
  if (entry.occurrences.length === 0) return null;
  const values = entry.occurrences.map((o) => o.modelNumbers?.[rowId]);
  const [first] = values;
  return typeof first === 'number' && values.every((v) => v === first) ? first : null;
}
