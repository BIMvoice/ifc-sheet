/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's layout as data (#143): lines, rectangles, text and the
 * logo's frame, in millimetres from the block's top-left corner. Text reads
 * the sheet's parameters by `{Name}`. The standard layout is built here and
 * is what a project prints until its layout is edited; editing saves a
 * `ProjectDocument.titleBlockTemplate` that every sheet prints.
 */

import type { TranslationKey } from '@/i18n';
import { DEFAULT_GRAPHIC_STANDARD, type GraphicStandard } from '@/drafting/graphic-standard';
import { TITLE_BLOCK_MM } from './sheet-frame';

interface ItemBase {
  id: string;
}
export interface TemplateLine extends ItemBase { kind: 'line'; x1: number; y1: number; x2: number; y2: number; weight: number }
export interface TemplateRect extends ItemBase { kind: 'rect'; x: number; y: number; w: number; h: number; weight: number }
export interface TemplateText extends ItemBase {
  kind: 'text'; x: number; y: number;
  /** Letter height, mm. */
  size: number;
  /** Words and `{Name}` parameters. */
  text: string;
  bold?: boolean;
  /** Drawn in the grey of a caption rather than black. */
  muted?: boolean;
  /** Shrunk so the printed text is at most this wide (mm), down to {@link TEXT_FIT_MIN}. */
  fit?: number;
}
export interface TemplateLogo extends ItemBase { kind: 'logo'; x: number; y: number; w: number; h: number }
export type TemplateItem = TemplateLine | TemplateRect | TemplateText | TemplateLogo;

export interface TitleBlockTemplate {
  items: TemplateItem[];
}

export const TEXT_FIT_MIN = 1.6;
/** The advance of a letter in the title block's sans-serif, as a share of its height. */
const GLYPH_WIDTH = 0.55;

/** The height a text prints at: its own, or smaller so `shown` fits `fit` millimetres. */
export function textSizeFor(item: Pick<TemplateText, 'size' | 'fit'>, shown: string): number {
  if (!item.fit) return item.size;
  return Math.max(TEXT_FIT_MIN, Math.min(item.size, item.fit / (GLYPH_WIDTH * Math.max(1, shown.length))));
}

export const ITEM_KINDS = ['line', 'rect', 'text', 'logo'] as const;

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
