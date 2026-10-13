/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ISSUE: plan the issue from the project, draw the sheets, hand over the
 * files and record the issue with the project. The one place the planner and
 * the outputs meet the app's stores.
 */

import { zipSync } from 'fflate';
import { downloadFile, sanitizeFilename } from '@/lib/export/download';
import { printHtml } from '@/components/viewer/sheets/sheet-export';
import { resolve } from '@/i18n/registry';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import type { ProjectDocument } from '@/project/types';
import type { TranslationKey } from '@/i18n';
import { currentFindings } from '@/check/collect';
import { currentSnapshot } from '@/whatchanged/current';
import { captureSheets, failureLine } from './capture';
import { drawingListCsv, issuePrintHtml, uniqueNames, type ListLabels } from './output';
import { issueRecord, nextIssueName, planIssue, withLatestIssue, type IssuePlan, type IssueReason } from './plan';

export type IssueFormat = 'pdf' | 'svg' | 'dxf';

export interface IssueOptions {
  format: IssueFormat;
  name?: string;
  date?: string;
  listFirst?: boolean;
}

export interface IssueResult {
  plan: IssuePlan;
  /** The print document (PDF format). */
  html: string | null;
  /** The drawing list as CSV, always. */
  csv: string;
  /** The zipped set (SVG and DXF formats). */
  zip: Uint8Array | null;
  /** What was said to the person, as catalogue keys. */
  lines: { key: TranslationKey; params: Record<string, string | number> }[];
}

const say = (r: IssueReason) => ({ key: r.key, params: r.params });

export function listLabels(): ListLabels {
  const t = (k: string) => resolve(`issue.list.${k}` as TranslationKey);
  return { title: t('title'), issue: t('issue'), date: t('date'), sheet: t('sheet'), sheetTitle: t('sheetTitle'), scale: t('scale'), paper: t('paper'), revision: t('revision') };
}

function sources(project: ProjectDocument) {
  return { documents: [...project.views, ...(project.schedules ?? []), ...(project.legends ?? []), ...(project.civilDrawings ?? [])], drafts: project.drafts };
}

/** The plan for the project as it stands (nothing is drawn or recorded). */
export function planFor(options: Pick<IssueOptions, 'name' | 'date' | 'listFirst'>): IssuePlan {
  const project = useProjectStore.getState();
  return planIssue(project.sheets, sources(project), {
    name: options.name?.trim() || nextIssueName(project.issues ?? []),
    date: options.date ?? new Date().toISOString().slice(0, 10),
    listFirst: options.listFirst ?? true,
  });
}

/** Draw the sheets, build the files and record the issue. Nothing is recorded when a sheet could not be drawn. */
export async function runIssue(options: IssueOptions): Promise<IssueResult> {
  const plan = planFor(options);
  const csv = drawingListCsv(plan, listLabels());
  const lines: IssueResult['lines'] = plan.leftOut.map((o) => say(o.reason));
  // What is missing is said before issuing; it does not stop the issue.
  const missing = currentFindings().length;
  if (missing > 0) lines.unshift({ key: 'check.msg.unfinished', params: { count: missing } });
  if (plan.sheets.length === 0) return { plan, html: null, csv, zip: null, lines: [...lines, { key: 'issue.msg.nothing', params: {} }] };
  const { svgs, dxfs, failed } = await captureSheets(plan.sheets.map((s) => s.sheet), { dxf: options.format === 'dxf' });
  if (failed.length > 0) return { plan, html: null, csv, zip: null, lines: [...lines, ...failed.map((f) => failureLine(f)), { key: 'issue.msg.notIssued', params: {} }] };
  const project = useProjectStore.getState();
  let html: string | null = null;
  let zip: Uint8Array | null = null;
  if (options.format === 'pdf') {
    html = issuePrintHtml(plan, svgs, plan.sheets.map((s) => s.sheet.titleBlock?.project).find((n) => n) || project.name, listLabels());
  } else {
    const ext = options.format;
    const names = uniqueNames(plan.sheets.map(({ sheet }) => `${sanitizeFilename(`${sheet.number} ${sheet.name}`, { fallback: 'sheet' })}.${ext}`));
    const enc = new TextEncoder();
    const files: Record<string, Uint8Array> = { 'drawing-list.csv': enc.encode(`﻿${csv}`) };
    plan.sheets.forEach(({ sheet }, i) => {
      const data = ext === 'svg' ? enc.encode(svgs.get(sheet.id) ?? '') : dxfs.get(sheet.id);
      if (data) files[names[i]] = data;
    });
    zip = zipSync(files);
  }
  // The model as it stands is recorded with the issue: a later version is compared with it (WHATCHANGED).
  const model = await currentSnapshot();
  const record = { ...issueRecord(plan, freshProjectId('issue'), Date.now()), ...(model ? { model } : {}) };
  const issues = model ? withLatestIssue(project.issues ?? [], record) : [...(project.issues ?? []), record];
  useProjectStore.setState({ issues, dirty: true });
  lines.push({ key: 'issue.msg.done', params: { name: plan.name, date: plan.date, count: plan.sheets.length, format: options.format.toUpperCase() } });
  return { plan, html, csv, zip, lines };
}

/** Hand the result to the person: the print dialog for a PDF (with the CSV beside it), the zip for the others. */
export function deliver(result: IssueResult, format: IssueFormat): void {
  const stem = sanitizeFilename(result.plan.name, { fallback: 'issue' });
  downloadFile(`﻿${result.csv}`, `${stem} drawing list.csv`, 'text/csv;charset=utf-8');
  if (result.zip) downloadFile(result.zip, `${stem} ${format}.zip`, 'application/zip');
  if (result.html) printHtml(result.html);
}

/** What `ISSUE` was given after its name: an optional format, then the issue's name. */
export function parseIssueArgs(args: string): IssueOptions {
  const rest = args.trim();
  const f = /^(pdf|svg|dxf)\b\s*(.*)$/i.exec(rest);
  return f ? { format: f[1].toLowerCase() as IssueFormat, name: f[2].trim() || undefined } : { format: 'pdf', name: rest || undefined };
}

type Say = (key: TranslationKey, params?: Record<string, string | number>) => void;

/**
 * Run ISSUE with what was typed after its name, saying each step to `say`. The work is asynchronous: this returns at
 * once and the lines arrive as the sheets are drawn.
 */
export function runIssueCommand(args: string, say: Say): void {
  const options = parseIssueArgs(args);
  const plan = planFor(options);
  if (plan.sheets.length > 0) say('issue.msg.working', { count: plan.sheets.length });
  void runIssue(options).then((result) => {
    for (const l of result.lines) say(l.key, l.params);
    if (result.plan.sheets.length > 0 && result.lines.at(-1)?.key === 'issue.msg.done') deliver(result, options.format);
  }, (err: unknown) => say('issue.msg.line', { text: err instanceof Error ? err.message : String(err) }));
}
