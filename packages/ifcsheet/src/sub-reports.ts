/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sub-reports (#186): a schedule split into parts whose content the user
 * chooses. A sub-report is a schedule of its own (placeable on sheets, paged
 * and fitted to the paper like any other) that lists a selection of its
 * parent's rows. The selection is a filter with six independent
 * dimensions (kind, storey, type, IFC class, predefined type, properties; `schedule-filter.ts`); a dimension that is absent does not restrict, a dimension that
 * is present keeps only what it names (an empty list keeps nothing).
 *
 * The split lives here, not in the viewer, so the web app and the headless
 * engine cut a schedule the same way. It is generic over the entry shape: a
 * type with occurrences counted per storey (a door or window type).
 */

import { applyContent, contentOf, readScheduleContent, type ContentEntry, type ScheduleContent } from './schedule-content.js';
import { filterPropertyNames, readSubReportFilter, subReportData, type OccurrenceFacts, type SubReportFilter } from './schedule-filter.js';
import { readScheduleTextRows, textRowsOf, type ScheduleTextRow } from './schedule-text.js';

export type { SubReportFilter };

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
  occurrences: OccurrenceFacts[];
}

export interface SplitData<E extends SplitEntry> {
  entries: E[];
  levels: string[];
}

// The filter and the cut are `schedule-filter.ts`'s (one rule, also read by `applyContent`); they are this module's public names.
export { readSubReportFilter, subReportData };

/** A schedule's sub-report part as saved: absent (an ordinary schedule) unless it names its parent. */
export function readSubReport(raw: unknown): SubReport | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  return typeof o.parent === 'string' && o.parent ? { parent: o.parent, filter: readSubReportFilter(o.filter) } : undefined;
}

/** The kinds of schedule a project holds. Only the joinery ones (`door`, `window`, `all`) can be split. */
export type ScheduleListKind = 'door' | 'window' | 'all' | 'materials' | 'types' | 'finishes' | 'register' | 'urban';

/** A schedule as the project saves it: a project document of its own, placeable on sheets. */
export interface ProjectSchedule {
  id: string;
  name: string;
  /** What it lists: doors and windows (joinery), the materials with their quantities (a takeoff), the quantities by element type, the finishes of each room, the set's own sheets (the drawing register, derived from the sheets on every draw), or the permit's areas and urban indicators. */
  kind: ScheduleListKind;
  createdAt: number;
  /** Scale of its drawings (50 = 1:50). */
  scale?: number;
  /** Set when this schedule is a part of another one (#186): the parent's id and what it keeps of the parent's content. Absent: the schedule lists everything its kind lists. Joinery kinds only. */
  sub?: SubReport;
  /** Rows of text typed by hand into a joinery schedule (#186): a manufacturer, a remark, a note per type. Cells are keyed by the type's identity, never by column. A sub-report prints its parent's (`textRowsOf`). Absent: none. Joinery kinds only. */
  textRows?: ScheduleTextRow[];
  /** What a joinery schedule shows and how (#186): its rows and their order, how its types are sorted and numbered. A sub-report prints its parent's (`contentOf`). Absent: the schedule as it always was. Joinery kinds only. */
  content?: ScheduleContent;
}

/** Whether a schedule can be split: a joinery list that is not itself a part (parts do not nest: a part is cut from the model's rows). */
export function canSplit(schedule: Pick<ProjectSchedule, 'kind' | 'sub'> | undefined): boolean {
  return !!schedule && !schedule.sub && (schedule.kind === 'door' || schedule.kind === 'window' || schedule.kind === 'all');
}

/** The sub-reports of `parentId`, in the order they were made. */
export function subReportsOf<S extends Pick<ProjectSchedule, 'sub'>>(schedules: readonly S[], parentId: string): S[] {
  return schedules.filter((s) => s.sub?.parent === parentId);
}

/** A schedule as saved, read back: null without an id; a field of the wrong type is dropped, so an old or damaged file loads as an ordinary schedule. */
export function readSchedule(raw: unknown): ProjectSchedule | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  const kind: ScheduleListKind = o.kind === 'door' || o.kind === 'window' || o.kind === 'materials' || o.kind === 'types' || o.kind === 'finishes' || o.kind === 'register' || o.kind === 'urban' ? o.kind : 'all';
  const out: ProjectSchedule = { id: o.id, name: typeof o.name === 'string' && o.name ? o.name : 'Schedule', kind, createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0 };
  if (typeof o.scale === 'number' && o.scale > 0) out.scale = o.scale;
  // A project saved before sub-reports has no `sub`: it stays an ordinary schedule. Only a joinery list can be split.
  const sub = readSubReport(o.sub);
  if (sub && (kind === 'door' || kind === 'window' || kind === 'all')) out.sub = sub;
  // Text rows (#186) belong to a joinery list only; a project saved before them has none.
  const textRows = readScheduleTextRows(o.textRows);
  if (textRows && (kind === 'door' || kind === 'window' || kind === 'all')) out.textRows = textRows;
  // The content choice (#186) belongs to a joinery list only; a project saved before it has none.
  const content = readScheduleContent(o.content);
  if (content && (kind === 'door' || kind === 'window' || kind === 'all')) out.content = content;
  return out;
}

/**
 * The table of `schedule` from the model's rows for its kind (`whole`): sorted and numbered by its content choice, then cut by its
 * sub-report filter, with the text rows and the row choice it prints. The one way a joinery schedule's content is assembled, for the
 * app and for the checks, so every reader sees the same table. Numbering comes before the cut: an element has the same mark in the
 * schedule and in every part.
 */
export function scheduleOf<E extends ContentEntry>(
  schedules: readonly (Pick<ProjectSchedule, 'id' | 'sub' | 'content'> & { textRows?: ScheduleTextRow[] })[],
  schedule: Pick<ProjectSchedule, 'id' | 'sub'>,
  whole: SplitData<E>,
): SplitData<E> & { textRows?: ScheduleTextRow[]; content?: ScheduleContent } {
  const content = contentOf(schedules, schedule);
  const data = subReportData(applyContent(whole, content), schedule.sub?.filter);
  const textRows = textRowsOf(schedules, schedule);
  // A schedule with nothing chosen and no text is the model's rows themselves (callers memoise on that).
  return textRows || content ? { ...data, ...(textRows ? { textRows } : {}), ...(content ? { content } : {}) } : data;
}

/**
 * The property names (lower case) the filters of `schedules` read, with `IsExternal`: what a schedule's rows must carry for the
 * property tests to see. The app and the headless check hand it to `joineryScheduleData`, so both read the same properties.
 */
export function scheduleFilterProperties(schedules: readonly Pick<ProjectSchedule, 'sub' | 'content'>[]): string[] {
  return filterPropertyNames(schedules.flatMap((s) => [s.sub?.filter, s.content?.filter]));
}
