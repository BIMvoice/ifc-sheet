/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A cell of a list schedule (#78) whose value the user typed over the model's (#446). An override is keyed by the element's GlobalId and
 * the column's property key (`listColumnKey`: its source, set and name), never by the row's place or the column's id, so it follows its
 * element when the model is updated and rows move, and follows its property when columns are added, removed or reordered.
 *
 * The overrides are part of the saved definition (`ListScheduleDef.overrides`), and `withListOverrides` is the one step that prints them: it
 * runs inside `listTableSourceOf`, so the sheet, the CSV, the XLSX and a headless build of the saved project print the same table. A list
 * that is grouped has no element rows, so it takes no overrides.
 */

import type { ListCell, ListScheduleColumn, ListTableSource } from './list-schedule.js';

/** The most overrides a schedule keeps; a damaged file cannot grow the project without bound. */
export const MAX_LIST_OVERRIDES = 2000;
const MAX_VALUE = 200;
const MAX_ABOUT = 120;

export interface ListCellOverride {
  /** The element's GlobalId. */
  guid: string;
  /** The column's property key (`listColumnKey`). */
  key: string;
  /** What the cell prints instead of the model's value. Empty: the cell prints blank. */
  value: string;
  /** What the element was called when the override was typed, for when it is gone from the model. */
  about: string;
}

/** What identifies a column across edits: its source, set and name (the column's `id` is only unique within one definition). */
export const listColumnKey = (c: Pick<ListScheduleColumn, 'source' | 'psetName' | 'propertyName'>): string => `${c.source}:${c.psetName ?? ''}:${c.propertyName}`;

// eslint-disable-next-line no-control-regex
const clean = (raw: unknown, max: number): string => (typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');

/** The overrides as saved, read back: a damaged one is dropped, a repeat of the same cell keeps the last, and none is `undefined`. */
export function readListOverrides(raw: unknown): ListCellOverride[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const byCell = new Map<string, ListCellOverride>();
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    const guid = clean(o.guid, 64), key = clean(o.key, 200);
    if (!guid || !key || typeof o.value !== 'string') continue;
    const cell = `${guid}\u0000${key}`;
    if (!byCell.has(cell) && byCell.size >= MAX_LIST_OVERRIDES) continue;
    byCell.set(cell, { guid, key, value: clean(o.value, MAX_VALUE), about: clean(o.about, MAX_ABOUT) });
  }
  return byCell.size ? [...byCell.values()] : undefined;
}

/** The override of the cell, if any. */
export const overrideOf = (overrides: readonly ListCellOverride[] | undefined, guid: string, key: string): ListCellOverride | undefined => overrides?.find((o) => o.guid === guid && o.key === key);

/** `overrides` with the cell's value set; `about` names the element. A list full of overrides takes no new cell. */
export function setListOverride(overrides: readonly ListCellOverride[] | undefined, guid: string, key: string, value: string, about: string): ListCellOverride[] {
  const next: ListCellOverride = { guid, key, value: clean(value, MAX_VALUE), about: clean(about, MAX_ABOUT) };
  const rest = (overrides ?? []).filter((o) => !(o.guid === guid && o.key === key));
  return rest.length >= MAX_LIST_OVERRIDES ? [...rest] : [...rest, next];
}

/** `overrides` without the cell's: "reset to model value". */
export const clearListOverride = (overrides: readonly ListCellOverride[] | undefined, guid: string, key: string): ListCellOverride[] => (overrides ?? []).filter((o) => !(o.guid === guid && o.key === key));

/** The overrides whose element `exists` no longer says is in the model, each once per element: what "What is missing" lists. */
export function orphanedOverrides(overrides: readonly ListCellOverride[] | undefined, exists: (guid: string) => boolean): { guid: string; about: string; count: number }[] {
  const out = new Map<string, { guid: string; about: string; count: number }>();
  for (const o of overrides ?? []) {
    if (exists(o.guid)) continue;
    const found = out.get(o.guid);
    if (found) { found.count++; if (!found.about) found.about = o.about; } else out.set(o.guid, { guid: o.guid, about: o.about, count: 1 });
  }
  return [...out.values()];
}

/** A typed figure ("12,5", "3.2") as the number a figure column holds; null for anything else, which is text. */
function figureOf(text: string): number | null {
  const t = text.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/**
 * The table source with the overrides printed in. `guids` are the GlobalIds of its rows (`ListScheduleRun.guids`); a source that is not
 * a row per element (grouped, or with no ids) is returned as it is. The result carries `guids` and, per row, the columns whose cell is
 * overridden (`overridden`), which the editor marks and the print leaves out. A figure column takes a typed number as a number, so it is
 * written with the project's decimals like the model's value; anything else is text.
 */
export function withListOverrides(
  source: ListTableSource, def: { columns: readonly ListScheduleColumn[]; groupBy?: readonly string[]; overrides?: readonly ListCellOverride[] },
  guids: readonly string[] | undefined,
): ListTableSource {
  if ((def.groupBy?.length ?? 0) > 0 || !guids || guids.length !== source.rows.length) return source;
  const keyOfColumn = new Map(def.columns.map((c) => [c.id, listColumnKey(c)] as const));
  const keys = source.columns.map((c) => keyOfColumn.get(c.id));
  const byCell = new Map((def.overrides ?? []).map((o) => [`${o.guid}\u0000${o.key}`, o] as const));
  const overridden: number[][] = [];
  const rows = source.rows.map((row, r) => {
    const marks: number[] = [];
    const cells: ListCell[] = row.map((cell, c) => {
      const key = keys[c];
      const o = key === undefined ? undefined : byCell.get(`${guids[r]}\u0000${key}`);
      if (!o) return cell;
      marks.push(c);
      if (o.value === '') return null;
      return source.columns[c].numeric ? (figureOf(o.value) ?? o.value) : o.value;
    });
    overridden.push(marks);
    return marks.length ? cells : row;
  });
  return { ...source, rows, guids, overridden };
}
