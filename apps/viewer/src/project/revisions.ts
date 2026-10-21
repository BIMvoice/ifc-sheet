/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Revisions of the set. They are project records (`ProjectDocument.revisions`,
 * oldest first). A revision cloud is a drafted shape stamped with the id of the
 * revision it belongs to (`params.revisionId`); a sheet's revisions are the ones
 * its clouds name, on the sheet or on a view placed on it, plus the ones chosen
 * for it by hand (`ProjectSheet.revisionIds`), in the order of the records. The
 * sheet's current revision is the last of them, and is what its title block
 * reads: it is never typed. Pure; no store.
 */

import type { DraftEntity } from '@/drafting/types';
import type { ProjectDocument, ProjectRevision, ProjectSheet } from './types';

/** The draft parameter that ties a cloud to its revision. */
export const REVISION_ID_PARAM = 'revisionId';

/** What the revision functions read of the project. */
export type RevisionSource = Pick<ProjectDocument, 'drafts'> & { revisions?: readonly ProjectRevision[] };

/** The revision a cloud belongs to; none for a draft that is not a revision cloud. */
export function cloudRevisionId(draft: Pick<DraftEntity, 'params'>): string | null {
  const id = draft.params[REVISION_ID_PARAM];
  return typeof id === 'string' && id ? id : null;
}

/** The sheet's own revisions, in the order of the project's records. */
export function sheetRevisions(sheet: ProjectSheet, project: RevisionSource): ProjectRevision[] {
  const records = project.revisions ?? [];
  if (records.length === 0) return [];
  const surfaces = new Set([sheet.id, ...(sheet.viewports ?? []).map((v) => v.viewId)]);
  const named = new Set(sheet.revisionIds ?? []);
  for (const d of project.drafts) {
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
export function currentRevisionOf(sheet: ProjectSheet, project: RevisionSource): CurrentRevision | null {
  const last = sheetRevisions(sheet, project).at(-1);
  return last ? { id: last.id, code: last.code, date: last.date } : null;
}

/** The revision a new cloud belongs to when none is chosen: the latest record. */
export function latestRevisionId(project: Pick<ProjectDocument, 'revisions'>): string | null {
  return project.revisions?.at(-1)?.id ?? null;
}

/**
 * Whether `draft` prints when only the sheet's current revision's clouds are
 * shown: a cloud of an older revision does not; anything else does (a cloud of
 * the current revision, a cloud without a known revision, every other draft).
 */
export function printsAtCurrentRevision(draft: Pick<DraftEntity, 'params'>, current: CurrentRevision | null, project: Pick<ProjectDocument, 'revisions'>): boolean {
  const id = cloudRevisionId(draft);
  if (!id || !current || !(project.revisions ?? []).some((r) => r.id === id)) return true;
  return id === current.id;
}

/**
 * A project saved when the title block's revision was a typed field: each
 * distinct value becomes a revision record (unless one with that code exists),
 * every sheet that printed it is given that revision, and the typed field is
 * dropped, so nothing it said is lost and it is not kept in two places. A
 * sheet that printed an empty revision of its own keeps none. A document with
 * no typed revision is returned as it is.
 */
export function liftTypedRevisions(doc: ProjectDocument, freshId: () => string): ProjectDocument {
  const typed = (tb: Record<string, string> | undefined) => (tb && 'revision' in tb ? tb.revision.trim() : null);
  const projectValue = typed(doc.titleBlock);
  const hasTyped = projectValue !== null || doc.sheets.some((s) => typed(s.titleBlock) !== null);
  if (!hasTyped) return doc;
  const revisions = [...(doc.revisions ?? [])];
  const idOf = (code: string): string => {
    const found = revisions.find((r) => r.code === code);
    if (found) return found.id;
    const date = doc.titleBlock?.date ?? '';
    const record: ProjectRevision = { id: freshId(), code, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', description: '', by: '' };
    revisions.push(record);
    return record.id;
  };
  const strip = (tb: Record<string, string>): Record<string, string> => {
    const { revision: _dropped, ...rest } = tb;
    return rest;
  };
  const sheets = doc.sheets.map((sheet): ProjectSheet => {
    const code = typed(sheet.titleBlock) ?? projectValue;
    const next: ProjectSheet = { ...sheet };
    if (sheet.titleBlock) {
      const rest = strip(sheet.titleBlock);
      if (Object.keys(rest).length > 0) next.titleBlock = rest;
      else delete next.titleBlock;
    }
    if (code) {
      const id = idOf(code);
      if (!(sheet.revisionIds ?? []).includes(id)) next.revisionIds = [...(sheet.revisionIds ?? []), id];
    }
    return next;
  });
  return { ...doc, ...(doc.titleBlock ? { titleBlock: strip(doc.titleBlock) } : {}), revisions, sheets };
}
