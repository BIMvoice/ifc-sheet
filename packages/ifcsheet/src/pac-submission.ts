/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The submission PDF of the Romanian permit project (PAC, Legea 169/2026 Anexa 2, #364): one file whose first page is
 * the opis, the list of the contents Anexa 2 names with, for each, its point number and whether this file holds it,
 * followed by the drawn sheets in set order.
 *
 * The opis is data (`pacOpis`) and a layout of it (`pacOpisTexts`, paper mm). The command line wraps the layout as a
 * sheet and hands the lot to the one PDF writer (`exportPdf`); the app's issued PDF draws the same texts on its own first
 * page. Both read this module, so the two pages cannot differ.
 *
 * What the text of the Code does not state is not encoded: the opis page is an A4 portrait page because the Code names
 * no format; no sheet order beyond the set's is imposed; and the file is not claimed to be PDF/A (neither exporter
 * writes one). The research file `ro-permit-requirements.md` (section 00) lists these as UNVERIFIED.
 */

import type { ProjectView } from './document.js';
import { pacCoverage, type PacCoverageSheet, type PacIntervention, type PacState } from './pac-set.js';
import { titleBlockOf } from './title-block-fields.js';
import { pacWordsFor, type PacWordKey } from './pac-words.js';
import type { SheetGraphic, SheetText } from './sheet-graphic.js';
import { textWidthEm, truncateToWidth } from './text-width.js';

/**
 * The ids of `PAC_ITEMS` in the order Anexa 2 numbers them: 1.1 to 1.3 the plans, 1.4.2 the memo, 1.4.3 the architecture
 * drawings, 1.4.4 the works on an existing building, 1.5 the utilities, 1.6.1 to 1.6.5 the specialty parts. (`PAC_ITEMS`
 * itself is grouped by kind, for the checklist.)
 */
export const PAC_OPIS_ORDER: readonly string[] = [
  'siteLocation', 'situationExisting', 'situationProposed', 'architectureMemo', 'plans', 'roof', 'facades', 'sections', 'context',
  'diagnosis', 'structuralExpertise', 'survey', 'utilities', 'specialtyMemos', 'neighbourExpertise', 'geotechnical', 'calculationBrief', 'engineeringDrawings',
];

export interface PacOpisRow {
  id: string;
  /** The Anexa 2 point, as the text numbers it. */
  point: string;
  name: string;
  /** The sheets of this file hold it, do not, or the Code does not ask for it in these works (`PacIntervention`). */
  state: PacState;
}

export interface PacOpis {
  title: string;
  law: string;
  project: string;
  head: { point: string; item: string; included: string };
  rows: PacOpisRow[];
  yes: string;
  no: string;
  na: string;
}

/** The sheets of the file, in page order after the opis: what they draw (their series and views), and the title block fields they say otherwise. */
export interface PacSheetRef extends PacCoverageSheet { titleBlock?: Record<string, string> }

/** What the opis is made from; the app and the command line both hand their project over in this shape. */
export interface PacProject {
  /** The project's name (the set's name on the command line). */
  name: string;
  sheets: readonly PacSheetRef[];
  views: readonly ProjectView[];
  /** The project's title block fields, as the sheets print them. */
  titleBlock?: Record<string, string>;
  /** The works; absent is a new building. */
  intervention?: PacIntervention;
}

/** The project name the opis carries: the title block's `project` field of the first sheet that has one, else the project's name. */
export function pacProjectName(project: Pick<PacProject, 'name' | 'sheets' | 'titleBlock'>): string {
  return project.sheets.map((s) => titleBlockOf(s, project.titleBlock, project.name).project).find((n) => n) || project.name;
}

/** The opis of a project, in the words of `locale`: the one function the app's issued PDF and `ifcsheet build --pac` both call. */
export function pacOpisOf(project: PacProject, locale: string): PacOpis {
  return pacOpis(project.sheets, locale, pacProjectName(project), { views: project.views, intervention: project.intervention });
}

/** The opis of a submission whose sheets are `sheets`, in the words of `locale`. */
export function pacOpis(sheets: readonly PacSheetRef[], locale: string, projectName: string, context: { views: readonly ProjectView[]; intervention?: PacIntervention }): PacOpis {
  const w = pacWordsFor(locale);
  const coverage = new Map(pacCoverage(sheets, context).map((r) => [r.item.id, r]));
  const rows = PAC_OPIS_ORDER.map((id): PacOpisRow => {
    const { item, state } = coverage.get(id)!;
    return { id, point: item.point, name: w[`pac.item.${id}` as PacWordKey], state };
  });
  return {
    title: w['pac.opis.title'], law: w['pac.opis.law'], project: projectName ? w['pac.opis.project'].replace('{name}', projectName) : '',
    head: { point: w['pac.opis.col.point'], item: w['pac.opis.col.item'], included: w['pac.opis.col.included'] },
    rows, yes: w['pac.opis.yes'], no: w['pac.opis.no'], na: w['pac.opis.na'],
  };
}

/** The opis page: A4 portrait, the one format the Code does not name but a list of this length needs. */
export const PAC_OPIS_PAPER = { w: 210, h: 297 } as const;

const MARGIN = 18;
const POINT_X = MARGIN;
const ITEM_X = 50;
const INCLUDED_X = PAC_OPIS_PAPER.w - MARGIN;
const SIZE = { title: 6, law: 3.6, body: 3.4 } as const;
const LINE = 4.6;
const ROW_GAP = 2.2;
/** The item column runs to here; the "included" column is right of it. */
const ITEM_WIDTH_MM = 108;

/** `text` broken at spaces into at most two lines of `maxMm` at `size`; the second ends in "…" when it still overflows. */
function twoLines(text: string, size: number, maxMm: number): string[] {
  const maxEm = maxMm / size;
  if (textWidthEm(text) <= maxEm) return [text];
  const words = text.split(' ');
  let first = '';
  let i = 0;
  while (i < words.length && textWidthEm(first ? `${first} ${words[i]}` : words[i]) <= maxEm) first = first ? `${first} ${words[i++]}` : words[i++];
  const rest = words.slice(i).join(' ');
  return [first || truncateToWidth(text, maxEm), ...(rest ? [textWidthEm(rest) <= maxEm ? rest : truncateToWidth(rest, maxEm)] : [])];
}

/** The opis page as texts on paper mm (y down): the title, the law, the project, the heading and a row per item. */
export function pacOpisTexts(opis: PacOpis): SheetText[] {
  const texts: SheetText[] = [];
  const put = (text: string, x: number, y: number, size: number, align?: 'center'): void => {
    if (text) texts.push({ at: { x, y }, text, size, ...(align ? { align } : {}) });
  };
  let y = MARGIN + SIZE.title;
  put(opis.title, MARGIN, y, SIZE.title);
  y += 8;
  put(opis.law, MARGIN, y, SIZE.law);
  y += 6;
  put(opis.project, MARGIN, y, SIZE.law);
  y += 12;
  put(opis.head.point, POINT_X, y, SIZE.body);
  put(opis.head.item, ITEM_X, y, SIZE.body);
  put(opis.head.included, INCLUDED_X - 11, y, SIZE.body, 'center');
  for (const row of opis.rows) {
    y += LINE + ROW_GAP;
    const lines = twoLines(row.name, SIZE.body, ITEM_WIDTH_MM);
    put(row.point, POINT_X, y, SIZE.body);
    lines.forEach((line, i) => put(line, ITEM_X, y + i * LINE, SIZE.body));
    put(opis[row.state === 'yes' ? 'yes' : row.state === 'no' ? 'no' : 'na'], INCLUDED_X - 11, y, SIZE.body, 'center');
    y += (lines.length - 1) * LINE;
  }
  return texts;
}

/** The opis as a sheet for the PDF writer: a page of texts, no frame or drawings. */
export function pacOpisSheet(opis: PacOpis): SheetGraphic {
  return {
    sheetId: 'pac-opis', number: '', name: opis.title, paper: { ...PAC_OPIS_PAPER },
    frame: [], fills: [], cut: [], lines: [], pens: [], symbols: { strokes: [], solids: [] }, marks: [], texts: pacOpisTexts(opis), images: [], underlays: [], viewports: [],
  };
}

/** The submission's pages: the opis first, then `sheets` in the order given. */
export function pacSubmissionSheets(sheets: readonly SheetGraphic[], project: PacProject, locale: string): SheetGraphic[] {
  return [pacOpisSheet(pacOpisOf(project, locale)), ...sheets];
}
