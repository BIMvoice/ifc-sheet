/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The builder's draft of a list schedule (#78): what the dialog edits, and how it becomes the definition the project saves
 * (`ListScheduleDef`) and back. Pure, so the dialog and its tests read the same rule.
 */

import { readListScheduleDef, type ListScheduleColumn, type ListScheduleDef, type PropertyTest } from '@bimvoice/ifcsheet';
import type { ListDataProvider } from '@ifc-lite/lists';

export interface ListDraft {
  name: string;
  /** IFC classes kept; none: every element. */
  classes: string[];
  /** Storeys kept; none: all. */
  levels: string[];
  tests: PropertyTest[];
  columns: ListScheduleColumn[];
  groupBy: string[];
  sum: string[];
  totals: boolean;
}

export const emptyDraft = (name: string): ListDraft => ({ name, classes: [], levels: [], tests: [], columns: [], groupBy: [], sum: [], totals: true });

/** The id of a column: its source, set and name, so the same property cannot be added twice. */
export const columnIdOf = (source: ListScheduleColumn['source'], psetName: string | undefined, propertyName: string): string => `${source}:${psetName ?? ''}:${propertyName}`;

/** The draft as the project saves it. */
export function draftToDef(draft: ListDraft): ListScheduleDef {
  const raw = {
    filter: {
      ...(draft.classes.length ? { classes: draft.classes } : {}),
      ...(draft.levels.length ? { levels: draft.levels } : {}),
      ...(draft.tests.length ? { properties: draft.tests } : {}),
    },
    columns: draft.columns, groupBy: draft.groupBy, sum: draft.sum, ...(draft.totals ? {} : { totals: false }),
  };
  // Read back through the engine's reader, so a draft is saved exactly as a file would be loaded.
  return readListScheduleDef(raw);
}

/** A saved definition as a draft. */
export function defToDraft(name: string, def: ListScheduleDef): ListDraft {
  return {
    name, classes: def.filter?.classes ?? [], levels: def.filter?.levels ?? [], tests: def.filter?.properties ?? [],
    columns: def.columns, groupBy: def.groupBy ?? [], sum: def.sum ?? [], totals: def.totals !== false,
  };
}

export interface ModelFacts {
  /** IFC class -> how many elements. */
  classes: Map<string, number>;
  storeys: string[];
  /** Set name -> names, for properties and for quantities; attributes. */
  properties: Map<string, string[]>;
  quantities: Map<string, string[]>;
  attributes: string[];
}

/** What the loaded models offer to pick from: the classes of their elements, their storeys, every attribute, property and quantity. */
export function modelFacts(providers: readonly ListDataProvider[]): ModelFacts {
  const classes = new Map<string, number>();
  const storeys = new Set<string>();
  const merge = (into: Map<string, Set<string>>, from: Map<string, string[]>) => {
    for (const [set, names] of from) { const bucket = into.get(set) ?? new Set<string>(); for (const n of names) bucket.add(n); into.set(set, bucket); }
  };
  const properties = new Map<string, Set<string>>(), quantities = new Map<string, Set<string>>();
  const attributes = new Set<string>();
  for (const provider of providers) {
    for (const id of provider.getAllEntityIds?.() ?? []) {
      const cls = provider.getEntityTypeName(id);
      if (cls) classes.set(cls, (classes.get(cls) ?? 0) + 1);
      const storey = provider.getStoreyName?.(id);
      if (storey) storeys.add(storey);
    }
    const found = provider.discoverAllColumns?.();
    if (found) { for (const a of found.attributes) attributes.add(a); merge(properties, found.properties); merge(quantities, found.quantities); }
  }
  const sorted = (m: Map<string, Set<string>>) => new Map([...m].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()] as const));
  return { classes: new Map([...classes].sort(([a], [b]) => a.localeCompare(b))), storeys: [...storeys].sort(), properties: sorted(properties), quantities: sorted(quantities), attributes: [...attributes] };
}
