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
}

export interface IssuePlan extends IssueInput {
  /** What goes out, in sheet-number order. */
  sheets: { sheet: ProjectSheet; row: IssuedSheet }[];
  /** Sheets that do not go out, with the reason. */
  leftOut: { number: string; title: string; reason: IssueReason }[];
}

/** Sheet numbers in natural order: A-2 before A-10, case ignored, ties by id so the order is fixed. */
export function bySheetNumber(a: ProjectSheet, b: ProjectSheet): number {
  return a.number.localeCompare(b.number, 'en', { numeric: true, sensitivity: 'base' }) || a.number.localeCompare(b.number, 'en') || a.id.localeCompare(b.id);
}

/** `1:50`, or `1:50, 1:100` when a sheet carries drawings at several scales; empty when it carries none. */
export function scaleText(sheet: Pick<ProjectSheet, 'viewports'>): string {
  const scales = [...new Set((sheet.viewports ?? []).map((v) => v.scale))].sort((a, b) => a - b);
  return scales.map((s) => `1:${s}`).join(', ');
}

/** A sheet holds something when a view is placed on it or something is drawn on the paper itself. */
export function sheetIsEmpty(sheet: ProjectSheet, sources: FingerprintSources): boolean {
  return (sheet.viewports ?? []).length === 0 && !sources.drafts.some((d) => d.viewId === sheet.id);
}

export function planIssue(sheets: readonly ProjectSheet[], sources: FingerprintSources, input: IssueInput): IssuePlan {
  const out: IssuePlan = { ...input, sheets: [], leftOut: [] };
  for (const sheet of [...sheets].sort(bySheetNumber)) {
    if (sheetIsEmpty(sheet, sources)) {
      out.leftOut.push({ number: sheet.number, title: sheet.name, reason: { key: 'issue.reason.empty', params: { number: sheet.number } } });
      continue;
    }
    out.sheets.push({
      sheet,
      row: {
        number: sheet.number, title: sheet.name, scale: scaleText(sheet), paper: sheet.paper ?? 'A1', orientation: sheet.orientation ?? 'landscape',
        revision: sheet.titleBlock?.revision ?? '', fingerprint: sheetFingerprint(sheet, sources),
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
