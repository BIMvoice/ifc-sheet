/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The antemasuratoare as a table (#75): Nr. crt., article code, description, unit, quantity, one row per article and, when asked, a
 * detail row per type under it. The one table of the sheet, the XLSX and CSV (the app's single writer, `schedule-export.ts`) and the
 * command line, so the file holds the rows the sheet prints. Figures are plain numbers; text is said by `BoqSay`, in the reader's language.
 */

import { BOQ_UNIT_TEXT, type BoqProblem } from './boq.js';
import type { BoqLine, BoqResult } from './boq-compute.js';
import type { BoqSay } from './boq-words.js';

export type BoqCell = string | number | null;

/** The table in the shape the app's export writer takes (`ExportTable`). */
export interface BoqTable {
  name: string;
  header: string[];
  rows: BoqCell[][];
  /** Rows set in bold: the articles, when detail rows are under them. */
  bold: number[];
  numeric: number[];
  /** Lines under the table: what was refused, left out or only partly counted. */
  notes: string[];
}

/** A refusal in words. */
export const describeBoqProblem = (p: BoqProblem, say: BoqSay): string => say(`boq.problem.${p.kind}`, p.params);

/** A figure without the float noise of a long sum (`0.30000000000000004`): six decimals are far below any quantity an estimate states. */
export const tidy = (v: number): number => Math.round(v * 1e6) / 1e6;

/** The notes about one article. */
export function boqNotes(line: BoqLine, say: BoqSay): string[] {
  const { article: a } = line;
  const code = a.code || '–';
  if (line.problem) return [say('boq.note.refused', { code, reason: describeBoqProblem(line.problem, say) })];
  const notes: string[] = [];
  if (line.matched === 0) notes.push(say('boq.note.noMatch', { code }));
  else if (line.counted === 0) notes.push(say('boq.note.allMissing', { code, count: line.matched, quantity: a.quantity }));
  else if (line.missing.length > 0) notes.push(say('boq.note.missing', { code, count: line.missing.length, quantity: a.quantity }));
  if (line.sharedMaterial > 0) notes.push(say('boq.note.sharedMaterial', { code, count: line.sharedMaterial }));
  return notes;
}

/** What a detail row calls its type: the type's name, or the class and "(no type)". */
export const boqTypeLabel = (t: { typeName: string | null; className: string }, say: BoqSay): string =>
  t.typeName ?? say('boq.detail.noType', { class: t.className.replace(/^Ifc/, '') });

export function boqTable(result: BoqResult, say: BoqSay, options: { title?: string; detail?: boolean } = {}): BoqTable {
  const rows: BoqCell[][] = [];
  const bold: number[] = [];
  const notes: string[] = [];
  result.lines.forEach((line, i) => {
    if (options.detail) bold.push(rows.length);
    rows.push([i + 1, line.article.code, line.article.description, BOQ_UNIT_TEXT[line.article.unit], line.total === null ? null : tidy(line.total)]);
    if (options.detail) for (const t of line.byType) rows.push(['', '', `  ${boqTypeLabel(t, say)}`, '', t.total === null ? null : tidy(t.total)]);
    notes.push(...boqNotes(line, say));
  });
  return {
    name: options.title || say('boq.title'),
    header: [say('boq.col.number'), say('boq.col.code'), say('boq.col.description'), say('boq.col.unit'), say('boq.col.quantity')],
    rows, bold, numeric: [0, 4], notes,
  };
}

/** The article of a line as one text row for the command line. */
export function boqLineText(line: BoqLine, locale: string): string {
  const figure = line.total === null ? '–' : (locale.startsWith('ro') ? tidy(line.total).toFixed(2).replace('.', ',') : tidy(line.total).toFixed(2));
  return `${line.article.code}  ${line.article.description}  ${figure} ${BOQ_UNIT_TEXT[line.article.unit]}`;
}
