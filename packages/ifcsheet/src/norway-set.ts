/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Norwegian building-permit drawing set, "byggesak" (#372, Norway slice 2): the drawings SAK10 § 5-4 third paragraph
 * letter m asks for, "tegninger og målsatt situasjonsplan", with what DiBK's guidance says they show. Only what the
 * research file `permit-drawing-rules-europe.md` (section 1, Norway) tags READ is stated as fact; each item says so in
 * `status`, and the ones the research could not source are `unverified` and are shown as such, never as a rule.
 *
 *   - plans, sections and facades: "normal detaljeringsgrad og målestokk 1:100" (DiBK guidance to § 5-4, and DiBK
 *     "Steg 4", READ). The set draws them at 1:100; a building that does not fit the paper at 1:100 is rescaled and said,
 *     as for every set template.
 *   - the situasjonsplan: SAK10 § 5-4 requires it ("målsatt situasjonsplan", READ) but NO scale is stated on the official
 *     pages read, so only the scale is UNVERIFIED (`scaleStatus`); the duty itself is READ. The set draws it at 1:500, which a municipal guide calls usual (not a
 *     source), and the sheet says so (`NORWAY_SITE_SCALE`).
 *   - The drawings are produced from the model; the written application and the BIM delivery (ByggesaksBIM) are not part
 *     of this set.
 */

import { SET_PAPER } from './drawing-set.js';
import type { PaperSize, ProjectView } from './document.js';
import { pacCoverage, type PacCoverageSheet } from './pac-set.js';
import type { SetTemplate } from './set-template.js';

/** The scale of plans, sections and facades: "målestokk 1:100" (DiBK § 5-4 guidance and "Steg 4", READ). */
export const NORWAY_DRAWING_SCALE = 100;
/** The scale the situasjonsplan is drawn at. UNVERIFIED: the draft rules and the DiBK pages set none; 1:500 is what a municipal guide calls typical. */
export const NORWAY_SITE_SCALE = 500;

/** The papers a sheet steps up to when its drawings do not fit A2 at 1:100. */
export const NORWAY_STEP_UP: readonly PaperSize[] = ['A1', 'A0'];

/** How well the research backs an item: read in the official text, or not sourced. */
export type NorwayStatus = 'read' | 'unverified';

/** The series of the set whose sheets draw an item from the model, `site` for the situasjonsplan; null: the person supplies it. */
export type NorwayDrawnBy = 'plans' | 'elevations' | 'sections' | 'site' | null;

export interface NorwayItem {
  /** Stable; the catalogue key is `norway.item.<id>`. */
  id: string;
  /** Where the item comes from, as the research cites it. */
  source: string;
  status: NorwayStatus;
  /** The scale (100 for 1:100) the set draws it at; null for what is not a scaled sheet. */
  scale: number | null;
  /** How well the research backs the SCALE, apart from the duty itself (`status`); null when there is no scale. */
  scaleStatus: NorwayStatus | null;
  drawnBy: NorwayDrawnBy;
}

/** The checklist, in the order DiBK's guidance takes the drawings. */
export const NORWAY_ITEMS: readonly NorwayItem[] = [
  // SAK10 § 5-4 third paragraph letter m: "tegninger og målsatt situasjonsplan" (READ, lovdata.no). The first paragraph
  // of § 5-4 makes each item apply only where relevant and necessary for the case.
  // The three views are drawn from the model; what DiBK says they must SHOW (room use, floor heights, terrain) is not, and is
  // its own item below, so a view on a sheet never reads as that content being there.
  { id: 'plans', source: 'SAK10 § 5-4 (3) m; DiBK guidance to § 5-4 and "Steg 4": one plan per floor, scale 1:100', status: 'read', scale: NORWAY_DRAWING_SCALE, scaleStatus: 'read', drawnBy: 'plans' },
  { id: 'roomUse', source: 'DiBK guidance to § 5-4 and "Steg 4": room sizes and intended use of each room on the plans', status: 'read', scale: null, scaleStatus: null, drawnBy: null },
  { id: 'sections', source: 'DiBK guidance to § 5-4 and "Steg 4": lengthwise and crosswise, scale 1:100', status: 'read', scale: NORWAY_DRAWING_SCALE, scaleStatus: 'read', drawnBy: 'sections' },
  { id: 'floorHeights', source: 'DiBK guidance to § 5-4 and "Steg 4": the height of each floor on the sections', status: 'read', scale: null, scaleStatus: null, drawnBy: null },
  { id: 'facades', source: 'DiBK "Steg 4": all sides of the building, scale 1:100', status: 'read', scale: NORWAY_DRAWING_SCALE, scaleStatus: 'read', drawnBy: 'elevations' },
  { id: 'facadeTerrain', source: 'DiBK "Steg 4": the terrain around the building before and after the work on the facades', status: 'read', scale: null, scaleStatus: null, drawnBy: null },
  // "Hovedmål på tiltaket må påføres planer og snitt" (DiBK guidance to § 5-4, READ).
  { id: 'mainDimensions', source: 'DiBK guidance to § 5-4: "Hovedmål på tiltaket må påføres planer og snitt"', status: 'read', scale: null, scaleStatus: null, drawnBy: null },
  // "målsatt situasjonsplan" is a READ legal duty; only its scale is not (see NORWAY_SITE_SCALE), hence `scaleStatus`.
  // The sheet is the ground storey's cut: the plot, the distances and the terrain are the items that follow.
  { id: 'sitePlan', source: 'SAK10 § 5-4 (3) m: "målsatt situasjonsplan"; scale not stated', status: 'read', scale: NORWAY_SITE_SCALE, scaleStatus: 'unverified', drawnBy: 'site' },
  // Letters i and j of § 5-4 third paragraph, and "Minste avstand til eiendomsgrense og senterlinje vei må påføres" (DiBK guidance, READ).
  { id: 'siteDistances', source: 'SAK10 § 5-4 (3) i, j; DiBK guidance to § 5-4: shortest distance to property boundary, road centreline, nearest building on the property and nearest neighbouring building', status: 'read', scale: null, scaleStatus: null, drawnBy: null },
  // "nye terrenglinjer" on the site plan (DiBK "Steg 4", READ).
  { id: 'terrainLines', source: 'DiBK guidance to § 5-4 and "Steg 4": new terrain lines on the site plan', status: 'read', scale: null, scaleStatus: null, drawnBy: null },
  // Neighbour notification: "Målsatt situasjonsplan, snitt- og fasadetegninger skal vedlegges varselet" (SAK10 § 5-2 (2), READ).
  { id: 'neighbourNotice', source: 'SAK10 § 5-2 (2): site plan, sections and facades attached to the neighbour notification', status: 'read', scale: null, scaleStatus: null, drawnBy: null },
  // Eave and ridge height as mandatory drawing annotations: the DiBK pages read do not name them; only the draft §§ 5-9/5-10 (not in force) list them.
  { id: 'eaveRidgeHeights', source: 'only the draft §§ 5-9/5-10 (consultation 2026, not in force); not on the DiBK pages read', status: 'unverified', scale: null, scaleStatus: null, drawnBy: null },
];

/** The names and notes the Norway sheets carry, in the language of the caller. */
export interface NorwaySheetNames {
  name: string;
  plans: string;
  sections: string;
  facades: string;
  /** The situasjonsplan; its name only, the notes are `siteNotes`. */
  site: string;
  /** Lines the situasjonsplan prints on itself: that its scale is not set by the regulation and 1:500 is usual, and what the person still has to draw in. */
  siteNotes: string[];
}

/**
 * The set template of the Norwegian permit drawings: the plans of every storey, the sections and the four facades at
 * 1:100, then the situasjonsplan at 1:500 (UNVERIFIED, see the file comment). The site plan is cut on the ground storey
 * and takes the plot boundary and the distances in the app; the set makes the sheet.
 */
export function norwaySetTemplate(names: NorwaySheetNames): SetTemplate {
  // The scale is the regulation's "normal" one, so the paper steps up rather than the scale changing (`SheetLayoutRule.stepUp`).
  const layout = { paper: SET_PAPER, orientation: 'landscape' as const, stepUp: [...NORWAY_STEP_UP] };
  const scale = NORWAY_DRAWING_SCALE;
  // Marks. Site plan north arrow: SOURCED, the situasjonskart a situasjonsplan is built on "skal merkes med nordpil" (draft SAK
  // § 5-8 f, consultation of 30.04.2026, NOT in force). Everything else is CONVENTION, not required by SAK10 § 5-4 or the DiBK
  // pages (they ask for the scale, not for a scale bar or a north arrow on the building drawings): a north arrow on the floor
  // plans, a scale bar on every scaled view.
  const plan = { scaleBar: true, northArrow: true };
  const scaled = { scaleBar: true };
  return {
    name: names.name,
    schedules: [],
    annotations: {},
    sheets: [
      { name: names.plans, series: 'plans', layout, slots: [{ view: { kind: 'allPlans' }, scale, ...plan }] },
      { name: names.sections, series: 'sections', layout, slots: [{ view: { kind: 'section', place: 0 }, scale, ...scaled }, { view: { kind: 'section', place: 1 }, scale, ...scaled }] },
      { name: names.facades, series: 'elevations', layout, slots: (['north', 'east', 'south', 'west'] as const).map((direction) => ({ view: { kind: 'elevation', direction }, scale, ...scaled })) },
      { name: names.site, series: 'plans', layout, slots: [{ view: { kind: 'site' }, scale: NORWAY_SITE_SCALE, ...plan }], notes: [...names.siteNotes] },
    ],
  };
}

export type NorwayState = 'yes' | 'no';

export interface NorwayCoverageRow {
  item: NorwayItem;
  /** The sheets draw it ('yes') or the person supplies it ('no'). */
  state: NorwayState;
  drawn: boolean;
  /** For the plans: the storeys with no plan on a sheet. */
  missingStoreys: string[];
}

/**
 * The checklist against a set. The plans, sections and facades are read the way the PAC checklist reads them
 * (`pacCoverage`: a plan of EVERY storey), and the situasjonsplan is held when a site plan is placed on a sheet.
 */
export function norwayCoverage(sheets: readonly PacCoverageSheet[], views: readonly ProjectView[]): NorwayCoverageRow[] {
  const pac = new Map(pacCoverage(sheets, { views }).map((r) => [r.item.id, r]));
  const placed = new Set(sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const siteDrawn = views.some((v) => v.kind === 'plan' && v.site && placed.has(v.id));
  return NORWAY_ITEMS.map((item): NorwayCoverageRow => {
    const row = item.drawnBy === 'site' ? undefined : pac.get(item.id);
    const drawn = item.drawnBy === 'site' ? siteDrawn : row?.drawn === true;
    return { item, state: drawn ? 'yes' : 'no', drawn, missingStoreys: row?.missingStoreys ?? [] };
  });
}
