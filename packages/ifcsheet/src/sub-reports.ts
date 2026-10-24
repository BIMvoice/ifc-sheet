/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sub-reports (#186): a schedule split into parts whose content the user
 * chooses. A sub-report is a schedule of its own (placeable on sheets, paged
 * and fitted to the paper like any other) that lists a selection of its
 * parent's rows. The selection is a filter with three independent
 * dimensions; a dimension that is absent does not restrict, a dimension that
 * is present keeps only what it names (an empty list keeps nothing).
 *
 * The split lives here, not in the viewer, so the web app and the headless
 * engine cut a schedule the same way. It is generic over the entry shape: a
 * type with occurrences counted per storey (a door or window type).
 */

/** What a sub-report keeps of its parent's content. Absent dimension: no restriction. */
export interface SubReportFilter {
  /** Only these kinds of element: doors, windows. */
  kinds?: ('door' | 'window')[];
  /** Only the occurrences on these storeys, by name. */
  levels?: string[];
  /** Only these types, by entry key (the types picked by hand). */
  types?: string[];
}

/** A schedule that is part of another one: the parent's id (for grouping; the content does not need it) and the selection. */
export interface SubReport {
  parent: string;
  filter: SubReportFilter;
}

/** The shape of a schedule row the split reads and keeps. */
export interface SplitEntry {
  key: string;
  kind: 'door' | 'window';
  counts: Record<string, number>;
  total: number;
  occurrences: { level: string }[];
}

export interface SplitData<E extends SplitEntry> {
  entries: E[];
  levels: string[];
}

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))] : undefined);

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
  return out;
}

/** A schedule's sub-report part as saved: absent (an ordinary schedule) unless it names its parent. */
export function readSubReport(raw: unknown): SubReport | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  return typeof o.parent === 'string' && o.parent ? { parent: o.parent, filter: readSubReportFilter(o.filter) } : undefined;
}

/**
 * The part of `data` a sub-report keeps. Entries are kept by kind and by type; occurrences by storey, and the
 * counts and totals follow the occurrences, so the parts of a partition add up to the whole. An occurrence's
 * number is not touched: a mark (`W1.3`) names the same element in the schedule and in every part. With a storey
 * restriction, a type with nothing on those storeys is left out; without one, a type with no occurrences at all
 * (listed from the catalogue) stays wherever its kind and type are chosen.
 */
export function subReportData<E extends SplitEntry>(data: SplitData<E>, filter: SubReportFilter | undefined): SplitData<E> {
  if (!filter || (!filter.kinds && !filter.levels && !filter.types)) return data;
  const kinds = filter.kinds && new Set(filter.kinds);
  const types = filter.types && new Set(filter.types);
  const levels = filter.levels && new Set(filter.levels);
  const entries: E[] = [];
  for (const e of data.entries) {
    if ((kinds && !kinds.has(e.kind)) || (types && !types.has(e.key))) continue;
    if (!levels) { entries.push(e); continue; }
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [level, n] of Object.entries(e.counts)) if (levels.has(level)) { counts[level] = n; total += n; }
    if (total === 0) continue;
    entries.push({ ...e, counts, total, occurrences: e.occurrences.filter((o) => levels.has(o.level)) });
  }
  // Storeys: the chosen ones that still have something on them; the parent's columns when no storey was chosen.
  const used = new Set(entries.flatMap((e) => Object.keys(e.counts)));
  return { entries, levels: levels ? data.levels.filter((l) => levels.has(l) && used.has(l)) : data.levels };
}
