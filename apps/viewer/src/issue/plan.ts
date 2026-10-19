/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Planning an issue: which sheets go out, in what order, what the drawing
 * list says of each, and what is left out and why. Pure: the project state
 * in, a plan out; the same state gives the same plan.
 */

import type { TranslationKey } from '@/i18n';
import type { IssuedSheet, ProjectIssue, ProjectSheet } from '@/project/types';
import { registerRow, sheetScaleText, type RegisterInput, type RegisterRow } from '@/project/drawing-register';
import { sheetFingerprint, type FingerprintSources } from './fingerprint';

export interface IssueReason {
  key: TranslationKey;
  params: Record<string, string | number>;
}

export interface IssueInput {
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Put the drawing list on a first page of the PDF. */
  listFirst: boolean;
  /** What the scale column says of a sheet with several scales (translated by the caller). */
  asIndicated?: string;
}

export interface IssuePlan extends IssueInput {
  /** What goes out, in sheet-number order. */
  sheets: { sheet: ProjectSheet; row: IssuedSheet; /** The same sheet's line in the drawing register (`project/drawing-register.ts`). */ register: RegisterRow }[];
  /** Sheets that do not go out, with the reason. */
  leftOut: { number: string; title: string; reason: IssueReason }[];
}

/** Sheet numbers in natural order: A-2 before A-10, case ignored, ties by id so the order is fixed. */
export function bySheetNumber(a: ProjectSheet, b: ProjectSheet): number {
  return a.number.localeCompare(b.number, 'en', { numeric: true, sensitivity: 'base' }) || a.number.localeCompare(b.number, 'en') || a.id.localeCompare(b.id);
}

/** The scale text of a sheet: `1:50`, `As indicated` when its drawings differ, empty when it carries none. */
export const scaleText = sheetScaleText;

/** A sheet holds something when a view is placed on it or something is drawn on the paper itself. */
export function sheetIsEmpty(sheet: ProjectSheet, sources: FingerprintSources): boolean {
  return (sheet.viewports ?? []).length === 0 && !sources.drafts.some((d) => d.viewId === sheet.id);
}

/** `projectTitleBlock` is the project's title block (`ProjectDocument.titleBlock`): a sheet's revision is its own, else the project's. `context` is what the register also reads: the issues so far and which documents are not drawings. */
export function planIssue(
  sheets: readonly ProjectSheet[], sources: FingerprintSources, input: IssueInput, projectTitleBlock?: Record<string, string>,
  context: { issues?: RegisterInput['issues']; notDrawings?: ReadonlySet<string> } = {},
): IssuePlan {
  const out: IssuePlan = { ...input, sheets: [], leftOut: [] };
  for (const sheet of [...sheets].sort(bySheetNumber)) {
    if (sheetIsEmpty(sheet, sources)) {
      out.leftOut.push({ number: sheet.number, title: sheet.name, reason: { key: 'issue.reason.empty', params: { number: sheet.number } } });
      continue;
    }
    const register = registerRow(sheet, { titleBlock: projectTitleBlock, asIndicated: input.asIndicated, ...context });
    out.sheets.push({
      sheet,
      register,
      row: {
        number: register.number, title: register.title, scale: register.scale, paper: sheet.paper ?? 'A1', orientation: sheet.orientation ?? 'landscape',
        revision: register.revision, fingerprint: sheetFingerprint(sheet, sources),
      },
    });
  }
  return out;
}

/** The record kept with the project. */
export function issueRecord(plan: IssuePlan, id: string, createdAt: number): ProjectIssue {
  return { id, name: plan.name, date: plan.date, createdAt, sheets: plan.sheets.map((s) => s.row) };
}

/** The default name of the next issue: `Issue 1`, `Issue 2`… */
export function nextIssueName(existing: readonly Pick<ProjectIssue, 'name'>[]): string {
  const taken = new Set(existing.map((i) => i.name));
  for (let n = existing.length + 1; ; n++) if (!taken.has(`Issue ${n}`)) return `Issue ${n}`;
}
