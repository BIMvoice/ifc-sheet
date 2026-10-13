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
import { resolve } from '@/i18n/registry';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import type { ProjectDocument } from '@/project/types';
import type { TranslationKey } from '@/i18n';
import { currentFindings } from '@/check/collect';
import { captureSheets } from './capture';
import { drawingListCsv, issuePrintHtml, uniqueNames, type ListLabels } from './output';
import { issueRecord, nextIssueName, planIssue, type IssuePlan, type IssueReason } from './plan';

export const ISSUE_NAMES = ['ISSUE'];
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
const line = (text: string) => ({ key: 'issue.msg.line' as TranslationKey, params: { text } });

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
  if (failed.length > 0) return { plan, html: null, csv, zip: null, lines: [...lines, { key: 'issue.msg.noCapture', params: { number: failed[0].number } }] };
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
  const issues = [...(project.issues ?? []), issueRecord(plan, freshProjectId('issue'), Date.now())];
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

/** The document in a hidden frame handed to the browser's print dialog ("Save as PDF"). */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 1000), { once: true });
  setTimeout(() => { win.focus(); win.print(); }, 200);
}

/** `ISSUE [PDF|SVG|DXF] [name]`: the words after the command, or null when `text` is not the command. */
export function parseIssueCommand(text: string): IssueOptions | null {
  const m = /^(\S+)(?:\s+(.*))?$/.exec(text.trim());
  if (!m || !ISSUE_NAMES.includes(m[1].toUpperCase())) return null;
  const rest = (m[2] ?? '').trim();
  const f = /^(pdf|svg|dxf)\b\s*(.*)$/i.exec(rest);
  return f ? { format: f[1].toLowerCase() as IssueFormat, name: f[2].trim() || undefined } : { format: 'pdf', name: rest || undefined };
}

/**
 * Run `text` when it is the ISSUE command, saying each step to `say`; false
 * when it is something else. The work is asynchronous: the command returns at
 * once and the lines arrive as the sheets are drawn.
 */
export function tryIssueCommand(text: string, say: (line: { key: TranslationKey; params: Record<string, string | number>; typed?: string }) => void): boolean {
  const options = parseIssueCommand(text);
  if (!options) return false;
  say({ key: 'drafting.msg.typed' as TranslationKey, typed: text, params: { text } });
  const plan = planFor(options);
  if (plan.sheets.length > 0) say({ key: 'issue.msg.working', params: { count: plan.sheets.length } });
  void runIssue(options).then((result) => {
    for (const l of result.lines) say(l);
    if (result.plan.sheets.length > 0 && result.lines.at(-1)?.key === 'issue.msg.done') deliver(result, options.format);
  }, (err: unknown) => say(line(err instanceof Error ? err.message : String(err))));
  return true;
}
