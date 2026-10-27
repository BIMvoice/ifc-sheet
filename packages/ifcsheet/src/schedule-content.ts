/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The content choice of a joinery schedule (#186, section 3): which rows it shows and in which order, which elements it keeps (its filter),
 * whether the header cells draw the elevation and the plan, how its type columns are sorted, and how its types and elements are numbered. Saved on the `ProjectSchedule` (`content`); absent means the schedule
 * as it always was, so a project saved before it renders exactly as before.
 *
 * It lives here, not in the viewer, so the app, the CLI and the MCP tools build the same table:
 *  - `applyContent` keeps what the filter names, sorts the type columns and numbers them. It runs on the whole schedule, before a sub-report is cut from it
 *    (`scheduleOf`), so an element carries the same mark in the schedule and in every part.
 *  - `shownRows` says which rows the layout, the CSV and the XLSX print, and in which order.
 *  - `followedTags` plans the Tag writes that keep the model's tags (what a plan tag reads) on the numbering.
 * A sub-report prints its parent's choice (`contentOf`), the way it prints its parent's text rows.
 */

import type { ProjectSchedule, SplitData, SplitEntry } from './sub-reports.js';
import { propRowId } from './joinery-custom-props.js';
import { textOwner } from './schedule-text.js';
import { isOpenFilter, readSubReportFilter, subReportData, type SubReportFilter } from './schedule-filter.js';

/** The model's rows, in the order they print by default. `levels` is the group of rows with the count per storey. */
export const ROW_IDS = ['name', 'size', 'operation', 'sill', 'levels', 'total', 'u', 'fire'] as const;
export type RowId = (typeof ROW_IDS)[number];

/** The id of the text row `id` among the rows. */
export const textRowId = (id: string): string => `text:${id}`;

export interface ScheduleRows {
  /** Rows in the order the user put them. A row not named goes after those that are, in the default order. */
  order?: string[];
  /** Rows not shown. A text row added later is shown unless it is named here. */
  hidden?: string[];
}

export const SORTS = ['mark', 'size', 'kind', 'count'] as const;
export type SortBy = (typeof SORTS)[number];

export interface ScheduleSort {
  by: SortBy;
  /** Largest, last or highest first. Absent: ascending. */
  descending?: boolean;
}

export const MARK_SCHEMES = ['catalogue', 'sequence'] as const;

export interface ScheduleNumbering {
  /** `catalogue` (default): each type keeps its mark from the catalogue. `sequence`: types are marked D1, D2... and W1, W2... in the order shown. */
  marks?: (typeof MARK_SCHEMES)[number];
  /** The number the first door and the first window get under `sequence`. Default 1. */
  typeStart?: number;
  /** The number the first element of each type gets (`W1.<n>`). Default 1. */
  elementStart?: number;
}

/**
 * Which drawings of a type show in its header cell. Both show unless named `false`, so a schedule saved before the choice, and one that
 * chose nothing, draws as it always did. The elevation includes the section beside it, the opening symbol and the dimensions;
 * the plan is the plan view under it (drawn when the type has views cut from its geometry).
 */
export interface ScheduleSymbols {
  elevation?: false;
  plan?: false;
}

export interface ScheduleContent {
  rows?: ScheduleRows;
  sort?: ScheduleSort;
  numbering?: ScheduleNumbering;
  /**
   * What the whole schedule keeps (`schedule-filter.ts`): its scope. Applied before the sort and the numbering, so a sub-report is cut
   * from the scope and the marks are those of the scope; the duplicate and gap check measures the parts against the scope too.
   */
  filter?: SubReportFilter;
  symbols?: ScheduleSymbols;
}

/** Whether the header cell of a type draws its elevation / its plan under `content`. */
export const symbolsShown = (content: ScheduleContent | undefined): { elevation: boolean; plan: boolean } => ({
  elevation: content?.symbols?.elevation !== false,
  plan: content?.symbols?.plan !== false,
});

/** The largest start a number can be given. */
export const MAX_START = 9999;

const strings = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))] : []);
const start = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_START ? v : undefined);

/** A content as saved, read back: what is damaged is dropped, and a choice that chooses nothing is no choice (undefined). */
export function readScheduleContent(raw: unknown): ScheduleContent | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: ScheduleContent = {};
  if (typeof o.rows === 'object' && o.rows !== null) {
    const r = o.rows as Record<string, unknown>;
    const rows: ScheduleRows = {};
    const order = strings(r.order), hidden = strings(r.hidden);
    if (order.length) rows.order = order;
    if (hidden.length) rows.hidden = hidden;
    if (rows.order || rows.hidden) out.rows = rows;
  }
  if (typeof o.sort === 'object' && o.sort !== null) {
    const s = o.sort as Record<string, unknown>;
    const by = SORTS.find((k) => k === s.by);
    if (by) out.sort = s.descending === true ? { by, descending: true } : { by };
  }
  if (typeof o.numbering === 'object' && o.numbering !== null) {
    const n = o.numbering as Record<string, unknown>;
    const numbering: ScheduleNumbering = {};
    if (n.marks === 'sequence' || n.marks === 'catalogue') numbering.marks = n.marks;
    const typeStart = start(n.typeStart), elementStart = start(n.elementStart);
    if (typeStart !== undefined) numbering.typeStart = typeStart;
    if (elementStart !== undefined) numbering.elementStart = elementStart;
    if (Object.keys(numbering).length) out.numbering = numbering;
  }
  const filter = readSubReportFilter(o.filter);
  if (!isOpenFilter(filter)) out.filter = filter;
  if (typeof o.symbols === 'object' && o.symbols !== null) {
    const y = o.symbols as Record<string, unknown>;
    const symbols: ScheduleSymbols = {};
    if (y.elevation === false) symbols.elevation = false;
    if (y.plan === false) symbols.plan = false;
    if (symbols.elevation === false || symbols.plan === false) out.symbols = symbols;
  }
  return out.rows || out.sort || out.numbering || out.filter || out.symbols ? out : undefined;
}

/** Every row, in the order the content puts them, and whether it is shown: what the card lists. `textIds` are the ids of the text rows. */
export function orderedRows(content: ScheduleContent | undefined, textIds: readonly string[], propNames: readonly string[] = []): { id: string; shown: boolean }[] {
  // The model's rows, then the user's text rows, then a row for each property typed in for a type (#448).
  const known = [...ROW_IDS as readonly string[], ...textIds.map(textRowId), ...propNames.map(propRowId)];
  const set = new Set(known);
  const chosen = [...new Set(content?.rows?.order ?? [])].filter((id) => set.has(id));
  const ordered = [...chosen, ...known.filter((id) => !chosen.includes(id))];
  const hidden = new Set(content?.rows?.hidden ?? []);
  return ordered.map((id) => ({ id, shown: !hidden.has(id) }));
}

/** The rows a table prints, in order. The sill row is for windows: without one it is not printed, whatever the choice. */
export function shownRows(content: ScheduleContent | undefined, context: { windows: boolean; textIds: readonly string[]; propNames?: readonly string[] }): string[] {
  return orderedRows(content, context.textIds, context.propNames).filter((r) => r.shown && (r.id !== 'sill' || context.windows)).map((r) => r.id);
}

/** The shape of a type column the content reads and writes. */
export interface ContentEntry extends SplitEntry {
  mark: string;
  name: string;
  /** Metres; a sort by size reads them. */
  width?: number;
  height?: number;
  occurrences: { level: string; number: number }[];
}

/** The mark of one element: its type's mark and its number (`W1.3`), or the type's name and the number for an unmarked type. The one definition: the schedule, the checks and the tag writes all name an element this way. */
export function occurrenceMarkOf(entry: { mark: string; name: string }, occurrence: { number: number }): string {
  return entry.mark && entry.mark !== '—' ? `${entry.mark}.${occurrence.number}` : `${entry.name}-${occurrence.number}`;
}

const byMark = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

/** The key a sort compares; ties keep the order the model's rows came in. */
function compare(by: SortBy): (a: ContentEntry, b: ContentEntry) => number {
  switch (by) {
    case 'mark': return (a, b) => byMark(a.mark, b.mark);
    case 'size': return (a, b) => (a.width ?? 0) - (b.width ?? 0) || (a.height ?? 0) - (b.height ?? 0);
    case 'count': return (a, b) => a.total - b.total;
    case 'kind': return (a, b) => (a.kind === b.kind ? 0 : a.kind === 'window' ? -1 : 1);
  }
}

/**
 * The schedule with its type columns sorted and numbered as `content` says. Pure: the data given is not touched, and a content
 * that chooses neither a sort nor a numbering returns the data itself. Applying it to its own result changes nothing.
 */
export function applyContent<E extends ContentEntry>(data: SplitData<E>, content: ScheduleContent | undefined): SplitData<E> {
  const sort = content?.sort, numbering = content?.numbering;
  if (!sort && !numbering && !content?.filter) return data;
  // The scope first: sorted and numbered over what the schedule keeps (and the same again when applied to its own result).
  const scoped = content?.filter ? subReportData(data, content.filter) : data;
  if (!sort && !numbering) return scoped;
  data = scoped;
  const index = new Map(data.entries.map((e, i) => [e, i]));
  const sign = sort?.descending ? -1 : 1;
  const by = sort ? compare(sort.by) : null;
  const sorted = by ? [...data.entries].sort((a, b) => sign * by(a, b) || index.get(a)! - index.get(b)!) : data.entries;
  if (!numbering) return { ...data, entries: sorted };
  const from = numbering.elementStart ?? 1;
  const last = { door: (numbering.typeStart ?? 1) - 1, window: (numbering.typeStart ?? 1) - 1 };
  const entries = sorted.map((e): E => {
    const mark = numbering.marks === 'sequence' ? `${e.kind === 'door' ? 'D' : 'W'}${++last[e.kind]}` : e.mark;
    return { ...e, mark, occurrences: e.occurrences.map((o, i) => ({ ...o, number: from + i })) };
  });
  return { ...data, entries };
}

/** The content choice `schedule` prints: its own, or its parent's for a sub-report (parts print the parent's numbering, or their marks would differ from the whole's). */
export function contentOf(schedules: readonly Pick<ProjectSchedule, 'id' | 'sub' | 'content'>[], schedule: Pick<ProjectSchedule, 'id' | 'sub'>): ScheduleContent | undefined {
  return textOwner(schedules, schedule)?.content;
}

/** A Tag to write: the element's, in the model that holds it. */
export interface TagWrite { modelId: string; expressId: number; tag: string }

/** The shape of an element the tag plan reads. */
export interface TaggedEntry extends ContentEntry {
  occurrences: { level: string; number: number; modelId: string; expressId: number; tag: string | null }[];
}

/**
 * The tags to rewrite when the numbering changes from `before` to `after` (the same schedule, built from the same models). A plan tag
 * reads the element's Tag, which the schedule's marks are written into; so an element whose Tag is the mark it had gets the mark it has.
 * A Tag the user wrote, or none at all, is left alone: the numbers are written to a model on purpose (`Number elements`), never by a
 * change of settings.
 */
export function followedTags<E extends TaggedEntry>(before: SplitData<E>, after: SplitData<E>, markWith: (entry: E, occurrence: E['occurrences'][number]) => string = occurrenceMarkOf as never): TagWrite[] {
  const had = new Map<string, string>();
  for (const e of before.entries) for (const o of e.occurrences) had.set(`${o.modelId}\u0000${o.expressId}`, markWith(e, o));
  const out: TagWrite[] = [];
  for (const e of after.entries) {
    for (const o of e.occurrences) {
      const old = had.get(`${o.modelId}\u0000${o.expressId}`);
      const tag = markWith(e, o);
      if (old !== undefined && o.tag === old && tag !== old) out.push({ modelId: o.modelId, expressId: o.expressId, tag });
    }
  }
  return out;
}
