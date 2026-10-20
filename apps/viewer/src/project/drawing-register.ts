/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing register: one row per sheet of the set, read from the sheets as
 * they stand. The register sheet and the issue's drawing list build their rows
 * here, so the two cannot disagree. Nothing is stored: a row is derived every
 * time it is wanted.
 */

import { sheetGroup, type SetGroup } from './drawing-set';
import { currentRevisionOf } from './revisions';
import type { DraftEntity } from '@/drafting/types';
import type { ProjectIssue, ProjectRevision, ProjectSchedule, ProjectSheet } from './types';

export interface RegisterRow {
  number: string;
  title: string;
  /** `1:50`; `1:50, 1:100` is `asIndicated` when a sheet's drawings differ in scale; empty when it carries none. */
  scale: string;
  /** The sheet's current revision, or empty. */
  revision: string;
  /** `YYYY-MM-DD`: the revision's date, else the date of the last issue that held the sheet, else empty. */
  date: string;
}

export interface RegisterInput {
  sheets: readonly ProjectSheet[];
  /** `ProjectDocument.titleBlock`. */
  titleBlock?: Record<string, string>;
  issues?: readonly Pick<ProjectIssue, 'date' | 'createdAt' | 'sheets'>[];
  /** The project's schedules (the register among them): their viewports carry no drawing scale, and a sheet holding the register comes first. */
  schedules?: readonly Pick<ProjectSchedule, 'id' | 'kind'>[];
  /** What the scale column says of a sheet with several scales. */
  asIndicated?: string;
  /** The project's revision records and the drafts their clouds are in: a sheet's revision is the latest it has (`currentRevisionOf`). */
  revisions?: readonly ProjectRevision[];
  drafts?: readonly DraftEntity[];
}

/** The order the drawer lists sheets in: the register first, then by series, plans first, sheets of no series last; creation order within a series. */
export const SET_ORDER: readonly (SetGroup | null)[] = ['plans', 'elevations', 'sections', 'interiors', 'schedules', null];

/** Ids of the documents whose viewports are not drawings: every schedule, the register included. */
export const notDrawingIds = (schedules: RegisterInput['schedules']): ReadonlySet<string> => new Set((schedules ?? []).map((s) => s.id));

/** Whether the sheet holds the register: decided by its kind, not by its number, so renumbering cannot move it. */
export function holdsRegister(sheet: Pick<ProjectSheet, 'viewports'>, schedules: RegisterInput['schedules']): boolean {
  const ids = new Set((schedules ?? []).filter((s) => s.kind === 'register').map((s) => s.id));
  return (sheet.viewports ?? []).some((v) => ids.has(v.viewId));
}

export function inSetOrder<S extends Pick<ProjectSheet, 'number' | 'viewports'>>(sheets: readonly S[], schedules?: RegisterInput['schedules']): S[] {
  return [
    ...sheets.filter((s) => holdsRegister(s, schedules)),
    ...SET_ORDER.flatMap((group) => sheets.filter((s) => !holdsRegister(s, schedules) && sheetGroup(s) === group)),
  ];
}

/** The scale text of one sheet. */
export function sheetScaleText(sheet: Pick<ProjectSheet, 'viewports'>, notDrawings: ReadonlySet<string> = new Set(), asIndicated = 'As indicated'): string {
  const scales = [...new Set((sheet.viewports ?? []).filter((v) => !notDrawings.has(v.viewId)).map((v) => v.scale))].sort((a, b) => a - b);
  return scales.length > 1 ? asIndicated : scales.map((s) => `1:${s}`).join('');
}

/** The date of the last issue that held a sheet numbered `number`. */
function lastIssueDate(number: string, issues: RegisterInput['issues']): string {
  const held = (issues ?? []).filter((i) => i.sheets.some((s) => s.number === number));
  const last = held.reduce<(typeof held)[number] | null>((a, i) => (a === null || i.createdAt >= a.createdAt ? i : a), null);
  return last?.date ?? '';
}

/** One sheet's row. The number is read from the sheet now, never copied. */
export function registerRow(sheet: ProjectSheet, input: Omit<RegisterInput, 'sheets'>): RegisterRow {
  // The revision is never typed: it is the latest the sheet has, as its title block reads (`revisions.ts`).
  const current = currentRevisionOf(sheet, { revisions: input.revisions, drafts: [...(input.drafts ?? [])] });
  const revision = current?.code ?? '';
  return {
    number: sheet.number, title: sheet.name, scale: sheetScaleText(sheet, notDrawingIds(input.schedules), input.asIndicated), revision,
    date: (revision && current?.date) || lastIssueDate(sheet.number, input.issues),
  };
}

/** The register: a row for every sheet, in set order. */
export function drawingRegisterRows(input: RegisterInput): RegisterRow[] {
  return inSetOrder(input.sheets, input.schedules).map((sheet) => registerRow(sheet, input));
}

/** The inputs a row reads besides its sheet: a row is reused while every one of them is the same object. */
type RowContext = Omit<RegisterInput, 'sheets'>;
const sameContext = (a: RowContext, b: RowContext): boolean =>
  a.titleBlock === b.titleBlock && a.issues === b.issues && a.schedules === b.schedules && a.asIndicated === b.asIndicated;

/**
 * `drawingRegisterRows`, remembered: a sheet's row is built again only when
 * that sheet changed (a new object) or the title block, the issues, the
 * schedules or the wording did; the same input twice returns the same rows.
 * Every sheet on screen reads the register through one of these, so editing
 * one sheet builds one row, not a row for every sheet on every sheet.
 */
export function registerRowCache(build: typeof registerRow = registerRow): (input: RegisterInput) => RegisterRow[] {
  let context: RowContext | null = null;
  let bySheet = new WeakMap<ProjectSheet, RegisterRow>();
  let last: { sheets: readonly ProjectSheet[]; rows: RegisterRow[] } | null = null;
  return (input) => {
    const { sheets: _sheets, ...now } = input;
    if (!context || !sameContext(context, now)) {
      context = now;
      bySheet = new WeakMap();
      last = null;
    }
    if (last?.sheets === input.sheets) return last.rows;
    const rows = inSetOrder(input.sheets, input.schedules).map((sheet) => {
      let row = bySheet.get(sheet);
      if (!row) {
        row = build(sheet, now);
        bySheet.set(sheet, row);
      }
      return row;
    });
    last = { sheets: input.sheets, rows };
    return rows;
  };
}

let built = 0;
/** How many rows the shared cache has built since the app started: what a test reads to see rows are not rebuilt for every sheet. */
export const registerRowsBuilt = (): number => built;
/** The one cache every register on screen reads. */
export const sharedRegisterRows = registerRowCache((sheet, input) => { built++; return registerRow(sheet, input); });
