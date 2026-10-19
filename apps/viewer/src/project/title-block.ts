/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block, filled once for the project: every sheet prints the
 * project's fields (`ProjectDocument.titleBlock`), and a sheet keeps only
 * the fields it says otherwise (`ProjectSheet.titleBlock`; a key present
 * there wins, even when empty). The sheet's number, name and scale are its
 * own and are not fields here. The store writes are in `sheets.ts`.
 */

import type { ProjectDocument, ProjectSheet } from './types';

/**
 * The text fields that are typed, in the order the title block prints them. The revision is
 * not one: a sheet's title block reads its latest revision (`currentRevisionOf`).
 */
export const TITLE_BLOCK_FIELDS = ['project', 'client', 'drawnBy', 'checkedBy', 'date'] as const;
export type TitleBlockField = (typeof TITLE_BLOCK_FIELDS)[number];

/** The logo: an image data URL, project-wide only. */
export const LOGO_FIELD = 'logo';
/** Larger logos would swell every saved project file. */
export const LOGO_MAX_BYTES = 512 * 1024;

/** What `sheet` prints: the project's fields, its own on top, the project's name when no project field is set. */
export function titleBlockOf(sheet: Pick<ProjectSheet, 'titleBlock'>, project: Record<string, string> | undefined, projectName: string): Record<string, string> {
  const fields = { ...project, ...sheet.titleBlock };
  if (!fields.project) fields.project = projectName;
  return fields;
}

/**
 * A project saved before the title block was the project's: every sheet
 * carried its own copy. Each field's most common value becomes the
 * project's, and a sheet keeps a field only where it differs from that.
 * A document that already has a project title block is returned as it is.
 */
export function liftSheetTitleBlocks(doc: ProjectDocument): ProjectDocument {
  if (doc.titleBlock) return doc;
  const counts = new Map<string, Map<string, number>>();
  for (const sheet of doc.sheets) {
    for (const [key, value] of Object.entries(sheet.titleBlock ?? {})) {
      const byValue = counts.get(key) ?? new Map<string, number>();
      byValue.set(value, (byValue.get(value) ?? 0) + 1);
      counts.set(key, byValue);
    }
  }
  const titleBlock: Record<string, string> = {};
  for (const [key, byValue] of counts) {
    // Ties go to the value seen first: the set's first sheet.
    const [value] = [...byValue].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    if (value) titleBlock[key] = value;
  }
  const sheets = doc.sheets.map((sheet): ProjectSheet => {
    if (!sheet.titleBlock) return sheet;
    const own = Object.fromEntries(Object.entries(sheet.titleBlock).filter(([key, value]) => value !== (titleBlock[key] ?? '')));
    const next: ProjectSheet = { ...sheet };
    if (Object.keys(own).length > 0) next.titleBlock = own;
    else delete next.titleBlock;
    return next;
  });
  return { ...doc, titleBlock, sheets };
}
