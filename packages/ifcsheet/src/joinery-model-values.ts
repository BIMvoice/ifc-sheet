/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the model rows of a joinery schedule (#446, `joinery-model-rows.ts`) from the models: the properties and quantities the schedule's
 * elements and types carry (what the sheet's picker offers), and each element's value for a chosen row. Its own file: it loads the Lists
 * engine, which the pure row definitions do not need. Reached through the `@bimvoice/ifcsheet/project` entry with `joineryScheduleData`.
 */

import { executeList, type ColumnDefinition, type ListDataProvider, type ListDefinition } from '@ifc-lite/lists';
import { ProjectUnits, extractProjectUnits, type IfcDataStore } from '@ifc-lite/parser';
import { displayCell } from './list-export-model.js';
import { listRunOf } from './list-schedule-run.js';
import type { ModelRow } from './joinery-model-rows.js';

/** One model as the reads of model rows see it. */
export interface ModelRowSource {
  modelId: string;
  dataStore: IfcDataStore;
  /** The Lists engine's provider over the model; absent: the headless one. The app hands in its own, which sees the edit overlay. */
  provider: () => ListDataProvider;
}

/** The properties and quantities the elements and their types carry: set name to property names. */
export interface FoundModelRows { properties: Map<string, string[]>; quantities: Map<string, string[]> }

/** The sets and names found on `ids` of one model (the elements, and the types they are defined by), sorted. */
export function discoverModelRows(provider: ListDataProvider, ids: readonly number[]): FoundModelRows {
  const properties = new Map<string, Set<string>>(), quantities = new Map<string, Set<string>>();
  const add = (into: Map<string, Set<string>>, set: string, names: readonly string[]) => {
    if (!set) return;
    const bucket = into.get(set) ?? new Set<string>();
    for (const n of names) if (n) bucket.add(n);
    into.set(set, bucket);
  };
  for (const id of ids) {
    for (const s of [...provider.getPropertySets(id), ...(provider.getTypePropertySets?.(id) ?? [])]) add(properties, s.name, s.properties.map((p) => p.name));
    for (const s of [...provider.getQuantitySets(id), ...(provider.getTypeQuantitySets?.(id) ?? [])]) add(quantities, s.name, s.quantities.map((q) => q.name));
  }
  const sorted = (m: Map<string, Set<string>>) => new Map([...m].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()] as const));
  return { properties: sorted(properties), quantities: sorted(quantities) };
}

/** Merge what several models found. */
export function mergeFound(parts: readonly FoundModelRows[]): FoundModelRows {
  const merge = (pick: (f: FoundModelRows) => Map<string, string[]>) => {
    const into = new Map<string, Set<string>>();
    for (const part of parts) for (const [set, names] of pick(part)) { const b = into.get(set) ?? new Set<string>(); names.forEach((n) => b.add(n)); into.set(set, b); }
    return new Map([...into].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()] as const));
  };
  return { properties: merge((f) => f.properties), quantities: merge((f) => f.quantities) };
}

/**
 * The text of each row for each element, by element id: `ids[i]` of `source` read for `rows`. An element whose type and itself say nothing
 * for a row has no entry for it. Run through the Lists engine and its export model, so the figures carry the model's units as a list prints them.
 */
export function readModelRowValues(source: ModelRowSource, ids: readonly number[], rows: readonly ModelRow[]): Map<number, Record<string, string>> {
  return new Map([...readModelRowCells(source, ids, rows)].map(([id, cells]) => [id, cells.texts]));
}

/** An element's value for each row it states: the text a list prints, and the figure itself where the value is a number (what a spreadsheet needs). */
export interface ModelRowCells { texts: Record<string, string>; numbers: Record<string, number> }

/** `readModelRowValues` with the figures kept as numbers beside their text. */
export function readModelRowCells(source: ModelRowSource, ids: readonly number[], rows: readonly ModelRow[]): Map<number, ModelRowCells> {
  const out = new Map<number, ModelRowCells>();
  if (ids.length === 0 || rows.length === 0) return out;
  const columns: ColumnDefinition[] = rows.map((r) => ({ id: r.id, source: r.source, psetName: r.psetName, propertyName: r.propertyName }));
  const definition: ListDefinition = { id: 'joinery-model-rows', name: '', createdAt: 0, updatedAt: 0, entityTypes: [], groups: [], columns, expressIdsByModel: { [source.modelId]: [...ids] } };
  const result = executeList(definition, source.provider(), source.modelId);
  const store = source.dataStore;
  const units = store.source?.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty();
  const run = listRunOf(definition, result, new Map([[source.modelId, units]]), {});
  result.rows.forEach((row, i) => {
    const cells = run.model.rows[i] ?? [];
    const texts: Record<string, string> = {};
    const numbers: Record<string, number> = {};
    rows.forEach((r, c) => {
      const value = cells[c] ?? null;
      const t = displayCell(value);
      if (t === '') return;
      texts[r.id] = t;
      if (typeof value === 'number' && Number.isFinite(value)) numbers[r.id] = value;
    });
    out.set(row.entityId, { texts, numbers });
  });
  return out;
}

