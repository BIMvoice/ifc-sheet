/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The German building-application drawing set, "Bauantrag" (#372, Germany slice): the Bauvorlagen that the Länder's
 * Bauvorlagenverordnungen ask for, for the three Länder whose ordinance the research read in full: Bayern (BayBauVorlV),
 * Nordrhein-Westfalen (BauPrüfVO) and Baden-Württemberg (LBOVVO). Building law belongs to the Länder, so the Land is a
 * choice of the project and the one thing that changes the drawings: the Lageplan scale. Only what the research file
 * `permit-drawing-rules-europe.md` (section 2, Germany) tags READ is stated as fact; each item says so in `status`.
 *
 *   - Bauzeichnungen (floor plans of every storey, sections, elevations): 1:100 in all three (BayBauVorlV § 8, BauPrüfVO § 4,
 *     LBOVVO § 6, READ). Larger or smaller is allowed by the ordinances; the set draws 1:100.
 *   - Lageplan: Bayern not smaller than 1:1000 (BayBauVorlV § 7), NRW at least 1:500 (BauPrüfVO § 3), BW 1:500 for the drawn part
 *     (LBOVVO § 4), all READ. For any other Land nothing was read: the set draws 1:500, the model text's minimum
 *     (MBauVorlV § 7, a model, not law until a Land adopts it), and says the scale is unverified.
 *   - Abstandsflächen: in the Lageplan in Bayern (§ 7(3) no. 13) and NRW (§ 3(1) nos. 6, 12); in BW on a SEPARATE sheet
 *     (LBOVVO § 4(4)), which the BW set carries as the Abstandsflächenplan: the ground-floor cut a second time, on a sheet whose note says the Abstandsflächen are to be drawn in.
 *   - A row is `read` for a Land only where that Land's own text was read (BayBauVorlV, DBauV, BauPrüfVO, LBOVVO). A row that cites
 *     only the model text (MBauVorlV) is read for `other` and unverified for the three Länder.
 *   - The drawings are produced from the model; the plot, the distances, the Abstandsflächen, the calculations and the
 *     other documents are not, and the checklist says so.
 */

import { SET_PAPER } from './drawing-set.js';
import type { PaperSize, ProjectView } from './document.js';
import { pacCoverage, type PacCoverageSheet } from './pac-set.js';
import type { SetTemplate } from './set-template.js';

/** The Länder the set knows, and `other` for any other: nothing was read for it. */
export const GERMANY_LANDS = ['bayern', 'nrw', 'bw', 'other'] as const;
export type GermanyLand = (typeof GERMANY_LANDS)[number];

/** The scale of floor plans, sections and elevations: 1:100 in all three ordinances read (READ). */
export const GERMANY_DRAWING_SCALE = 100;

/**
 * The Lageplan scale per Land: Bayern 1:1000 (BayBauVorlV § 7: not smaller than 1:1000), NRW 1:500 (BauPrüfVO § 3: at least 1:500),
 * BW 1:500 (LBOVVO § 4). `other`: 1:500 is MBauVorlV § 7's minimum, a model text, so the scale is UNVERIFIED.
 */
export const GERMANY_SITE_SCALE: Readonly<Record<GermanyLand, number>> = { bayern: 1000, nrw: 500, bw: 500, other: 500 };

/** The papers a sheet steps up to when its drawings do not fit A2 at 1:100. */
export const GERMANY_STEP_UP: readonly PaperSize[] = ['A1', 'A0'];

/** How well the research backs an item: read in the official text, or not sourced. */
export type GermanyStatus = 'read' | 'unverified';

/** What the set draws an item from: the series whose sheets do, `site` for the Lageplan, `setback` for the separate Abstandsflächenplan sheet; null: the person supplies it. */
export type GermanyDrawnBy = 'plans' | 'elevations' | 'sections' | 'site' | 'setback' | null;

export interface GermanyItem {
  /** Stable; the catalogue key is `germany.item.<id>`. */
  id: string;
  /** Where the item comes from, as the research cites it, for this Land. */
  source: string;
  status: GermanyStatus;
  /** The scale (100 for 1:100) the set draws it at; null for what is not a scaled sheet. */
  scale: number | null;
  /** How well the research backs the SCALE, apart from the duty itself (`status`); null when there is no scale. */
  scaleStatus: GermanyStatus | null;
  drawnBy: GermanyDrawnBy;
}

type Sourced = Readonly<Record<GermanyLand, string>>;

const MODEL = 'MBauVorlV (model text, not law until a Land adopts it)';
/** Appended to a model-text citation given for a Land: the model is READ, the Land's own ordinance is not, so the row is unverified for that Land. */
const LAND_NOT_READ = ' (the model text; this Land\'s own ordinance was not read)';

interface Row {
  id: string;
  /** The source per Land; a Land missing here does not have the item. */
  source: Partial<Sourced>;
  /** The Länder whose item is not READ (default: all are). */
  unverified?: readonly GermanyLand[];
  /** The scale the set draws it at; `land` for the Lageplan, whose scale is the Land's. */
  scale?: number | 'land';
  drawnBy?: GermanyDrawnBy;
}

/**
 * The checklist rows, in the order the ordinances take the documents. The sources are per Land: the same duty sits at a
 * different paragraph in each.
 */
const ROWS: readonly Row[] = [
  // Floor plans of every storey, sections, elevations: BayBauVorlV § 8, BauPrüfVO § 4, LBOVVO § 6 (READ), MBauVorlV § 8 (the model).
  { id: 'plans', scale: GERMANY_DRAWING_SCALE, drawnBy: 'plans', source: { bayern: 'BayBauVorlV § 8: floor plans of all storeys, 1:100', nrw: 'BauPrüfVO § 4: floor plans of all storeys, 1:100', bw: 'LBOVVO § 6: floor plans of all storeys, 1:100', other: `${MODEL} § 8: floor plans of all storeys, at least 1:100` } },
  { id: 'sections', scale: GERMANY_DRAWING_SCALE, drawnBy: 'sections', source: { bayern: 'BayBauVorlV § 8: sections, 1:100', nrw: 'BauPrüfVO § 4: sections, 1:100', bw: 'LBOVVO § 6: sections, 1:100', other: `${MODEL} § 8: sections, at least 1:100` } },
  // What the sections must SHOW (heights) is not drawn by the set: BayBauVorlV § 8, BauPrüfVO § 4(3), LBOVVO § 6.
  { id: 'sectionHeights', source: { bayern: 'BayBauVorlV § 8: foundation, terrain, ground-floor level, clear heights, Wandhöhe (Art. 6(4) BayBO), roof pitch', nrw: 'BauPrüfVO § 4(3): ground-floor level to the official datum, terrain, top-floor height with calculation, clear heights, ridge heights, measure H', bw: 'LBOVVO § 6: storey and clear heights, stairs and ramps, terrain cuts', other: `${MODEL} § 8: foundation, terrain, ground-floor level, clear heights, Wandhöhe, roof pitch` } },
  { id: 'facades', scale: GERMANY_DRAWING_SCALE, drawnBy: 'elevations', source: { bayern: 'BayBauVorlV § 8: elevations, 1:100', nrw: 'BauPrüfVO § 4: elevations, 1:100', bw: 'LBOVVO § 6: elevations, 1:100', other: `${MODEL} § 8: elevations, at least 1:100` } },
  { id: 'facadeContent', source: { bayern: 'BayBauVorlV § 8: connection to neighbours, materials and colours, terrain, street gradient', nrw: 'BauPrüfVO § 4(4): existing and future terrain with datum height; 1:200 streetscape view where necessary', bw: 'LBOVVO § 6: connection to adjoining buildings, terrain, future terrain levels at wall corners, wall and ridge height', other: `${MODEL} § 8: connection to neighbours, materials and colours, terrain` } },
  // The Lageplan: its scale is the one thing that changes with the Land (READ for the three; UNVERIFIED for any other).
  { id: 'sitePlan', scale: 'land', drawnBy: 'site', source: { bayern: 'BayBauVorlV § 7: Lageplan not smaller than 1:1000', nrw: 'BauPrüfVO § 3: Lageplan at least 1:500', bw: 'LBOVVO § 4: Lageplan 1:500 for the drawn part', other: `${MODEL} § 7: Lageplan at least 1:500; the Land's own ordinance not read` } },
  { id: 'siteContent', source: { bayern: 'BayBauVorlV § 7(3): cadastral data, neighbouring plots, existing buildings, utilities, roads, planned building with distances', nrw: 'BauPrüfVO § 3(1): cadastral data, neighbouring plots, existing buildings with wall and ridge heights, planned building with distances', bw: 'LBOVVO § 4: cadastral data, neighbouring plots, existing buildings, planned building with distances', other: `${MODEL} § 7(2) to (4): cadastral data, neighbouring plots, existing buildings, planned building with distances` } },
  // Abstandsflächen: in the Lageplan in Bayern and NRW (the person draws them); in BW on a separate sheet (LBOVVO § 4(4)), which the set carries.
  { id: 'setbackAreas', source: { bayern: 'BayBauVorlV § 7(3) no. 13: distances and Abstandsflächen of planned and existing buildings, in the Lageplan', nrw: 'BauPrüfVO § 3(1) nos. 6 and 12: depth and width of the Abstandsflächen in the Lageplan, existing ones with calculation', other: `${MODEL} § 7: distances and Abstandsflächen in the Lageplan` } },
  { id: 'setbackSheet', drawnBy: 'setback', source: { bw: 'LBOVVO § 4(4): Abstandsflächen in the drawn Lageplan on a separate sheet' } },
  { id: 'setbackDeclaration', source: { bayern: 'BayBauVorlV § 3 no. 8: a declaration for taking over an Abstandsfläche is an extra document' } },
  // GRZ / GFZ / Baumasse: where a B-Plan sets one. The placement differs per Land. BauNVO §§ 19, 20 wording is a SNIPPET, so `other` is unverified.
  { id: 'useCalculation', unverified: ['other'], source: { bayern: 'BayBauVorlV § 3 no. 7: calculation of the permitted, existing and planned degree of building use where a B-Plan sets one (a document of its own)', nrw: 'BauPrüfVO § 3(2): Grundfläche, Geschossfläche, Vollgeschosse and Baumasse to show GRZ/GFZ/BMZ, added to the Lageplan inside a B-Plan area', bw: 'LBOVVO § 4(6) no. 6: calculation of land use by Grundflächen-, Geschossflächen- or Baumassenzahl, in the written part of the Lageplan where the B-Plan sets one', other: 'BauNVO §§ 19, 20: GRZ and GFZ where a B-Plan sets them; the Land\'s placement not read' } },
  { id: 'symbolsColours', source: { bayern: 'BayBauVorlV § 7(5), § 8(4): symbols and colours of Anlage 1', nrw: 'BauPrüfVO § 3(5), § 4(5): symbols and colours of the Anlage; PlanzV 90 for the Lageplan', bw: 'LBOVVO § 4(5), § 6(4): colours: new masonry red, new concrete pale green, existing grey, to demolish yellow', other: `${MODEL} § 7, § 8: symbols and colours as the Land prescribes` }, unverified: ['other'] },
  // File rules: READ for the Land only where its own text was read (Bayern DBauV § 11, BW LBOVVO § 3(2)); the rest cite the model text (MBauVorlV), READ as a model, so unverified for the Land.
  { id: 'scaleBar', unverified: ['nrw', 'bw'], source: { bayern: 'DBauV § 11(2): a graphic scale bar on the drawings', nrw: `${MODEL} § 3(2): a graphic scale bar beside the numeric scale on the Lageplan and every Bauzeichnung${LAND_NOT_READ}`, bw: `${MODEL} § 3(2): a graphic scale bar beside the numeric scale on the Lageplan and every Bauzeichnung${LAND_NOT_READ}`, other: `${MODEL} § 3(2): a graphic scale bar beside the numeric scale on the Lageplan and every Bauzeichnung` } },
  { id: 'pdfA', unverified: ['nrw'], source: { bayern: 'DBauV § 11: PDF, individual files, no attachments embedded, no security or write protection', nrw: `${MODEL} § 2: PDF/A (ISO 19005-1), no embedded attachments${LAND_NOT_READ}`, bw: 'LBOVVO § 3(2): electronic, PDF/A', other: `${MODEL} § 2: PDF/A (ISO 19005-1), no embedded attachments` } },
  { id: 'oneFile', unverified: ['nrw', 'bw'], source: { bayern: 'DBauV § 11: individual files', nrw: `${MODEL} § 2: each document its own file${LAND_NOT_READ}`, bw: `${MODEL} § 2: each document its own file${LAND_NOT_READ}`, other: `${MODEL} § 2: each document its own file` } },
  { id: 'fileName', unverified: ['bayern', 'nrw', 'bw'], source: { bayern: `${MODEL} § 2: file name states the content and the date as jjjjmmtt${LAND_NOT_READ}`, nrw: `${MODEL} § 2: file name states the content and the date as jjjjmmtt${LAND_NOT_READ}`, bw: `${MODEL} § 2: file name states the content and the date as jjjjmmtt${LAND_NOT_READ}`, other: `${MODEL} § 2: file name states the content and the date as jjjjmmtt` } },
  { id: 'designer', unverified: ['bayern', 'nrw', 'bw'], source: { bayern: `${MODEL} § 3(3): the Bauvorlagen name the Entwurfsverfasser${LAND_NOT_READ}`, nrw: `${MODEL} § 3(3): the Bauvorlagen name the Entwurfsverfasser${LAND_NOT_READ}`, bw: `${MODEL} § 3(3): the Bauvorlagen name the Entwurfsverfasser${LAND_NOT_READ}`, other: `${MODEL} § 3(3): the Bauvorlagen name the Entwurfsverfasser` } },
  // Not read: NRW's statewide e-filing duty, and the documents beyond the drawings.
  { id: 'nrwFiling', unverified: ['nrw'], source: { nrw: 'BauPrüfVO § 1(2) still says durable paper with § 3a VwVfG unaffected; whether electronic filing is mandatory statewide: not established' } },
  { id: 'otherDocuments', unverified: [...GERMANY_LANDS], source: { bayern: 'Baubeschreibung, Brandschutz- and Standsicherheitsnachweis, forms: not read', nrw: 'Baubeschreibung, Brandschutz- and Standsicherheitsnachweis, forms: not read', bw: 'Baubeschreibung, Brandschutz- and Standsicherheitsnachweis, forms: not read', other: 'Baubeschreibung, Brandschutz- and Standsicherheitsnachweis, forms: not read' } },
];

/** The checklist for a Land: its items with its paragraphs, the Lageplan scale and the items only it has. A project with no Land chosen reads as `other`. */
export function germanyItems(land: GermanyLand = 'other'): GermanyItem[] {
  return ROWS.flatMap((row): GermanyItem[] => {
    const source = row.source[land];
    if (source === undefined) return [];
    const status: GermanyStatus = row.unverified?.includes(land) ? 'unverified' : 'read';
    return [{
      id: row.id,
      source,
      status,
      scale: row.scale === 'land' ? GERMANY_SITE_SCALE[land] : row.scale ?? null,
      scaleStatus: row.scale === undefined ? null : row.scale === 'land' && land === 'other' ? 'unverified' : 'read',
      drawnBy: row.drawnBy ?? null,
    }];
  });
}

/** The names and notes the Germany sheets carry, in the language of the caller. */
export interface GermanySheetNames {
  name: string;
  plans: string;
  sections: string;
  elevations: string;
  /** The Lageplan; its name only, the notes are `siteNotes`. */
  site: string;
  /** Lines the Lageplan prints on itself: its scale and where it comes from, and what the person still has to draw in. */
  siteNotes: string[];
  /** The separate Abstandsflächenplan sheet (Baden-Württemberg only). */
  setback: string;
  setbackNotes: string[];
}

/**
 * The set template of the German Bauvorlagen drawings for a Land: the floor plans of every storey, the sections and the
 * elevations at 1:100, then the Lageplan at the Land's scale, and in Baden-Württemberg the Abstandsflächenplan on a sheet of its own.
 * The Lageplan is cut on the ground storey and takes the plot boundary and the distances in the app.
 */
export function germanySetTemplate(names: GermanySheetNames, land: GermanyLand): SetTemplate {
  // The scale is the ordinances' one, so the paper steps up rather than the scale changing (`SheetLayoutRule.stepUp`).
  const layout = { paper: SET_PAPER, orientation: 'landscape' as const, stepUp: [...GERMANY_STEP_UP] };
  const scale = GERMANY_DRAWING_SCALE;
  const siteScale = GERMANY_SITE_SCALE[land];
  return {
    name: names.name,
    schedules: [],
    annotations: {},
    sheets: [
      { name: names.plans, series: 'plans', layout, slots: [{ view: { kind: 'allPlans' }, scale }] },
      { name: names.sections, series: 'sections', layout, slots: [{ view: { kind: 'section', place: 0 }, scale }, { view: { kind: 'section', place: 1 }, scale }] },
      { name: names.elevations, series: 'elevations', layout, slots: (['north', 'east', 'south', 'west'] as const).map((direction) => ({ view: { kind: 'elevation', direction }, scale })) },
      { name: names.site, series: 'plans', layout, slots: [{ view: { kind: 'site' }, scale: siteScale }], notes: [...names.siteNotes] },
      ...(land === 'bw' ? [{ name: names.setback, series: 'plans' as const, layout, slots: [{ view: { kind: 'site' as const, nth: 1 }, scale: siteScale }], notes: [...names.setbackNotes] }] : []),
    ],
  };
}

export type GermanyState = 'yes' | 'no';

export interface GermanyCoverageRow {
  item: GermanyItem;
  /** The sheets draw it ('yes') or the person supplies it ('no'). */
  state: GermanyState;
  /** The model produces it and a sheet of the set shows it. Never true for the Lageplan or the Abstandsflächenplan: the sheet is made, its content is not. */
  drawn: boolean;
  /** The sheet of the Lageplan or the Abstandsflächenplan is made and placed; its content (plot, distances, Abstandsflächen) is still to be drawn in. False for every other item. */
  sheetMade: boolean;
  /** For the plans: the storeys with no plan on a sheet. */
  missingStoreys: string[];
}

/**
 * The checklist of a Land against a set. The plans, sections and elevations are read the way the PAC checklist reads them
 * (`pacCoverage`: a plan of EVERY storey). The Lageplan and the Baden-Württemberg Abstandsflächenplan are a site plan on a sheet,
 * the ground-floor cut only: the plot, the distances and the Abstandsflächen are not in the model, so they are never `drawn`;
 * `sheetMade` says the sheet is there.
 */
export function germanyCoverage(sheets: readonly PacCoverageSheet[], views: readonly ProjectView[], land: GermanyLand = 'other'): GermanyCoverageRow[] {
  const pac = new Map(pacCoverage(sheets, { views }).map((r) => [r.item.id, r]));
  const placed = new Set(sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const sitesPlaced = views.filter((v) => v.kind === 'plan' && v.site && placed.has(v.id)).length;
  return germanyItems(land).map((item): GermanyCoverageRow => {
    const row = item.drawnBy === 'site' || item.drawnBy === 'setback' ? undefined : pac.get(item.id);
    const sheetMade = item.drawnBy === 'site' ? sitesPlaced >= 1 : item.drawnBy === 'setback' ? sitesPlaced >= 2 : false;
    const drawn = item.drawnBy === 'site' || item.drawnBy === 'setback' ? false : row?.drawn === true;
    return { item, state: drawn ? 'yes' : 'no', drawn, sheetMade, missingStoreys: row?.missingStoreys ?? [] };
  });
}
