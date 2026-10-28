/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The manual check of a split schedule (#186, section 2): every type, and the elements under it, with the parts that list them, so a
 * reviewer can confirm each one and act on it: merge a type into one part, keep it apart on purpose, or move it to another part.
 *
 * What is a duplicate, a gap or fine is NOT decided here. The list is `SubReportCheck.elements` (`checkSubReports`), the same check the
 * card and the readiness read; this groups it by type, filters it, and works out the edits an action makes. An action is a change to the
 * parts' filters (merge, move) or to the schedule's kept-apart list (keep apart); the caller writes it to the project in one undo step.
 *
 * A part is cut by independent filters (kinds, storeys, types), so a move is by TYPE: the type leaves every other part and joins the target
 * with the storeys it has elements on. That can pull other elements of those storeys along, so the caller reads the check again after
 * the change; the review shows what is left.
 */

import { MAX_KEPT_APART, subReportData, type ProjectSchedule, type SplitData, type SubReportFilter } from './sub-reports.js';
import { partsOf, widened, type CheckEntry, type CheckPart, type ReviewElement, type ReviewStatus, type SubReportCheck } from './sub-report-check.js';
import type { ContentEntry } from './schedule-content.js';
import { cutsElements, passesElementFilter } from './schedule-filter.js';

export interface ReviewEdit { partId: string; filter: SubReportFilter }

/** One type of the schedule with its elements. `status` is the worst of its elements': duplicate, then gap, then kept apart, then ok. */
export interface ReviewType {
  key: string;
  label: string;
  kind: 'door' | 'window';
  status: ReviewStatus;
  /** The parts that list any element of it, in the order of the parts. */
  parts: { id: string; name: string }[];
  /** Its elements; a type with no element yet has one row without `element`. */
  elements: ReviewElement[];
  /** The storeys its elements are on, in the order they first appear. */
  levels: string[];
}

const RANK: Record<ReviewStatus, number> = { duplicate: 3, gap: 2, kept: 1, ok: 0 };
const worst = (a: ReviewStatus, b: ReviewStatus): ReviewStatus => (RANK[b] > RANK[a] ? b : a);

/** The check's elements by type, in the order the types come. */
export function reviewTypes(check: SubReportCheck): ReviewType[] {
  const byKey = new Map<string, ReviewType>();
  for (const e of check.elements) {
    let t = byKey.get(e.key);
    if (!t) {
      t = { key: e.key, label: e.label, kind: e.kind, status: 'ok', parts: [], elements: [], levels: [] };
      byKey.set(e.key, t);
    }
    t.elements.push(e);
    t.status = worst(t.status, e.status);
    for (const p of e.parts) if (!t.parts.some((x) => x.id === p.id)) t.parts.push(p);
    if (e.element && !t.levels.includes(e.element.level)) t.levels.push(e.element.level);
  }
  // Parts in the order of the parts, not of the first element that names them.
  const order = new Map(check.parts.map((p, i) => [p.id, i]));
  for (const t of byKey.values()) t.parts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return [...byKey.values()];
}

export interface ReviewFilter {
  kind?: 'door' | 'window';
  level?: string;
  status?: ReviewStatus;
}

/**
 * The types with an element that matches, each with only its matching elements. The kind is the type's; the storey and the status are
 * the element's. A type with no element yet has no storey and is `ok`. No filter: everything.
 */
export function filterReview(types: readonly ReviewType[], filter: ReviewFilter): ReviewType[] {
  return types.flatMap((t) => {
    if (filter.kind && t.kind !== filter.kind) return [];
    const elements = t.elements.filter((e) => (!filter.level || e.element?.level === filter.level) && (!filter.status || e.status === filter.status));
    return elements.length > 0 ? [{ ...t, elements }] : [];
  });
}

/** How many elements the check holds in each status (a type with no element yet counts as one `ok`). */
export function reviewCounts(check: SubReportCheck): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = { duplicate: 0, kept: 0, gap: 0, ok: 0 };
  for (const e of check.elements) counts[e.status] += 1;
  return counts;
}

/**
 * The edits that list the types `keys` in the part `toPartId` and in no other: each other part that lists any of them drops them (a part
 * that picks no types by hand is given the list of what it shows, less these), and the target is widened to name them. Merge and move are
 * this one change; merge offers only the parts that already list the type. No edit for a part that is already right, and none for a target
 * whose class or property filter refuses some of the elements of those types.
 */
export function placeTypes(data: SplitData<CheckEntry>, parts: readonly CheckPart[], keys: readonly string[], toPartId: string): ReviewEdit[] {
  const target = parts.find((p) => p.id === toPartId);
  if (!target || keys.length === 0) return [];
  const moving = new Set(keys);
  // A part that keeps only some classes or property values cannot take a whole type by listing it: the elements its tests refuse would stay out. No edit, rather than a move that moves nothing.
  if (cutsElements(target.filter) && data.entries.some((e) => moving.has(e.key) && e.occurrences.some((o) => !passesElementFilter(target.filter, o)))) return [];
  const edits: ReviewEdit[] = [];
  for (const p of parts) {
    if (p.id === toPartId) continue;
    const listed = subReportData(data, p.filter).entries.map((e) => e.key);
    if (!listed.some((k) => moving.has(k))) continue;
    edits.push({ partId: p.id, filter: { ...p.filter, types: (p.filter.types ?? listed).filter((k) => !moving.has(k)) } });
  }
  const levelsOf = (key: string): string[] => [...new Set(data.entries.filter((e) => e.key === key).flatMap((e) => e.occurrences.map((o) => o.level)))];
  const filter = widened(target.filter, keys.map((key) => ({ key, levels: levelsOf(key) })), data);
  if (filter) edits.push({ partId: toPartId, filter });
  return edits;
}

/** The edits for moving `keys` to `toPartId` in `parent`, from the rows `read` gives for its kind. */
export function placeTypesOf<E extends CheckEntry & ContentEntry>(parent: ProjectSchedule, schedules: readonly ProjectSchedule[], read: (kind: 'door' | 'window' | 'all') => SplitData<E>, keys: readonly string[], toPartId: string): ReviewEdit[] {
  const { parts, data } = partsOf(parent, schedules, read);
  return placeTypes(data, parts, keys, toPartId);
}

/** `kept` with these ids added (no repeats, bounded); `undefined` when none is left, the way a schedule without any is saved. */
export function keepApart(kept: readonly string[] | undefined, ids: readonly string[]): string[] | undefined {
  const next = [...new Set([...(kept ?? []), ...ids])].slice(0, MAX_KEPT_APART);
  return next.length > 0 ? next : undefined;
}

/** `kept` without these ids: the check flags them again. */
export function resumeChecking(kept: readonly string[] | undefined, ids: readonly string[]): string[] | undefined {
  const drop = new Set(ids);
  const next = (kept ?? []).filter((id) => !drop.has(id));
  return next.length > 0 ? next : undefined;
}
