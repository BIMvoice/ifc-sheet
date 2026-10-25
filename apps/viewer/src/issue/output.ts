/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What an issue is made of, as text: the drawing list as a CSV and the file
 * names of a zipped set. (The PDF is `pdf-build.ts`.) Pure: nothing here
 * knows about the screen.
 */

import type { IssuePlan } from './plan';
import { escapeCsvCell } from '@ifc-lite/export';
import { sanitizeFilename } from '@/lib/export/download';

export interface ListLabels {
  title: string;
  issue: string;
  date: string;
  sheet: string;
  sheetTitle: string;
  scale: string;
  paper: string;
  revision: string;
  /** The paper orientation, as words (`row.orientation` stays `landscape`/`portrait` in the record). */
  landscape: string;
  portrait: string;
  /** The words of the drawing list's file name (plain ASCII). */
  drawingList: string;
}

const csvCell = (s: string) => escapeCsvCell(s);

/** `A3 landscape`, the orientation in the words of `labels`. */
export const paperText = (p: IssuePlan['sheets'][number]['row'], labels: Pick<ListLabels, 'landscape' | 'portrait'>) => `${p.paper} ${labels[p.orientation]}`;

/** The drawing list as rows, the heading first: what the CSV and the handover's register workbook both write, so they cannot differ. */
export function drawingListRows(plan: IssuePlan, labels: ListLabels): string[][] {
  const rows = [[labels.sheet, labels.sheetTitle, labels.scale, labels.paper, labels.revision, labels.issue, labels.date]];
  for (const { row } of plan.sheets) rows.push([row.number, row.title, row.scale, paperText(row, labels), row.revision, plan.name, plan.date]);
  return rows;
}

/** The drawing list as CSV (comma separated, quoted where needed, CRLF line ends, UTF-8 with a byte order mark added by the writer). */
export function drawingListCsv(plan: IssuePlan, labels: ListLabels): string {
  return drawingListRows(plan, labels).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
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

export interface IssueFileNames {
  /** The drawing list beside the issue: `Issue 1 drawing list.csv`. */
  list: string;
  /** The zipped set: `Issue 1 dxf.zip`. */
  zip: string;
  /** The issued PDF: `Issue 1.pdf`. */
  pdf: string;
  /** The drawing list inside the zip: `drawing-list.csv`. */
  inZipList: string;
}

/** The file names of an issue, in the language of `labels`. A name the person typed is kept as typed (letters of any script stay). */
export function issueFileNames(issueName: string, format: string, labels: Pick<ListLabels, 'drawingList'>): IssueFileNames {
  const stem = sanitizeFilename(issueName, { fallback: 'issue' });
  return { list: `${stem} ${labels.drawingList}.csv`, zip: `${stem} ${format}.zip`, pdf: `${stem}.pdf`, inZipList: `${labels.drawingList.replace(/\s+/g, '-')}.csv` };
}

/** A sheet's file name in a zipped set. A comma and the space after it read as the word break they are (`Elevations, south` is `Elevations south`, not `Elevations- south`). */
export const sheetFileStem = (number: string, name: string): string => `${number} ${name}`.replace(/\s*,\s*/g, ' ');
