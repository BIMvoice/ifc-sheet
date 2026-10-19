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
import { titleBlockOf } from './title-block';
import type { ProjectIssue, ProjectSheet } from './types';

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
  /** Ids of documents that are not drawings (schedules, the register): their viewports carry no drawing scale. */
  notDrawings?: ReadonlySet<string>;
  /** What the scale column says of a sheet with several scales. */
  asIndicated?: string;
}

/** The order the drawer lists sheets in: by series, plans first, sheets of no series last; creation order within a series. */
export const SET_ORDER: readonly (SetGroup | null)[] = ['plans', 'elevations', 'sections', 'schedules', null];

export function inSetOrder<S extends Pick<ProjectSheet, 'number'>>(sheets: readonly S[]): S[] {
  return SET_ORDER.flatMap((group) => sheets.filter((s) => sheetGroup(s) === group));
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
  const block = titleBlockOf(sheet, input.titleBlock, '');
  const revision = block.revision ?? '';
  return {
    number: sheet.number, title: sheet.name, scale: sheetScaleText(sheet, input.notDrawings, input.asIndicated), revision,
    date: (revision && block.date) || lastIssueDate(sheet.number, input.issues),
  };
}

/** The register: a row for every sheet, in set order. */
export function drawingRegisterRows(input: RegisterInput): RegisterRow[] {
  return inSetOrder(input.sheets).map((sheet) => registerRow(sheet, input));
}
