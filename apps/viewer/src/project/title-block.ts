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

import { LOGO_FIELD, LOGO_MAX_BYTES, TITLE_BLOCK_FIELDS, titleBlockOf, type TitleBlockField } from '@bimvoice/ifcsheet';
import type { ProjectDocument, ProjectSheet } from './types';

/** The fields, the logo and what a sheet prints are the engine's (`packages/ifcsheet/src/title-block-fields.ts`): the PDF reads them the same way. */
export { LOGO_FIELD, LOGO_MAX_BYTES, TITLE_BLOCK_FIELDS, titleBlockOf, type TitleBlockField };

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
