/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Planning an issue: which sheets go out, in what order, what the drawing
 * list says of each, and what is left out and why. Pure: the project state
 * in, a plan out; the same state gives the same plan.
 */

import type { TranslationKey } from '@/i18n';
import { paperLabel } from '@/project/paper';
import type { IssuedSheet, ProjectIssue, ProjectSheet } from '@/project/types';
import type { IssuedModel } from './types';
import { holdsRegister, registerRow, sheetScaleText, type RegisterInput, type RegisterRow } from '@/project/drawing-register';
import { changeRecord, issueChanges, type IssueChanges } from './changes';
import type { ModelImpact } from './model-state';
import { FINGERPRINT_VERSION, sheetFingerprint, type FingerprintSources } from '@/project/sheet-fingerprint';

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
  /** What differs from the previous issue (`changes.ts`). */
  changes: IssueChanges;
}

/** Today as `YYYY-MM-DD` in the person's own time zone (an issue dated at 00:30 is dated that day, not yesterday's UTC). */
export function todayText(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** `text` when it is a real `YYYY-MM-DD` date, else `fallback`. */
export function validDate(text: string | undefined, fallback: string): string {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return fallback;
  const d = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? fallback : text;
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

/**
 * `projectTitleBlock` is the project's title block (`ProjectDocument.titleBlock`). A sheet's revision is the latest
 * its clouds and choices name among `sources.revisions` (`currentRevisionOf`), as its title block reads. `context` is
 * what the register also reads: the issues so far and which documents are not drawings.
 */
export function planIssue(
  sheets: readonly ProjectSheet[], sources: FingerprintSources, input: IssueInput, projectTitleBlock?: Record<string, string>,
  { model, ...context }: { issues?: readonly ProjectIssue[]; schedules?: RegisterInput['schedules']; /** What the model says of the sheets (`model-state.ts`); absent: not asked. */ model?: ModelImpact } = {},
): IssuePlan {
  const out: IssuePlan = { ...input, sheets: [], leftOut: [], changes: issueChanges([], undefined) };
  // The register opens the set, then the sheets by number.
  const first = (s: ProjectSheet) => (holdsRegister(s, context.schedules) ? 0 : 1);
  for (const sheet of [...sheets].sort((a, b) => first(a) - first(b) || bySheetNumber(a, b))) {
    if (sheetIsEmpty(sheet, sources)) {
      out.leftOut.push({ number: sheet.number, title: sheet.name, reason: { key: 'issue.reason.empty', params: { number: sheet.number } } });
      continue;
    }
    const register = registerRow(sheet, { titleBlock: projectTitleBlock, asIndicated: input.asIndicated, revisions: sources.revisions, drafts: sources.drafts, ...context });
    out.sheets.push({
      sheet,
      register,
      row: {
        number: register.number, title: register.title, scale: register.scale, paper: paperLabel(sheet.paper ?? 'A1'), orientation: sheet.orientation ?? 'landscape',
        revision: register.revision, fingerprint: sheetFingerprint(sheet, sources), fingerprintVersion: FINGERPRINT_VERSION, sheetId: sheet.id,
      },
    });
  }
  out.changes = issueChanges(out.sheets.map((s) => ({ ...s.row, sheetId: s.sheet.id, fingerprintAs: (version: number) => sheetFingerprint(s.sheet, sources, version) })), context.issues?.at(-1), model);
  return out;
}

/** The record kept with the project. */
export function issueRecord(plan: IssuePlan, id: string, createdAt: number, model?: IssuedModel): ProjectIssue {
  const changes = changeRecord(plan.changes);
  return { id, name: plan.name, date: plan.date, createdAt, sheets: plan.sheets.map((s) => s.row), ...(changes ? { changes } : {}), ...(model ? { model } : {}) };
}

/** The number in a default issue name (`Issue 3`, `Emitere 3`), read against the template of every language; null for a name typed by hand. */
function defaultIssueNumber(name: string, templates: readonly string[]): number | null {
  for (const template of templates) {
    const [head, tail = ''] = template.split('{n}');
    if (name.startsWith(head) && name.endsWith(tail) && name.length > head.length + tail.length) {
      const digits = name.slice(head.length, name.length - tail.length);
      if (/^\d+$/.test(digits)) return Number(digits);
    }
  }
  return null;
}

/**
 * The default name of the next issue: `Issue 1`, `Issue 2`… in the language `nameFor` speaks. The count is the
 * number of issues recorded, and a number already used is skipped whichever language named it (`templates` are
 * the default-name templates of every language), so a language switch neither restarts nor repeats the count (#294).
 */
export function nextIssueName(
  existing: readonly Pick<ProjectIssue, 'name'>[],
  nameFor: (n: number) => string = (n) => `Issue ${n}`,
  templates: readonly string[] = ['Issue {n}'],
): string {
  const taken = new Set(existing.map((i) => defaultIssueNumber(i.name, templates)));
  const names = new Set(existing.map((i) => i.name));
  for (let n = existing.length + 1; ; n++) if (!taken.has(n) && !names.has(nameFor(n))) return nameFor(n);
}
