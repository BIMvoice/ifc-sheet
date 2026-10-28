/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a schedule keeps (#186, section 3): the filter of a sub-report (`SubReport.filter`) and of a whole schedule
 * (`ScheduleContent.filter`). One filter, one rule, applied by `subReportData` (sub-reports.ts) and `applyContent`
 * (schedule-content.ts), so the app, the CLI and the checks cut a schedule the same way.
 *
 * Six independent dimensions. One that is absent does not restrict; one that is present keeps only what it names (an
 * empty list keeps nothing). The first three choose rows (types), the rest choose elements:
 *  - `kinds`, `types`: doors / windows, and the types picked by hand (by entry key);
 *  - `levels`: the elements on these storeys;
 *  - `classes`: the elements of these IFC classes (`IfcDoor`, `IfcWindowStandardCase`);
 *  - `predefined`: the elements with these PredefinedType values (`DOOR`, `NOTDEFINED`);
 *  - `properties`: the elements whose properties pass every test (a Pset property such as `IsExternal`).
 */

import type { SplitData, SplitEntry } from './sub-reports.js';

/** What a property test asks: `equals` and `notEquals` compare with `value`; `present` asks only that the property has a value. */
export const PROPERTY_OPS = ['equals', 'notEquals', 'present'] as const;
export type PropertyOp = (typeof PROPERTY_OPS)[number];

/**
 * One test on a property of the element. `pset` is optional: absent, a property of that name in any set counts.
 * Names compare without regard to case. `equals` is true when some matching property holds `value` (booleans as
 * `true` / `false`, numbers as numbers: `2` equals `2.0`); `notEquals` is its exact negation, so an element without
 * the property passes it; `present` is true when some matching property has a non-empty value.
 */
export interface PropertyTest {
  pset?: string;
  name: string;
  op: PropertyOp;
  /** The value `equals` and `notEquals` compare with, as text. */
  value?: string;
}

/** What a filter keeps. Absent dimension: no restriction. */
export interface SubReportFilter {
  /** Only these kinds of element: doors, windows. */
  kinds?: ('door' | 'window')[];
  /** Only the occurrences on these storeys, by name. */
  levels?: string[];
  /** Only these types, by entry key (the types picked by hand). */
  types?: string[];
  /** Only the occurrences of these IFC classes (`IfcDoor`). */
  classes?: string[];
  /** Only the occurrences with these PredefinedType values (`DOOR`, `NOTDEFINED`; no dots). */
  predefined?: string[];
  /** Only the occurrences whose properties pass all of these tests. An empty list is no test (it is not saved). */
  properties?: PropertyTest[];
}

/** A property of an element, as the schedule reads it: only those the project's filters (and `IsExternal`) name are read. */
export interface PropertyFact { pset: string; name: string; /** The value as text (`true`, `2`, `REI60`). */ value: string }

/** What a filter reads of one element. All optional, so a table that carries none (an older fixture) filters as "unknown". */
export interface OccurrenceFacts {
  level: string;
  /** `IfcDoor`, `IfcWindowStandardCase`. */
  ifcClass?: string;
  /** The PredefinedType as written without dots (`DOOR`); null when the element has none. */
  predefinedType?: string | null;
  properties?: PropertyFact[];
}

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))] : undefined);

/** A property test as saved, read back; null when it has no name or an unknown op. */
export function readPropertyTest(raw: unknown): PropertyTest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const op = PROPERTY_OPS.find((x) => x === o.op);
  if (!op || typeof o.name !== 'string' || !o.name.trim()) return null;
  const out: PropertyTest = { name: o.name.trim(), op };
  if (typeof o.pset === 'string' && o.pset.trim()) out.pset = o.pset.trim();
  if (op !== 'present') out.value = typeof o.value === 'string' ? o.value : '';
  return out;
}

/** A filter as it is saved, read back: unknown fields and wrong types are dropped, so an old or damaged file loads as "no restriction". */
export function readSubReportFilter(raw: unknown): SubReportFilter {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: SubReportFilter = {};
  const kinds = strings(o.kinds)?.filter((k): k is 'door' | 'window' => k === 'door' || k === 'window');
  if (kinds) out.kinds = kinds;
  const levels = strings(o.levels);
  if (levels) out.levels = levels;
  const types = strings(o.types);
  if (types) out.types = types;
  const classes = strings(o.classes);
  if (classes) out.classes = classes;
  const predefined = strings(o.predefined);
  if (predefined) out.predefined = predefined;
  // A damaged test is dropped, not turned into "no test" for the whole list: the rest still restrict.
  if (Array.isArray(o.properties)) {
    const tests = o.properties.map(readPropertyTest).filter((t): t is PropertyTest => t !== null);
    if (tests.length > 0) out.properties = tests;
  }
  return out;
}

/** Whether `filter` restricts nothing. */
export const isOpenFilter = (filter: SubReportFilter | undefined): boolean =>
  !filter || (!filter.kinds && !filter.levels && !filter.types && !filter.classes && !filter.predefined && !filter.properties?.length);

/** Whether `filter` restricts by something read from the elements themselves (not just the storey): it cuts occurrences, so counts follow. */
export const cutsElements = (filter: SubReportFilter): boolean => !!(filter.classes || filter.predefined || filter.properties?.length);

const norm = (s: string): string => s.trim().toLowerCase();

/** Whether two values are equal as the schedule reads them: as numbers when both are, else as text without case. */
function sameValue(a: string, b: string): boolean {
  const x = Number(a), y = Number(b);
  return a.trim() !== '' && b.trim() !== '' && Number.isFinite(x) && Number.isFinite(y) ? x === y : norm(a) === norm(b);
}

/** The text of a property value as the filter compares it: booleans `true` / `false`, numbers as written, the rest as is. */
export function propertyValueText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'value' in v) return propertyValueText((v as { value: unknown }).value);
  return null;
}

/** Whether the element passes one property test. */
export function passesPropertyTest(test: PropertyTest, facts: readonly PropertyFact[] | undefined): boolean {
  const matching = (facts ?? []).filter((f) => norm(f.name) === norm(test.name) && (!test.pset || norm(f.pset) === norm(test.pset)));
  switch (test.op) {
    case 'present': return matching.some((f) => f.value.trim() !== '');
    case 'equals': return matching.some((f) => sameValue(f.value, test.value ?? ''));
    case 'notEquals': return !matching.some((f) => sameValue(f.value, test.value ?? ''));
  }
}

/** Whether one element passes the element dimensions of `filter` (storey, class, predefined type, properties). */
export function passesElementFilter(filter: SubReportFilter, o: OccurrenceFacts): boolean {
  if (filter.levels && !filter.levels.includes(o.level)) return false;
  if (filter.classes && !filter.classes.some((c) => norm(c) === norm(o.ifcClass ?? ''))) return false;
  if (filter.predefined && !filter.predefined.some((p) => norm(p) === norm(o.predefinedType ?? ''))) return false;
  if (filter.properties && !filter.properties.every((t) => passesPropertyTest(t, o.properties))) return false;
  return true;
}

/** The property names the filters of a project read (lower case), so the schedule reads only those from the model. `IsExternal` is always read: the exterior / interior split needs it. */
export function filterPropertyNames(filters: Iterable<SubReportFilter | undefined>): string[] {
  const names = new Set<string>(['isexternal']);
  for (const f of filters) for (const t of f?.properties ?? []) names.add(norm(t.name));
  return [...names].sort();
}

/** The filter of "Exterior": elements whose `IsExternal` is true. */
export const EXTERIOR: SubReportFilter = { properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] };
/**
 * The filter of "Interior": every element that is not declared external. Not `IsExternal = false`: an element that says nothing
 * (a model without the property) belongs to one of the two, so the pair is a partition and the duplicate and gap check stays clean.
 */
export const INTERIOR: SubReportFilter = { properties: [{ name: 'IsExternal', op: 'notEquals', value: 'true' }] };

/** The PredefinedType of an IFC enumeration value as the schedule keeps it: `.DOOR.` -> `DOOR`; null for none. */
export function predefinedTypeText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/^\.|\.$/g, '').trim();
  return s ? s.toUpperCase() : null;
}

/**
 * The part of `data` a filter keeps (the one rule: sub-reports are cut with it, and `applyContent` scopes a whole schedule with it). Entries are kept by
 * kind and by type; occurrences by storey, IFC class, predefined type and property tests (`schedule-filter.ts`), and the counts and totals follow the
 * occurrences, so the parts of a partition add up to the whole. An occurrence's number is not touched: a mark (`W1.3`) names the same element in the
 * schedule and in every part. With a restriction on the elements, a type with nothing left is left out; without one, a type with no occurrences at all
 * (listed from the catalogue) stays wherever its kind and type are chosen.
 */
export function subReportData<E extends SplitEntry>(data: SplitData<E>, filter: SubReportFilter | undefined): SplitData<E> {
  if (!filter || isOpenFilter(filter)) return data;
  const kinds = filter.kinds && new Set(filter.kinds);
  const types = filter.types && new Set(filter.types);
  const levels = filter.levels && new Set(filter.levels);
  const byElement = cutsElements(filter);
  const entries: E[] = [];
  for (const e of data.entries) {
    if ((kinds && !kinds.has(e.kind)) || (types && !types.has(e.key))) continue;
    if (!levels && !byElement) { entries.push(e); continue; }
    if (byElement) {
      // The elements decide: keep those that pass, and count what is kept by storey.
      const occurrences = e.occurrences.filter((o) => passesElementFilter(filter, o));
      if (occurrences.length === 0) continue;
      const counts: Record<string, number> = {};
      for (const o of occurrences) counts[o.level] = (counts[o.level] ?? 0) + 1;
      entries.push({ ...e, counts, total: occurrences.length, occurrences });
      continue;
    }
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [level, n] of Object.entries(e.counts)) if (levels!.has(level)) { counts[level] = n; total += n; }
    if (total === 0) continue;
    entries.push({ ...e, counts, total, occurrences: e.occurrences.filter((o) => levels!.has(o.level)) });
  }
  // Storeys: the chosen ones that still have something on them; the parent's columns when no storey was chosen.
  const used = new Set(entries.flatMap((e) => Object.keys(e.counts)));
  return { entries, levels: levels ? data.levels.filter((l) => levels.has(l) && used.has(l)) : byElement ? data.levels.filter((l) => used.has(l)) : data.levels };
}
