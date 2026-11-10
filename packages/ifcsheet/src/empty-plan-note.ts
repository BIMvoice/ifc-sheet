/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What a build says about a plan sheet whose drawing holds nothing (#615): the one wording, in en and ro, that `isEmptyDrawing` (`view-drawings.ts`) triggers. */

import type { ProjectDocument, ProjectView } from './document.js';

/** The warning line (no newline) for the plan `view`, hung on the sheet(s) numbered `sheetNumbers`. `language` is `ro`; anything else is English. */
export function emptyPlanNote(sheetNumbers: readonly string[], view: Pick<ProjectView, 'name'>, language: string): string {
  const where = `${sheetNumbers.join(', ')} ${view.name}`;
  return language === 'ro'
    ? `${where}: tăietura planului nu arată nimic, deci planul este gol pe această planșă`
    : `${where}: the plan's cut shows nothing, so the plan is blank on this sheet`;
}

/** The numbers of the sheets of `doc` that hang `view`, in sheet order. */
export function sheetNumbersOf(doc: Pick<ProjectDocument, 'sheets'>, view: Pick<ProjectView, 'id'>): string[] {
  return doc.sheets.filter((s) => (s.viewports ?? []).some((vp) => vp.viewId === view.id)).map((s) => s.number);
}
