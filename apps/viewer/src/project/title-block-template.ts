/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's layout as data (#143), whose types and text fitting live
 * in the engine package (`packages/ifcsheet/src/title-block-template.ts`) so
 * the PDF prints the same layout. The standard layout is built here and
 * is what a project prints until its layout is edited; editing saves a
 * `ProjectDocument.titleBlockTemplate` that every sheet prints.
 */

import type { TranslationKey } from '@/i18n';
import { DEFAULT_GRAPHIC_STANDARD, type GraphicStandard } from '@/drafting/graphic-standard';
import { TITLE_BLOCK_MM } from './sheet-frame';
import { fitText, ITEM_KINDS, TEXT_FIT_MIN, type TemplateItem, type TemplateLine, type TemplateLogo, type TemplateRect, type TemplateText, type TitleBlockTemplate } from '@bimvoice/ifcsheet';

/** The longest text an item of the layout holds (the file reader cuts a longer one; an edit refuses it). */
export const MAX_TEXT = 200;

export { fitText, ITEM_KINDS, TEXT_FIT_MIN, type TemplateItem, type TemplateLine, type TemplateLogo, type TemplateRect, type TemplateText, type TitleBlockTemplate };

/**
 * The standard layout (180 x 50 mm): project and address, client and
 * organisation in halves, the sheet title across, drawn and checked by, date
 * and revision in halves; at the right the logo, the sheet number and its
 * scale. Captions are written in the language of `t` at the time; pens and
 * letter heights are the graphic standard's.
 */
export function standardTitleBlock(t: (key: TranslationKey) => string, standard: GraphicStandard = DEFAULT_GRAPHIC_STANDARD): TitleBlockTemplate {
  const { titleOuter, titleDivider, titleRule } = standard.sheet;
  const type = standard.type;
  const { w, h } = TITLE_BLOCK_MM;
  const side = 50;
  const left = w - side;
  const rowH = h / 5;
  let n = 0;
  const id = (): string => `tb${++n}`;
  const items: TemplateItem[] = [{ id: id(), kind: 'rect', x: 0, y: 0, w, h, weight: titleOuter }];
  for (const i of [1, 2, 3, 4]) items.push({ id: id(), kind: 'line', x1: 0, y1: rowH * i, x2: left, y2: rowH * i, weight: titleRule });
  for (const [from, to] of [[0, 2], [3, 5]]) items.push({ id: id(), kind: 'line', x1: left / 2, y1: rowH * from, x2: left / 2, y2: rowH * to, weight: titleRule });
  // [caption, parameter, row, column 0 or 1 of 2, or -1 across]
  const cells: [TranslationKey, string, number, number][] = [
    ['sheets.tb.project', 'Project', 0, 0],
    ['sheets.tb.address', 'Address', 0, 1],
    ['sheets.tb.client', 'Client', 1, 0],
    ['sheets.tb.organisation', 'Organisation', 1, 1],
    ['sheets.tb.title', 'SheetName', 2, -1],
    ['sheets.tb.drawnBy', 'DrawnBy', 3, 0],
    ['sheets.tb.checkedBy', 'CheckedBy', 3, 1],
    ['sheets.tb.date', 'Date', 4, 0],
    ['sheets.tb.revision', 'Revision', 4, 1],
  ];
  for (const [caption, param, row, col] of cells) {
    const x = (col === 1 ? left / 2 : 0) + 2;
    items.push({ id: id(), kind: 'text', x, y: rowH * row + 3.2, size: type.caption, text: t(caption), muted: true });
    items.push({ id: id(), kind: 'text', x, y: rowH * row + 8, size: type.value, text: `{${param}}`, ...(col < 0 ? {} : { fit: 61 }) });
  }
  items.push({ id: id(), kind: 'line', x1: left, y1: 0, x2: left, y2: h, weight: titleDivider });
  items.push({ id: id(), kind: 'line', x1: left, y1: 14, x2: w, y2: 14, weight: titleRule });
  items.push({ id: id(), kind: 'line', x1: left, y1: 34, x2: w, y2: 34, weight: titleRule });
  items.push({ id: id(), kind: 'logo', x: left + 2, y: 1.5, w: side - 4, h: 11 });
  items.push({ id: id(), kind: 'text', x: left + 2, y: 17.2, size: type.caption, text: t('sheets.tb.number'), muted: true });
  items.push({ id: id(), kind: 'text', x: left + 2, y: 29.5, size: type.number, text: '{SheetNumber}', bold: true });
  items.push({ id: id(), kind: 'text', x: left + 2, y: 37.2, size: type.caption, text: t('sheets.tb.scale'), muted: true });
  items.push({ id: id(), kind: 'text', x: left + 2, y: 45.5, size: type.scale, text: '{Scale}' });
  return { items };
}
