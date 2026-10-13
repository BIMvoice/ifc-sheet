/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What an issue is made of, as text: the drawing list as a CSV, the print
 * document with one page per sheet at the sheet's own paper size (named
 * `@page` rules, so A3 and A2 sheets print correctly in one job), and the
 * file names of a zipped set. Pure: nothing here knows about the screen.
 */

import { paperOf } from '@/project/sheets';
import type { IssuePlan } from './plan';

export interface ListLabels {
  title: string;
  issue: string;
  date: string;
  sheet: string;
  sheetTitle: string;
  scale: string;
  paper: string;
  revision: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const paperText = (p: IssuePlan['sheets'][number]['row']) => `${p.paper} ${p.orientation}`;

/** The drawing list as CSV (comma separated, quoted where needed, CRLF line ends, UTF-8 with a byte order mark added by the writer). */
export function drawingListCsv(plan: IssuePlan, labels: ListLabels): string {
  const rows = [[labels.sheet, labels.sheetTitle, labels.scale, labels.paper, labels.revision, labels.issue, labels.date]];
  for (const { row } of plan.sheets) rows.push([row.number, row.title, row.scale, paperText(row), row.revision, plan.name, plan.date]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** The sheet SVG without its XML prolog, ready to sit in an HTML page. */
const inline = (svg: string) => svg.replace(/^<\?xml[^>]*>\s*/, '');

function listPage(plan: IssuePlan, projectName: string, labels: ListLabels): string {
  const head = [labels.sheet, labels.sheetTitle, labels.scale, labels.paper, labels.revision];
  const body = plan.sheets.map(({ row }) => [row.number, row.title, row.scale, paperText(row), row.revision]);
  return `<section class="pg list"><h1>${esc(labels.title)}</h1><p>${esc(projectName)}<br>${esc(labels.issue)}: ${esc(plan.name)}<br>${esc(labels.date)}: ${esc(plan.date)}</p>`
    + `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}

/**
 * The print document. Every page is named after its paper (`p-594x420`), and
 * each name has its own `@page` size, so the browser cuts the job into pages
 * of different sizes. `svgs` maps a sheet id to its SVG text sized in millimetres.
 */
export function issuePrintHtml(plan: IssuePlan, svgs: ReadonlyMap<string, string>, projectName: string, labels: ListLabels): string {
  const sizes = new Map<string, { w: number; h: number }>();
  const pages: string[] = [];
  if (plan.listFirst) {
    sizes.set('list', { w: 210, h: 297 });
    pages.push(listPage(plan, projectName, labels));
  }
  for (const { sheet } of plan.sheets) {
    const svg = svgs.get(sheet.id);
    if (svg === undefined) continue;
    const { w, h } = paperOf(sheet);
    const name = `p-${w}x${h}`;
    sizes.set(name, { w, h });
    pages.push(`<section class="pg" style="page:${name}">${inline(svg)}</section>`);
  }
  const rules = [...sizes].map(([name, { w, h }]) => `@page ${name}{size:${w}mm ${h}mm;margin:0}`).join('');
  const css = `${rules}html,body{margin:0;padding:0}.pg{break-after:page;overflow:hidden}.pg:last-child{break-after:auto}svg{display:block}`
    + `.list{page:list;box-sizing:border-box;width:210mm;height:297mm;padding:20mm;font:11pt sans-serif}.list h1{font-size:18pt;margin:0 0 6mm}.list p{margin:0 0 8mm}`
    + `.list table{border-collapse:collapse;width:100%}.list th,.list td{border-bottom:0.3mm solid #000;padding:1.5mm 2mm;text-align:left}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.name)}</title><style>${css}</style></head><body>${pages.join('')}</body></html>`;
}

/** `A-101 Ground floor.svg`; a name used twice gets ` (2)` so no file overwrites another. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = n.toLowerCase();
    const count = (seen.get(k) ?? 0) + 1;
    seen.set(k, count);
    if (count === 1) return n;
    const dot = n.lastIndexOf('.');
    return dot > 0 ? `${n.slice(0, dot)} (${count})${n.slice(dot)}` : `${n} (${count})`;
  });
}
