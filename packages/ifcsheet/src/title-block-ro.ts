/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block of Romanian practice (cartuș), as a layout in the block's
 * 180 x 50 mm (`TITLE_BLOCK_MM`), so it sits in the frame at every paper size
 * and in both positions like the standard one. It carries the data of the
 * informative model F_01 of Ordinul MDLPA 975/2026, Anexa 4 (the layout of the
 * model is "informativ"; the data are required), in six rows:
 *
 *   - left: proiectant general (with the logo), registration or authorisation
 *     number, beneficiar, project title, site address;
 *   - middle: șef proiect, proiectat and desenat, each with name, professional
 *     title and an empty "Semnătura" box; the capacity of the authors (for
 *     firms); the verifier / expert with name, capacity and signature box, and
 *     the requirement (cerința) verified with the report's number and date;
 *   - right: phase and project number, date and revision, sheet number and
 *     scale, sheet title.
 *
 * F_01 names no stamp, so there is none: the empty boxes are for signatures.
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
  'tbro.registration': 'Registration / authorisation no.',
  'tbro.projectTitle': 'Project title',
  'tbro.projectManager': 'Project manager',
  'tbro.designer': 'Designed by',
  'tbro.professionalTitle': 'Professional title',
  'tbro.signature': 'Signature',
  'tbro.capacity': 'Capacity of the authors',
  'tbro.verifier': 'Verifier / expert',
  'tbro.verifierCapacity': 'Capacity',
  'tbro.requirement': 'Requirement',
  'tbro.report': 'Report / expertise no.',
  'tbro.reportDate': 'Report date',
  'tbro.phase': 'Phase',
  'tbro.projectNumber': 'Project no.',
  'tbro.sheetNumber': 'Sheet no.',
} as const;
export type RoOnlyCaption = keyof typeof RO_ONLY_CAPTIONS_EN;
/** Every caption the Romanian layout prints. */
export type RoCaption = RoOnlyCaption | StandardCaption;

/** The Romanian layout's captions in Romanian (F_01's words where it has them; the app's glossary, `i18n/ro-glossary.md`, for the rest), for the layout in the app's Romanian and for the command line. */
export const TITLE_BLOCK_CAPTIONS_RO: Record<RoCaption, string> = {
  'tbro.generalDesigner': 'Proiectant general',
  'tbro.registration': 'Nr. înmatriculare / autorizație',
  'tbro.projectTitle': 'Titlu proiect',
  'tbro.projectManager': 'Șef proiect',
  'tbro.designer': 'Proiectat',
  'tbro.professionalTitle': 'Titlu profesional',
  'tbro.signature': 'Semnătura',
  'tbro.capacity': 'Calitatea elaboratorilor',
  'tbro.verifier': 'Verificator / expert',
  'tbro.verifierCapacity': 'Calitatea',
  'tbro.requirement': 'Cerința',
  'tbro.report': 'Referat / expertiză nr.',
  'tbro.reportDate': 'Data',
  'tbro.phase': 'Faza',
  'tbro.projectNumber': 'Proiect nr.',
  'tbro.sheetNumber': 'Planșa nr.',
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

/** The columns' left edges and the right edge, mm: left (firm, project), middle (who signs, who verifies), right (numbers, sheet). */
export const RO_COLUMNS = { a: 0, b: 62, c: 138, end: TITLE_BLOCK_MM.w } as const;
/** The block has six rows. */
export const RO_ROWS = 6;

export function romanianTitleBlock(t: (key: RoCaption) => string, standard: GraphicStandard = DEFAULT_GRAPHIC_STANDARD): TitleBlockTemplate {
  const { titleOuter, titleDivider, titleRule } = standard.sheet;
  const type = standard.type;
  const { w, h } = TITLE_BLOCK_MM;
  const { a, b, c } = RO_COLUMNS;
  const row = h / RO_ROWS;
  let n = 0;
  const id = (): string => `tbro${++n}`;
  const items: TemplateItem[] = [{ id: id(), kind: 'rect', x: 0, y: 0, w, h, weight: titleOuter }];
  const line = (x1: number, y1: number, x2: number, y2: number, weight = titleRule): void => { items.push({ id: id(), kind: 'line', x1, y1, x2, y2, weight }); };
  const hline = (y: number, x1: number, x2: number): void => line(x1, y, x2, y);
  const vline = (x: number, r1: number, r2: number): void => line(x, row * r1, x, row * r2);
  /** A caption, and over `{Param}` below it when there is one, in the cell whose top-left is (x, y) and which is `cw` wide; a cell without a param is a box left empty. `size` is the value's letter height, `dy` where its baseline sits below the cell's top. */
  const cell = (caption: RoCaption, param: string | null, x: number, y: number, cw: number, o: { size?: number; dy?: number; bold?: boolean; fit?: number; rows?: number } = {}): void => {
    items.push({ id: id(), kind: 'text', x: x + 2, y: y + 2.9, size: type.caption, text: t(caption), muted: true, fit: cw - 4 });
    if (param === null) return;
    items.push({ id: id(), kind: 'text', x: x + 2, y: y + (o.dy ?? row - 1.4), size: o.size ?? type.value, text: `{${param}}`, fit: o.fit ?? cw - 4, ...(o.bold ? { bold: true } : {}) });
  };

  // Column dividers.
  line(b, 0, b, h, titleDivider);
  line(c, 0, c, h, titleDivider);

  // Left: who designs (with the logo at the right of the firm's two rows), their registration, for whom, what, where.
  for (const r of [2, 3, 4, 5]) hline(row * r, a, b);
  cell('tbro.generalDesigner', 'Organisation', a, 0, b - a, { dy: row * 2 - 2, fit: b - a - 4 - 17 });
  items.push({ id: id(), kind: 'logo', x: b - 17, y: 1.5, w: 15, h: row * 2 - 3 });
  cell('tbro.registration', 'RegistrationNumber', a, row * 2, b - a);
  cell('sheets.tb.client', 'Client', a, row * 3, b - a);
  cell('tbro.projectTitle', 'Project', a, row * 4, b - a);
  cell('sheets.tb.address', 'Address', a, row * 5, b - a);

  // Middle: șef proiect, proiectat, desenat (name, professional title, signature); the authors' capacity; the verifier.
  const m1 = b + 26;
  const m2 = m1 + 26;
  for (const r of [1, 2, 3, 4, 5]) hline(row * r, b, c);
  for (const x of [m1, m2]) { vline(x, 0, 3); vline(x, 4, 5); }
  vline(b + 17, 5, 6);
  vline(m2, 5, 6);
  const people: [RoCaption, string, string][] = [
    ['tbro.projectManager', 'ProjectManager', 'ProjectManagerTitle'], ['tbro.designer', 'DesignedBy', 'DesignedByTitle'], ['sheets.tb.drawnBy', 'DrawnBy', 'DrawnByTitle'],
  ];
  people.forEach(([role, name, title], i) => {
    cell(role, name, b, row * i, m1 - b);
    cell('tbro.professionalTitle', title, m1, row * i, m2 - m1);
    cell('tbro.signature', null, m2, row * i, c - m2);
  });
  cell('tbro.capacity', 'AuthorsCapacity', b, row * 3, c - b);
  cell('tbro.verifier', 'CheckedBy', b, row * 4, m1 - b);
  cell('tbro.verifierCapacity', 'VerifierCapacity', m1, row * 4, m2 - m1);
  cell('tbro.signature', null, m2, row * 4, c - m2);
  cell('tbro.requirement', 'VerifierRequirement', b, row * 5, 17);
  cell('tbro.report', 'ReportNumber', b + 17, row * 5, m2 - b - 17);
  cell('tbro.reportDate', 'ReportDate', m2, row * 5, c - m2);

  // Right: phase and project number, date and revision, sheet number and scale, the sheet's title.
  const big = row * 2 - 2.2;
  hline(row, c, w); hline(row * 2, c, w); hline(row * 4, c, w);
  vline(c + 16, 0, 1);
  vline(c + 24, 1, 2);
  vline(c + 20, 2, 4);
  cell('tbro.phase', 'ProjectPhase', c, 0, 16);
  cell('tbro.projectNumber', 'ProjectNumber', c + 16, 0, w - c - 16);
  cell('sheets.tb.date', 'Date', c, row, 24);
  cell('sheets.tb.revision', 'Revision', c + 24, row, w - c - 24);
  cell('tbro.sheetNumber', 'SheetNumber', c, row * 2, 20, { size: type.number, dy: big, bold: true });
  cell('sheets.tb.scale', 'Scale', c + 20, row * 2, w - c - 20, { size: type.scale, dy: big });
  cell('sheets.tb.title', 'SheetName', c, row * 4, w - c, { size: type.scale, dy: big, bold: true });
  return { items };
}
