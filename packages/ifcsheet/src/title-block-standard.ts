/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The standard title block layout (180 x 50 mm): what a project prints until
 * its layout is chosen or edited. The app's sheet and this package's PDF both
 * build it here, so a project without a layout looks the same in the app, the
 * command line and the PDF. The app writes the captions in its language;
 * without one the layout is in English.
 */

import { TITLE_BLOCK_MM } from './sheet-frame.js';
import type { TemplateItem, TitleBlockTemplate } from './title-block-template.js';

/** The graphic standard's sheet line weights, paper mm (`GraphicStandard.sheet` in the app). */
export const DEFAULT_SHEET_WEIGHTS = { frame: 0.7, titleOuter: 0.5, titleDivider: 0.35, titleRule: 0.18 } as const;
/** The graphic standard's sheet letter heights, paper mm (`GraphicStandard.type` in the app). */
export const DEFAULT_SHEET_TYPE = { caption: 2, value: 3.5, number: 9, scale: 4.5, viewTitle: 3.5 } as const;

/** What the layout takes of a graphic standard: its pens and letter heights. */
export interface TitleBlockMetrics {
  sheet: { titleOuter: number; titleDivider: number; titleRule: number };
  type: { caption: number; value: number; number: number; scale: number };
}

export const DEFAULT_TITLE_BLOCK_METRICS: TitleBlockMetrics = { sheet: DEFAULT_SHEET_WEIGHTS, type: DEFAULT_SHEET_TYPE };

/** The captions' keys in the app's catalogue, and their English. */
export const STANDARD_CAPTIONS_EN = {
  'sheets.tb.project': 'Project',
  'sheets.tb.address': 'Address',
  'sheets.tb.client': 'Client',
  'sheets.tb.organisation': 'Organisation',
  'sheets.tb.title': 'Title',
  'sheets.tb.drawnBy': 'Drawn by',
  'sheets.tb.checkedBy': 'Checked by',
  'sheets.tb.date': 'Date',
  'sheets.tb.revision': 'Revision',
  'sheets.tb.number': 'Sheet no.',
  'sheets.tb.scale': 'Scale',
} as const;
export type StandardCaption = keyof typeof STANDARD_CAPTIONS_EN;

/** The same captions in Romanian (the app's `sheets.tb.*` catalogue, terms per its glossary); a parity test holds the two equal. */
export const STANDARD_CAPTIONS_RO: Record<StandardCaption, string> = {
  'sheets.tb.project': 'Proiect',
  'sheets.tb.address': 'Adresă',
  'sheets.tb.client': 'Beneficiar',
  'sheets.tb.organisation': 'Organizație',
  'sheets.tb.title': 'Titlu planșă',
  'sheets.tb.drawnBy': 'Desenat',
  'sheets.tb.checkedBy': 'Verificat',
  'sheets.tb.date': 'Data',
  'sheets.tb.revision': 'Revizie',
  'sheets.tb.number': 'Nr. planșă',
  'sheets.tb.scale': 'Scara',
};

/** The standard layout's captions in `language` (`ro`, else English): what a project without a layout of its own prints. */
export function standardCaptionsFor(language: string | undefined): (key: StandardCaption) => string {
  const words = language === 'ro' ? STANDARD_CAPTIONS_RO : STANDARD_CAPTIONS_EN;
  return (key) => words[key];
}

/**
 * The standard layout: project and address, client and organisation in halves,
 * the sheet title across, drawn and checked by, date and revision in halves; at
 * the right the logo, the sheet number and its scale. Captions are written by
 * `t`; pens and letter heights are the graphic standard's.
 */
export function standardTitleBlock(t: (key: StandardCaption) => string = (key) => STANDARD_CAPTIONS_EN[key], standard: TitleBlockMetrics = DEFAULT_TITLE_BLOCK_METRICS): TitleBlockTemplate {
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
  const cells: [StandardCaption, string, number, number][] = [
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
