/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block of Romanian practice (cartuș, #54), as a layout in the
 * block's 180 x 50 mm (`TITLE_BLOCK_MM`), so it sits in the frame at every
 * paper size and in both positions like the standard one:
 *
 *   - left: proiectant general (with the logo), project, sheet title, site
 *     address, client (beneficiar);
 *   - middle: șef proiect, proiectat, desenat, verificat, then date and revision;
 *   - right: phase and project number, sheet number and scale, and two empty
 *     boxes for the stamps and signatures of the designer and of the verifier.
 *
 * Captions are in the language of `t` at the time the layout is chosen, as the
 * standard layout's are. The words are the ones the app's `i18n/ro-glossary.md` keeps. The
 * layout is built here, in the engine package, so the app and `ifcsheet build --standard ro` print the same one.
 * The layout is then the project's own (`ProjectDocument.titleBlockTemplate`)
 * and editable like any other (#143).
 */

import { DEFAULT_GRAPHIC_STANDARD, type GraphicStandard } from './graphic-standard.js';
import { TITLE_BLOCK_MM } from './sheet-frame.js';
import type { StandardCaption } from './title-block-standard.js';
import type { TemplateItem, TitleBlockTemplate } from './title-block-template.js';

/** The captions only the Romanian layout uses, with their keys in the app's catalogue, and their English. */
export const RO_ONLY_CAPTIONS_EN = {
  'tbro.generalDesigner': 'General designer',
  'tbro.projectManager': 'Project manager',
  'tbro.designer': 'Designed by',
  'tbro.phase': 'Phase',
  'tbro.projectNumber': 'Project no.',
  'tbro.stampDesigner': 'Designer stamp',
  'tbro.stampVerifier': 'Verifier stamp',
} as const;
export type RoOnlyCaption = keyof typeof RO_ONLY_CAPTIONS_EN;
/** Every caption the Romanian layout prints. */
export type RoCaption = RoOnlyCaption | StandardCaption;

/** The Romanian layout's captions in Romanian (the words of the app's glossary, `i18n/ro-glossary.md`), for the layout in the app's Romanian and for the command line. */
export const TITLE_BLOCK_CAPTIONS_RO: Record<RoCaption, string> = {
  'tbro.generalDesigner': 'Proiectant general',
  'tbro.projectManager': 'Șef proiect',
  'tbro.designer': 'Proiectat',
  'tbro.phase': 'Faza',
  'tbro.projectNumber': 'Proiect nr.',
  'tbro.stampDesigner': 'Ștampilă proiectant',
  'tbro.stampVerifier': 'Ștampilă verificator',
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

/** The columns' left edges and the right edge, mm. */
export const RO_COLUMNS = { a: 0, b: 64, c: 118, end: TITLE_BLOCK_MM.w } as const;
/** Where the stamp boxes start, down the right column, mm; each is half the column wide. */
export const RO_STAMP_TOP = 24;

export function romanianTitleBlock(t: (key: RoCaption) => string, standard: GraphicStandard = DEFAULT_GRAPHIC_STANDARD): TitleBlockTemplate {
  const { titleOuter, titleDivider, titleRule } = standard.sheet;
  const type = standard.type;
  const { w, h } = TITLE_BLOCK_MM;
  const { a, b, c } = RO_COLUMNS;
  const row = 10;
  const mid = (c + w) / 2;
  let n = 0;
  const id = (): string => `tbro${++n}`;
  const items: TemplateItem[] = [{ id: id(), kind: 'rect', x: 0, y: 0, w, h, weight: titleOuter }];
  const line = (x1: number, y1: number, x2: number, y2: number, weight = titleRule): void => { items.push({ id: id(), kind: 'line', x1, y1, x2, y2, weight }); };
  /** A caption over its `{Param}`, in the cell whose top-left is (x, y) and which is `cw` wide. `size` is the value's letter height, `dy` where its baseline sits below the cell's top. */
  const cell = (caption: RoCaption, param: string, x: number, y: number, cw: number, o: { size?: number; dy?: number; bold?: boolean; fit?: number } = {}): void => {
    items.push({ id: id(), kind: 'text', x: x + 2, y: y + 3.2, size: type.caption, text: t(caption), muted: true, fit: cw - 4 });
    items.push({ id: id(), kind: 'text', x: x + 2, y: y + (o.dy ?? 8), size: o.size ?? type.value, text: `{${param}}`, fit: o.fit ?? cw - 4, ...(o.bold ? { bold: true } : {}) });
  };

  // Column dividers, and the rules between rows.
  line(b, 0, b, h, titleDivider);
  line(c, 0, c, h, titleDivider);
  for (const i of [1, 2, 3, 4]) line(a, row * i, b, row * i);
  for (const i of [1, 2, 3, 4]) line(b, row * i, c, row * i);
  line(b + (c - b) / 2, row * 4, b + (c - b) / 2, h);
  line(c, row, w, row);
  line(c, RO_STAMP_TOP, w, RO_STAMP_TOP);
  line(mid, RO_STAMP_TOP, mid, h);
  line(c + 25, 0, c + 25, row);
  line(c + 40, row, c + 40, RO_STAMP_TOP);

  // Left: who designs, what, where, for whom. The logo sits at the right of the first cell.
  cell('tbro.generalDesigner', 'Organisation', a, 0, b - a - 16);
  items.push({ id: id(), kind: 'logo', x: b - 15, y: 1, w: 14, h: 8 });
  cell('sheets.tb.project', 'Project', a, row, b - a);
  cell('sheets.tb.title', 'SheetName', a, row * 2, b - a);
  cell('sheets.tb.address', 'Address', a, row * 3, b - a);
  cell('sheets.tb.client', 'Client', a, row * 4, b - a);

  // Middle: the people who sign.
  cell('tbro.projectManager', 'ProjectManager', b, 0, c - b);
  cell('tbro.designer', 'DesignedBy', b, row, c - b);
  cell('sheets.tb.drawnBy', 'DrawnBy', b, row * 2, c - b);
  cell('sheets.tb.checkedBy', 'CheckedBy', b, row * 3, c - b);
  cell('sheets.tb.date', 'Date', b, row * 4, (c - b) / 2);
  cell('sheets.tb.revision', 'Revision', b + (c - b) / 2, row * 4, (c - b) / 2);

  // Right: phase and project number, sheet number and scale, the stamps.
  cell('tbro.phase', 'ProjectPhase', c, 0, 25);
  cell('tbro.projectNumber', 'ProjectNumber', c + 25, 0, w - c - 25);
  cell('sheets.tb.number', 'SheetNumber', c, row, 40, { size: type.number, dy: 12.6, bold: true });
  cell('sheets.tb.scale', 'Scale', c + 40, row, w - c - 40, { size: type.scale, dy: 12.6 });
  // The stamp boxes: a caption, and the rest of the box left empty.
  items.push({ id: id(), kind: 'text', x: c + 2, y: RO_STAMP_TOP + 3.2, size: type.caption, text: t('tbro.stampDesigner'), muted: true, fit: mid - c - 4 });
  items.push({ id: id(), kind: 'text', x: mid + 2, y: RO_STAMP_TOP + 3.2, size: type.caption, text: t('tbro.stampVerifier'), muted: true, fit: w - mid - 4 });
  return { items };
}
