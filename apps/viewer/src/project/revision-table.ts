/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The revision table of a sheet: one row per revision the sheet has, in order,
 * laid out in paper millimetres above the title block. Pure: the rows and the
 * columns in, the cells (text cut to the width of its column) out.
 */

import type { ProjectRevision } from './types';

/** Column widths, mm, left to right: code, date, description, by. They add up to the title block's width. */
export const REVISION_COLUMNS_MM = [14, 24, 100, 42] as const;
export const REVISION_ROW_MM = 5;
export const REVISION_FONT_MM = 2.6;
/** Most rows drawn; past it the latest ones are (the earlier ones are said by a count). */
export const REVISION_MAX_ROWS = 8;
/** A glyph is about this wide, as a fraction of the font size. */
const GLYPH = 0.55;
const PAD_MM = 1.5;

/** `text` cut to fit `widthMm` at the table's font, with an ellipsis; whole when it fits. */
export function fitText(text: string, widthMm: number): string {
  const room = Math.max(1, Math.floor((widthMm - 2 * PAD_MM) / (REVISION_FONT_MM * GLYPH)));
  const chars = [...text];
  return chars.length <= room ? text : `${chars.slice(0, Math.max(1, room - 1)).join('').trimEnd()}…`;
}

export interface RevisionTableLayout {
  /** The header, then the rows to draw; each a list of cell texts in column order. */
  rows: string[][];
  /** Revisions not drawn for lack of room (the earliest). */
  hidden: number;
}

export function revisionTableLayout(revisions: readonly ProjectRevision[], headings: readonly [string, string, string, string]): RevisionTableLayout {
  const shown = revisions.slice(-REVISION_MAX_ROWS);
  const cells = (r: readonly string[]) => r.map((text, i) => fitText(text, REVISION_COLUMNS_MM[i]));
  return {
    rows: [cells(headings), ...shown.map((r) => cells([r.code, r.date, r.description, r.by]))],
    hidden: revisions.length - shown.length,
  };
}
