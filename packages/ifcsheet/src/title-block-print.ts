/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A title block layout (`title-block-template.ts`) as shapes on the paper: its
 * lines and rectangles as runs, its texts resolved through the sheet's
 * parameters and fitted to their cells. Placed in the block's box as the app
 * places it: at the box's top-left corner, or, for a strip down the frame's
 * right side, turned a quarter (reading upward) about the box's bottom-left.
 *
 * Not printed here: the logo (an image), and the pens (every line is the
 * frame's). The fields are the ones the project holds; the app also reads the
 * model's own data into them (`title-block-sources.ts`), which this package
 * does not do.
 */

import type { ProjectDocument, ProjectSheet } from './document.js';
import type { Polyline, SheetText } from './sheet-graphic.js';
import type { Rect } from './sheet-frame.js';
import { TITLE_BLOCK_MM } from './sheet-frame.js';
import { fieldBuiltins, paramLookup, resolveParamText } from './title-block-params.js';
import { fitText, type TitleBlockTemplate } from './title-block-template.js';

/** What the sheet's title block fields say: the project's, a sheet's own over them, the document's name when the project field is empty. */
export function sheetFields(sheet: Pick<ProjectSheet, 'titleBlock'>, doc: Pick<ProjectDocument, 'titleBlock' | 'name'>): Record<string, string> {
  const fields = { ...doc.titleBlock, ...sheet.titleBlock };
  if (!fields.project) fields.project = doc.name;
  return fields;
}

/** The names a layout's `{Name}` can mean on `sheet`, as the app answers them (`useSheetParamLookup`). */
export function sheetLookup(sheet: ProjectSheet, doc: ProjectDocument, scale: string): (name: string) => string | undefined {
  const fields = sheetFields(sheet, doc);
  const page = doc.sheets.findIndex((s) => s.id === sheet.id) + 1;
  return paramLookup(sheet, doc.titleBlockParams, {
    ...fieldBuiltins(fields), SheetNumber: sheet.number, SheetName: sheet.name, Scale: scale, Page: `${page}/${doc.sheets.length}`, Revision: '',
  });
}

/** `template` placed in `box` (the block's rectangle, `titleBlockRect`), `strip` when the box is the tall one. */
export function printTitleBlock(template: TitleBlockTemplate, lookup: (name: string) => string | undefined, box: Rect, strip: boolean): { frame: Polyline[]; texts: SheetText[] } {
  // The strip turns the block a quarter: a point (x, y) of the block lands at (box.x + y, box.y + box.h - x).
  const at = (x: number, y: number) => (strip ? { x: box.x + y, y: box.y + TITLE_BLOCK_MM.w - x } : { x: box.x + x, y: box.y + y });
  const frame: Polyline[] = [];
  const texts: SheetText[] = [];
  for (const item of template.items) {
    if (item.kind === 'line') frame.push([at(item.x1, item.y1), at(item.x2, item.y2)]);
    else if (item.kind === 'rect') frame.push([at(item.x, item.y), at(item.x + item.w, item.y), at(item.x + item.w, item.y + item.h), at(item.x, item.y + item.h), at(item.x, item.y)]);
    else if (item.kind === 'text') {
      const { size, text } = fitText(item, resolveParamText(item.text, lookup));
      if (text) texts.push({ at: at(item.x, item.y), text, size, ...(strip ? { angle: 90 } : {}) });
    }
  }
  return { frame, texts };
}
