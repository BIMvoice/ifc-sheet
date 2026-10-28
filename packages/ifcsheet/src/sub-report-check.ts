/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Duplicate and gap checks across a schedule and its sub-reports (#186, section 2).
 *
 * A schedule split into parts should list every element exactly once. Two things break that:
 *  - a DUPLICATE: an element shown by more than one part (a type with no element yet, listed from the
 *    catalogue, counts as one unit of its own);
 *  - a GAP: an element of the whole schedule shown by no part (a type with no element has nothing to miss).
 * A type listed in two parts is NOT a duplicate by itself: one part per storey lists the same type in
 * each, with different elements. Only the same element twice is.
 *
 * This is the one place the rule lives. The web app (the card on the Wall, the "What the model lacks"
 * list) and the headless readiness both call {@link checkSubReports} and {@link subReportReadiness};
 * neither re-derives it. Pure and generic over the entry shape, like `sub-reports.ts`.
 */

import { applyContent, contentOf, occurrenceMarkOf, type ContentEntry } from './schedule-content.js';
import { canSplit, subReportData, subReportsOf, type ProjectSchedule, type SplitData, type SplitEntry, type SubReportFilter } from './sub-reports.js';

export interface CheckOccurrence {
  level: string;
  globalId: string;
  /** Counted from 1 within the type; names the element in its mark (W1.3). */
  number: number;
  /** With `expressId`, tells two elements apart across models; the GlobalId alone is used where absent. */
  modelId?: string;
  expressId?: number;
}

/** A schedule row the check reads. */
export interface CheckEntry extends SplitEntry {
  mark: string;
  name: string;
  occurrences: CheckOccurrence[];
}

export interface CheckPart { id: string; name: string; filter: SubReportFilter }
export interface PartRef { id: string; name: string }

/** The mark of one element: its type's mark and its number (`W1.3`), or the type's name and the number for an unmarked type. */
export type MarkOf<E extends CheckEntry = CheckEntry> = (entry: E, occurrence: E['occurrences'][number]) => string;

export { occurrenceMarkOf };

/** An element, as the check names it. */
export interface ElementRef { globalId: string; mark: string; level: string }

/** A type with elements listed by more than one part. `elements` is empty for a type with no element yet (listed twice from the catalogue). */
export interface DuplicateType {
  key: string;
  label: string;
  /** The duplicated elements, by mark. */
  elements: ElementRef[];
  /** The parts that list them, in the order of the parts. */
  parts: PartRef[];
  levels: string[];
}

/** A type with elements in no part. */
export interface GapType {
  key: string;
  label: string;
  elements: ElementRef[];
  levels: string[];
}

/** One click that resolves the check: set these parts' filters. Offered only when applying it was simulated and clears every duplicate (`keep`) or every gap (`add`) without adding the other. */
export interface SubReportFix {
  kind: 'add' | 'keep';
  /** The part the fix is about: the one that takes the missing types (`add`), the one that keeps the duplicated ones (`keep`). */
  part: PartRef;
  /** Types the fix moves. */
  types: number;
  edits: { partId: string; filter: SubReportFilter }[];
}

export interface SubReportCheck {
  parent: PartRef;
  parts: PartRef[];
  duplicates: DuplicateType[];
  gaps: GapType[];
  fixes: SubReportFix[];
  /** Every element of the schedule with the parts that list it, in the schedule's order (empty without parts). */
  elements: ReviewElement[];
}

export const isClean = (c: SubReportCheck): boolean => c.duplicates.length === 0 && c.gaps.length === 0;

/**
 * What the check says about one element (or one type with no element yet): `duplicate` (more than one part lists it, and nobody
 * said that is on purpose), `kept` (more than one part lists it, kept apart on purpose), `gap` (no part lists it), `ok` (exactly one).
 * A type with no element yet is never a `gap`: it has nothing to put on a sheet.
 */
export type ReviewStatus = 'duplicate' | 'kept' | 'gap' | 'ok';

/** One row of the review by element: an element with the parts that list it. The list is the check's own, so it cannot disagree with the duplicates and gaps above. */
export interface ReviewElement {
  /** `keepId` of the row: how "kept apart" names it in the project. */
  id: string;
  key: string;
  /** The type's mark and name. */
  label: string;
  kind: 'door' | 'window';
  /** Absent for a type listed from the catalogue with no element yet. */
  element?: ElementRef;
  /** The parts that list it, in the order of the parts. */
  parts: PartRef[];
  status: ReviewStatus;
}

/**
 * The name a "keep apart" decision gives an element in the project: its type's key and its GlobalId. Without a GlobalId it names the
 * whole type: every element of it, and a type with no element yet. Not the express id, which a model update can change; the same id
 * for the element in every part.
 */
export const keepId = (key: string, globalId?: string): string => `${key}|${globalId ?? ''}`;

/** A type's label: its mark and name, the name alone for an unmarked type. */
export const typeLabel = (e: Pick<CheckEntry, 'mark' | 'name'>): string => (e.mark && e.mark !== '—' ? `${e.mark} ${e.name}` : e.name);

interface Unit { id: string; entry: CheckEntry; occurrence?: CheckOccurrence }

const unitsOf = (data: SplitData<CheckEntry>): Unit[] =>
  data.entries.flatMap((entry): Unit[] => entry.occurrences.length === 0
    ? [{ id: `${entry.key}|`, entry }]
    : entry.occurrences.map((occurrence) => ({ id: `${entry.key}|${occurrence.modelId ?? ''}:${occurrence.expressId ?? occurrence.globalId}`, entry, occurrence })));

interface Analysis { all: Unit[]; holders: Map<string, number[]>; units: Map<string, Unit>; kept: ReadonlySet<string> }

function analyse(data: SplitData<CheckEntry>, parts: readonly CheckPart[], kept: ReadonlySet<string>): Analysis {
  const all = unitsOf(data);
  const units = new Map(all.map((u) => [u.id, u]));
  const holders = new Map<string, number[]>();
  parts.forEach((p, i) => {
    for (const u of unitsOf(subReportData(data, p.filter))) holders.set(u.id, [...(holders.get(u.id) ?? []), i]);
  });
  return { all, holders, units, kept };
}

const unitKeepId = (u: Unit): string => keepId(u.entry.key, u.occurrence?.globalId);
/** Kept apart on purpose: the element by its own id, or its whole type by the type's id (`keepId(key)`). */
const isKept = (a: Analysis, u: Unit): boolean => a.kept.has(unitKeepId(u)) || a.kept.has(keepId(u.entry.key));
/** More than one part lists it, and it was not kept apart on purpose. */
const isDuplicate = (a: Analysis, u: Unit): boolean => (a.holders.get(u.id)?.length ?? 0) > 1 && !isKept(a, u);
const duplicated = (a: Analysis) => a.all.filter((u) => isDuplicate(a, u)).length;
/** Gaps are elements: a type with no element yet is on no sheet because it has nothing to put there, and a storey part can never list it. */
const missing = (a: Analysis) => a.all.filter((u) => u.occurrence && !a.holders.has(u.id)).length;

const unique = <T,>(list: readonly T[]): T[] => [...new Set(list)];

interface Group extends GapType { units: Unit[] }

/** The units by type, in the order the types come; each element named by its mark. */
function group(units: Unit[], markOf: MarkOf): Group[] {
  const byKey = new Map<string, Group>();
  for (const u of units) {
    let g = byKey.get(u.entry.key);
    if (!g) {
      g = { key: u.entry.key, label: typeLabel(u.entry), elements: [], levels: [], units: [] };
      byKey.set(u.entry.key, g);
    }
    g.units.push(u);
    if (u.occurrence) {
      g.elements.push({ globalId: u.occurrence.globalId, mark: markOf(u.entry, u.occurrence), level: u.occurrence.level });
      if (!g.levels.includes(u.occurrence.level)) g.levels.push(u.occurrence.level);
    }
  }
  return [...byKey.values()];
}

/** The widest filter that still names what `filter` names, plus these types (`gaps` names them with their storeys), their kinds and storeys; null when it already does. */
export function widened(filter: SubReportFilter, gaps: readonly { key: string; levels: readonly string[] }[], data: SplitData<CheckEntry>): SubReportFilter | null {
  const out: SubReportFilter = { ...filter };
  const keys = new Set(gaps.map((g) => g.key));
  if (out.types) out.types = unique([...out.types, ...keys]);
  if (out.kinds) out.kinds = unique([...out.kinds, ...data.entries.filter((e) => keys.has(e.key)).map((e) => e.kind)]);
  if (out.levels) out.levels = unique([...out.levels, ...gaps.flatMap((g) => g.levels)]);
  return JSON.stringify(out) === JSON.stringify(filter) ? null : out;
}

function proposeFixes(data: SplitData<CheckEntry>, parts: readonly CheckPart[], kept: ReadonlySet<string>, before: Analysis, gaps: readonly GapType[], dups: readonly DuplicateType[]): SubReportFix[] {
  const fixes: SubReportFix[] = [];
  const swap = (edits: { partId: string; filter: SubReportFilter }[]) => parts.map((p) => ({ ...p, filter: edits.find((e) => e.partId === p.id)?.filter ?? p.filter }));
  if (gaps.length > 0) {
    for (const part of parts) {
      const filter = widened(part.filter, gaps, data);
      if (!filter) continue;
      const after = analyse(data, swap([{ partId: part.id, filter }]), kept);
      if (missing(after) === 0 && duplicated(after) <= duplicated(before)) { fixes.push({ kind: 'add', part: { id: part.id, name: part.name }, types: gaps.length, edits: [{ partId: part.id, filter }] }); break; }
    }
  }
  if (dups.length > 0) {
    const involved = parts.filter((p) => dups.some((d) => d.parts.some((r) => r.id === p.id)));
    for (const keeper of involved) {
      const edits = involved.filter((p) => p.id !== keeper.id).flatMap((p) => {
        const drop = new Set(dups.filter((d) => d.parts.some((r) => r.id === p.id)).map((d) => d.key));
        const listed = subReportData(data, p.filter).entries.map((e) => e.key);
        const types = (p.filter.types ?? listed).filter((k) => !drop.has(k));
        return [{ partId: p.id, filter: { ...p.filter, types } }];
      });
      const after = analyse(data, swap(edits), kept);
      if (duplicated(after) === 0 && missing(after) <= missing(before)) { fixes.push({ kind: 'keep', part: { id: keeper.id, name: keeper.name }, types: dups.length, edits }); break; }
    }
  }
  return fixes;
}

/**
 * Every element of `parent.data` against the parts that cut it. No parts, nothing to check. A fix is offered only
 * when it was applied to a copy and cleared what it set out to without making the other kind of problem worse.
 */
export function checkSubReports<E extends CheckEntry>(parent: { id: string; name: string; data: SplitData<E> }, parts: readonly CheckPart[], markWith: MarkOf<E> = occurrenceMarkOf, keptApart: readonly string[] = []): SubReportCheck {
  const markOf = markWith as unknown as MarkOf;
  const refs = parts.map((p): PartRef => ({ id: p.id, name: p.name }));
  const result: SubReportCheck = { parent: { id: parent.id, name: parent.name }, parts: refs, duplicates: [], gaps: [], fixes: [], elements: [] };
  if (parts.length === 0) return result;
  const kept = new Set(keptApart);
  const a = analyse(parent.data, parts, kept);
  const dupUnits = a.all.filter((u) => isDuplicate(a, u));
  const gapUnits = a.all.filter((u) => u.occurrence && !a.holders.has(u.id));
  result.duplicates = group(dupUnits, markOf).map(({ units, ...g }): DuplicateType => {
    const held = new Set(units.flatMap((u) => a.holders.get(u.id) ?? []));
    return { ...g, parts: refs.filter((_, i) => held.has(i)) };
  });
  result.gaps = group(gapUnits, markOf).map(({ units: _units, ...g }): GapType => g);
  result.fixes = proposeFixes(parent.data, parts, kept, a, result.gaps, result.duplicates);
  result.elements = a.all.map((u): ReviewElement => {
    const held = a.holders.get(u.id) ?? [];
    const status: ReviewStatus = held.length > 1 ? (isDuplicate(a, u) ? 'duplicate' : 'kept') : held.length === 0 && u.occurrence ? 'gap' : 'ok';
    const o = u.occurrence;
    return {
      id: unitKeepId(u), key: u.entry.key, label: typeLabel(u.entry), kind: u.entry.kind, status, parts: held.map((i) => refs[i]),
      ...(o ? { element: { globalId: o.globalId, mark: markOf(u.entry, o), level: o.level } } : {}),
    };
  });
  return result;
}

/** How many elements a list of types holds. */
export const elementCount = (types: readonly { elements: readonly unknown[] }[]): number => types.reduce((n, t) => n + t.elements.length, 0);

/** What the readiness list says about one check: the findings' parameters, in words that need no translation (names, marks, storeys, counts). */
/** For duplicates, `parts` names the parts that share them. */
export function subReportParams(types: readonly (DuplicateType | GapType)[], schedule: string): Record<string, number | string> {
  const SHOWN = 4;
  const say = (t: DuplicateType | GapType) => `${t.label}${t.elements.length > 0 ? ` ×${t.elements.length}` : ''}${t.levels.length > 0 ? ` (${t.levels.join(', ')})` : ''}`;
  const list = types.slice(0, SHOWN).map(say).join('; ') + (types.length > SHOWN ? '; …' : '');
  return { schedule, types: types.length, count: elementCount(types), list, ...(types.some((t) => 'parts' in t) ? { parts: unique(types.flatMap((t) => ('parts' in t ? t.parts.map((p) => p.name) : []))).join(', ') } : {}) };
}

/**
 * The check of one split schedule: its rows (as `read` gives them, for the schedule's kind) against its parts. Parts read
 * their parent's whole rows, never a part of a part.
 */
export function subReportCheckOf<E extends CheckEntry & ContentEntry>(parent: ProjectSchedule, schedules: readonly ProjectSchedule[], read: (kind: 'door' | 'window' | 'all') => SplitData<E>, markWith?: MarkOf<E>): SubReportCheck {
  const { parts, data } = partsOf(parent, schedules, read);
  return checkSubReports({ id: parent.id, name: parent.name, data }, parts, markWith, parent.keptApart);
}

/**
 * The parts of `parent` and the rows they are cut from: the parent's rows as the schedule prints them (sorted, numbered), so the marks a
 * check names are the marks on the sheet. The one place that reads them, for the check and for the review's edits.
 */
export function partsOf<E extends CheckEntry & ContentEntry>(parent: ProjectSchedule, schedules: readonly ProjectSchedule[], read: (kind: 'door' | 'window' | 'all') => SplitData<E>): { parts: CheckPart[]; data: SplitData<E> } {
  const parts = subReportsOf(schedules, parent.id).map((p) => ({ id: p.id, name: p.name, filter: p.sub!.filter }));
  const data: SplitData<E> = parts.length > 0 ? applyContent(read(parent.kind as 'door' | 'window' | 'all'), contentOf(schedules, parent)) : { entries: [], levels: [] };
  return { parts, data };
}

/** The checks of every schedule that has parts, in the order of the schedules. The app and the headless readiness both gather them here. */
export function subReportChecksOf<E extends CheckEntry & ContentEntry>(schedules: readonly ProjectSchedule[], read: (kind: 'door' | 'window' | 'all') => SplitData<E>, markWith?: MarkOf<E>): SubReportCheck[] {
  return schedules.filter((s) => canSplit(s) && subReportsOf(schedules, s.id).length > 0).map((s) => subReportCheckOf(s, schedules, read, markWith));
}
