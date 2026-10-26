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
import { registeredTranslations, resolve } from '@/i18n/registry';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import type { TranslationKey } from '@/i18n';
import { currentFindings } from '@/check/collect';
import { captureSheets, failureLine } from './capture';
import { drawingListCsv, issueFileNames, sheetFileStem, uniqueNames, type ListLabels } from './output';
import { buildHandover, type HandoverWorkbook } from './handover';
import { loadedModels, registerWorkbook } from './handover-collect';
import { pacOpis } from '@bimvoice/ifcsheet';
import { buildIssuePdf, type PdfLabels } from './pdf-build';
import { titleBlockOf } from '@/project/title-block';
import { effectiveTitleBlock } from '@/project/title-block-model';
import { rasterViewNames } from '@/project/view-raster';
import { issueRecord, nextIssueName, planIssue, todayText, validDate, type IssuePlan, type IssueReason } from './plan';
import { fingerprintSources } from '@/project/sheet-fingerprint';
import { modelFindings, modelImpact, modelRecord, readModel, withIssuedModel, type ModelImpact } from './model-state';
import type { ModelSnapshot } from '@/whatchanged/snapshot';
import type { ProjectSheet, ProjectView } from '@/project/types';

/** `handover`: the issued PDF, a DXF per sheet, the IFC, the schedules and the drawing list in one ZIP (#83). */
export type IssueFormat = 'pdf' | 'svg' | 'dxf' | 'handover';

export interface IssueOptions {
  format: IssueFormat;
  name?: string;
  date?: string;
  listFirst?: boolean;
  /** The permit project's submission (#364): the PDF opens with the PAC opis (Anexa 2, Legea 169/2026) in `locale`, then the sheets; no drawing list page. */
  pac?: { locale: string };
  /** Draw only the clouds of each sheet's current revision; those of older revisions are left off the paper. */
  currentCloudsOnly?: boolean;
  /** PDF: write the archival metadata (XMP, sRGB output intent; no PDF/A claim, see `pdf-archival.ts`). */
  archival?: boolean;
  /** The model as it is now, for the sheets it changed and for the record (`model-state.ts`); the viewer's models when absent. */
  readModel?: () => Promise<ModelSnapshot | null>;
  /** Handover: the schedules as workbooks, read once the sheets are drawn (`handover-collect.ts`). Without it the package holds none. */
  handoverSchedules?: () => Promise<HandoverWorkbook[]>;
}

export interface IssueResult {
  plan: IssuePlan;
  /** The issued PDF (PDF format). */
  pdf: Uint8Array | null;
  /** The drawing list as CSV, always. */
  csv: string;
  /** The zipped set (SVG and DXF formats). */
  zip: Uint8Array | null;
  /** The names of the files in the handover ZIP, in order. */
  files?: string[];
  /** What was said to the person, as catalogue keys. */
  lines: { key: TranslationKey; params: Record<string, string | number> }[];
}

const say = (r: IssueReason) => ({ key: r.key, params: r.params });

export function listLabels(): ListLabels {
  const t = (k: string) => resolve(`issue.list.${k}` as TranslationKey);
  return {
    title: t('title'), issue: t('issue'), date: t('date'), sheet: t('sheet'), sheetTitle: t('sheetTitle'), scale: t('scale'), paper: t('paper'), revision: t('revision'),
    landscape: t('landscape'), portrait: t('portrait'), drawingList: resolve('issue.file.drawingList'),
    change: { change: resolve('issue.changes.column'), new: resolve('issue.changes.cell.new'), changed: resolve('issue.changes.cell.changed'), removed: resolve('issue.changes.cell.removed') },
  };
}

export function pdfLabels(): PdfLabels {
  const t = (k: string) => resolve(`issue.layer.${k}` as TranslationKey);
  const roles: Record<string, string> = {};
  for (const role of ['SHEET', 'FRAME', 'TITLEBLOCK', 'VIEWPORT-LABELS', 'FILL', 'HATCH', 'HIDDEN', 'SEEN', 'CUT', 'SYMBOLS', 'ROOF', 'MEMBRANE', 'ROAD', 'SCHEDULE', 'SCHEDULE-SYMBOLS', 'LEGEND']) roles[role] = t(role);
  return { ...listLabels(), groups: { sheet: t('group.sheet'), drawing: t('group.drawing'), schedules: t('group.schedules'), drafting: t('group.drafting') }, roles, drafting: t('drafting') };
}

/** The plan for the project as it stands (nothing is drawn or recorded). */
export function planFor(options: Pick<IssueOptions, 'name' | 'date' | 'listFirst' | 'pac'>, model?: ModelImpact): IssuePlan {
  const project = useProjectStore.getState();
  return planIssue(project.sheets, fingerprintSources(project), {
    name: options.name?.trim() || nextIssueName(project.issues ?? [], (n) => resolve('names.issue.default', { n }), registeredTranslations('names.issue.default')),
    date: validDate(options.date, todayText()),
    listFirst: options.pac ? false : (options.listFirst ?? true),
    asIndicated: resolve('sheets.asIndicated'),
  }, effectiveTitleBlock(), { issues: project.issues, schedules: project.schedules, model });
}

/** What a DXF issue leaves out: each sheet's views that print as images, which DXF cannot carry. */
export function dxfRasterLines(sheets: readonly ProjectSheet[], views: readonly ProjectView[]): IssueResult['lines'] {
  return sheets.flatMap((sheet) => {
    const names = rasterViewNames(sheet, views);
    return names.length > 0 ? [{ key: 'issue.msg.dxfRaster' as const, params: { number: sheet.number, views: names.join(', ') } }] : [];
  });
}

/** Draw the sheets, build the files and record the issue. Nothing is recorded when a sheet could not be drawn. */
export async function runIssue(options: IssueOptions): Promise<IssueResult> {
  // The model once, for both what changed in it since the last issue and the record of it.
  const current = await readModel(options.readModel);
  const plan = planFor(options, modelImpact(modelFindings(useProjectStore.getState().issues?.at(-1), current)));
  const csv = drawingListCsv(plan, listLabels());
  const lines: IssueResult['lines'] = plan.leftOut.map((o) => say(o.reason));
  // What is missing is said before issuing; it does not stop the issue.
  const missing = currentFindings().length;
  if (missing > 0) lines.unshift({ key: 'check.msg.unfinished', params: { count: missing } });
  if (plan.sheets.length === 0) return { plan, pdf: null, csv, zip: null, lines: [...lines, { key: 'issue.msg.nothing', params: {} }] };
  if (options.format === 'dxf' || options.format === 'handover') lines.push(...dxfRasterLines(plan.sheets.map((s) => s.sheet), useProjectStore.getState().views));
  const { svgs, dxfs, failed } = await captureSheets(plan.sheets.map((s) => s.sheet), { dxf: options.format === 'dxf' || options.format === 'handover', currentCloudsOnly: options.currentCloudsOnly, issueDate: plan.date });
  if (failed.length > 0) return { plan, pdf: null, csv, zip: null, lines: [...lines, ...failed.map((f) => failureLine(f)), { key: 'issue.msg.notIssued', params: {} }] };
  const project = useProjectStore.getState();
  let pdf: Uint8Array | null = null;
  let zip: Uint8Array | null = null;
  let files: string[] | undefined;
  if (options.format === 'pdf' || options.format === 'handover') {
    const projectFields = effectiveTitleBlock();
    const projectName = plan.sheets.map((s) => titleBlockOf(s.sheet, projectFields, project.name).project).find((n) => n) || project.name;
    pdf = await buildIssuePdf(plan, svgs, projectName, pdfLabels(), { archival: options.archival, onWarning: (w) => lines.push(w), ...(options.pac ? { opis: pacOpis(plan.sheets.map((s) => s.sheet), options.pac.locale, projectName) } : {}) });
    if (options.format === 'handover') {
      const built = buildHandover({
        pattern: project.handoverPattern, project: projectName, plan, pdf, dxfs, models: loadedModels(),
        schedules: await options.handoverSchedules?.() ?? [], register: await registerWorkbook(plan, listLabels()),
      });
      zip = built.zip;
      files = built.files.map((f) => f.name);
      pdf = null;
    }
  } else {
    const ext = options.format;
    const names = uniqueNames(plan.sheets.map(({ sheet }) => `${sanitizeFilename(sheetFileStem(sheet.number, sheet.name), { fallback: 'sheet' })}.${ext}`));
    const enc = new TextEncoder();
    const files: Record<string, Uint8Array> = { [issueFileNames(plan.name, ext, listLabels()).inZipList]: enc.encode(`﻿${csv}`) };
    plan.sheets.forEach(({ sheet }, i) => {
      const data = ext === 'svg' ? enc.encode(svgs.get(sheet.id) ?? '') : dxfs.get(sheet.id);
      if (data) files[names[i]] = data;
    });
    zip = zipSync(files);
  }
  const id = freshProjectId('issue');
  const issues = [...(project.issues ?? []), issueRecord(plan, id, Date.now(), current ? modelRecord(current) : undefined)];
  // The model as issued rides with the model state, so the next issue is compared with it.
  useProjectStore.setState({ issues, dirty: true, ...(current ? { modelState: withIssuedModel(project.modelState, current, id) } : {}) });
  lines.push({ key: 'issue.msg.done', params: { name: plan.name, date: plan.date, count: plan.sheets.length, format: options.format.toUpperCase() } });
  return { plan, pdf, csv, zip, files, lines };
}

/** Hand the result to the person: the PDF (with the CSV beside it), or the zip for the others. */
export function deliver(result: IssueResult, format: IssueFormat): void {
  const names = issueFileNames(result.plan.name, format, listLabels());
  if (format === 'handover') {
    // The drawing list is inside the package: one file, nothing beside it.
    if (result.zip) downloadFile(result.zip, `${sanitizeFilename(result.plan.name, { fallback: 'issue' })} ${resolve('issue.file.handover')}.zip`, 'application/zip');
    return;
  }
  downloadFile(`﻿${result.csv}`, names.list, 'text/csv;charset=utf-8');
  if (result.zip) downloadFile(result.zip, names.zip, 'application/zip');
  if (result.pdf) downloadFile(result.pdf, names.pdf, 'application/pdf');
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
