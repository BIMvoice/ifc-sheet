/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A title block layout (`title-block-template.ts`) as shapes on the paper: its
 * lines and rectangles as runs, its texts resolved through the sheet's
 * parameters and fitted to their cells, its logo as an image. Placed in the
 * block's box as the app places it: at the box's top-left corner, or, for a
 * strip down the frame's right side, turned a quarter (reading upward) about
 * the box's bottom-left.
 *
 * The fields are the ones the app prints: the project's typed values over what
 * the model says (`title-block-sources.ts`; `projectFields` is that, resolved
 * by the caller from the model), a sheet's own over them, and the sheet's
 * current revision (`revisions.ts`). Not printed here: the pens (every line is
 * the frame's).
 */

import type { ProjectDocument, ProjectSheet } from './document.js';
import type { Polyline, SheetImage, SheetText } from './sheet-graphic.js';
import { currentRevisionOf } from './revisions.js';
import type { Rect } from './sheet-frame.js';
import { TITLE_BLOCK_MM } from './sheet-frame.js';
import { titleBlockOf } from './title-block-fields.js';
import { fieldBuiltins, paramLookup, resolveParamText } from './title-block-params.js';
import { fitCell, type TitleBlockTemplate } from './title-block-template.js';

/**
 * What the sheet's title block fields say: the project's (`projectFields`, the typed values over the model's; else the
 * document's typed values alone), a sheet's own over them, the document's name when the project field is empty.
 */
export function sheetFields(sheet: Pick<ProjectSheet, 'titleBlock'>, doc: Pick<ProjectDocument, 'titleBlock' | 'name'>, projectFields?: Record<string, string>): Record<string, string> {
  return titleBlockOf(sheet, projectFields ?? doc.titleBlock, doc.name);
}

/** The names a layout's `{Name}` can mean on `sheet`, as the app answers them (`useSheetParamLookup`). */
export function sheetLookup(sheet: ProjectSheet, doc: ProjectDocument, scale: string, projectFields?: Record<string, string>, language?: string): (name: string) => string | undefined {
  const fields = sheetFields(sheet, doc, projectFields);
  const page = doc.sheets.findIndex((s) => s.id === sheet.id) + 1;
  return paramLookup(sheet, doc.titleBlockParams, {
    ...fieldBuiltins(fields, language), SheetNumber: sheet.number, SheetName: sheet.name, Scale: scale, Page: `${page}/${doc.sheets.length}`,
    // The revision is never typed: it is the latest the sheet has.
    Revision: currentRevisionOf(sheet, doc)?.code ?? '',
  });
}

/** `template` placed in `box` (the block's rectangle, `titleBlockRect`), `strip` when the box is the tall one. */
export function printTitleBlock(template: TitleBlockTemplate, lookup: (name: string) => string | undefined, box: Rect, strip: boolean, logo?: string): { frame: Polyline[]; texts: SheetText[]; images: SheetImage[] } {
  // The strip turns the block a quarter: a point (x, y) of the block lands at (box.x + y, box.y + box.h - x).
  const at = (x: number, y: number) => (strip ? { x: box.x + y, y: box.y + TITLE_BLOCK_MM.w - x } : { x: box.x + x, y: box.y + y });
  const frame: Polyline[] = [];
  const texts: SheetText[] = [];
  const images: SheetImage[] = [];
  for (const item of template.items) {
    if (item.kind === 'line') frame.push([at(item.x1, item.y1), at(item.x2, item.y2)]);
    else if (item.kind === 'rect') frame.push([at(item.x, item.y), at(item.x + item.w, item.y), at(item.x + item.w, item.y + item.h), at(item.x, item.y + item.h), at(item.x, item.y)]);
    else if (item.kind === 'logo') {
      // The strip turns the item with the block: its width runs up the paper.
      if (logo) images.push(strip ? { src: logo, box: { x: box.x + item.y, y: box.y + TITLE_BLOCK_MM.w - item.x - item.w, w: item.h, h: item.w }, angle: 90 } : { src: logo, box: { x: box.x + item.x, y: box.y + item.y, w: item.w, h: item.h } });
    } else if (item.kind === 'text') {
      const { size, lines } = fitCell(item, resolveParamText(item.text, lookup));
      for (const { text, dy } of lines) if (text) texts.push({ at: at(item.x, item.y + dy), text, size, ...(strip ? { angle: 90 } : {}) });
    }
  }
  return { frame, texts, images };
}

/** A value the layout could not fit to its cell, even wrapped and at the smallest height: the cell's caption and the sheet. */
export interface TitleBlockMisfit { sheet: string; field: string }

/**
 * The values of `sheets` that {@link fitCell} had to cut with an ellipsis, so the user is told rather than left with
 * words that are not there. `sheet` is the label the caller gives each sheet; `field` the cell's caption (its name
 * when the cell has none), a field once per sheet.
 */
export function titleBlockMisfits(template: TitleBlockTemplate, sheets: readonly { sheet: string; lookup: (name: string) => string | undefined }[]): TitleBlockMisfit[] {
  const out: TitleBlockMisfit[] = [];
  for (const { sheet, lookup } of sheets) {
    let caption = '';
    for (const item of template.items) {
      if (item.kind !== 'text') continue;
      const shown = resolveParamText(item.text, lookup);
      if (item.muted) { caption = shown; continue; }
      if (item.lines === undefined || fitCell(item, shown).fits) continue;
      const field = caption || item.text.replace(/[{}]/g, '');
      if (!out.some((m) => m.sheet === sheet && m.field === field)) out.push({ sheet, field });
    }
  }
  return out;
}
