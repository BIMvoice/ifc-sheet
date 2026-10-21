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

const csvCell = (s: string) => escapeCsvCell(s);

const paperText = (p: IssuePlan['sheets'][number]['row']) => `${p.paper} ${p.orientation}`;

/** The drawing list as CSV (comma separated, quoted where needed, CRLF line ends, UTF-8 with a byte order mark added by the writer). */
export function drawingListCsv(plan: IssuePlan, labels: ListLabels): string {
  const rows = [[labels.sheet, labels.sheetTitle, labels.scale, labels.paper, labels.revision, labels.issue, labels.date]];
  for (const { row } of plan.sheets) rows.push([row.number, row.title, row.scale, paperText(row), row.revision, plan.name, plan.date]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
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
