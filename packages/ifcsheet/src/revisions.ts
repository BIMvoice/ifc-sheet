/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Revisions of the set, as a title block reads them. They are project records
 * (`ProjectDocument.revisions`, oldest first). A revision cloud is a drafted
 * shape stamped with the id of the revision it belongs to (`params.revisionId`);
 * a sheet's revisions are the ones its clouds name, on the sheet or on a view
 * placed on it, plus the ones chosen for it by hand (`ProjectSheet.revisionIds`),
 * in the order of the records. The sheet's current revision is the last of them,
 * and is what its title block prints: it is never typed. Pure; the app's
 * `project/revisions.ts` reads the same functions, so the app and the PDF print
 * the same revision.
 */

import type { ProjectSheet } from './document.js';

/** One revision of the set: a letter or number, when, what changed, who made it. */
export interface ProjectRevision {
  id: string;
  /** `A`, `B`, `01`: what the title block reads. */
  code: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  description: string;
  by: string;
}

/** The draft parameter that ties a cloud to its revision. */
export const REVISION_ID_PARAM = 'revisionId';

/** What a revision function reads of a drafted shape: the view it is on and its parameters. */
export interface RevisionDraft {
  viewId: string;
  params: Readonly<Record<string, unknown>>;
}

/** What the revision functions read of the project. */
export interface RevisionSource {
  drafts?: readonly RevisionDraft[];
  revisions?: readonly ProjectRevision[];
}

/** The revision a cloud belongs to; none for a draft that is not a revision cloud. */
export function cloudRevisionId(draft: Pick<RevisionDraft, 'params'>): string | null {
  const id = draft.params[REVISION_ID_PARAM];
  return typeof id === 'string' && id ? id : null;
}

/** The sheet's own revisions, in the order of the project's records. */
export function sheetRevisions(sheet: Pick<ProjectSheet, 'id' | 'viewports' | 'revisionIds'>, project: RevisionSource): ProjectRevision[] {
  const records = project.revisions ?? [];
  if (records.length === 0) return [];
  const surfaces = new Set([sheet.id, ...(sheet.viewports ?? []).map((v) => v.viewId)]);
  const named = new Set(sheet.revisionIds ?? []);
  for (const d of project.drafts ?? []) {
    const id = surfaces.has(d.viewId) ? cloudRevisionId(d) : null;
    if (id) named.add(id);
  }
  return records.filter((r) => named.has(r.id));
}

export interface CurrentRevision {
  id: string;
  code: string;
  date: string;
}

/** The latest of the sheet's revisions: what its title block, the drawing list and the register read. None when it has none. */
export function currentRevisionOf(sheet: Pick<ProjectSheet, 'id' | 'viewports' | 'revisionIds'>, project: RevisionSource): CurrentRevision | null {
  const last = sheetRevisions(sheet, project).at(-1);
  return last ? { id: last.id, code: last.code, date: last.date } : null;
}
