/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Romanian permit project, "proiectul pentru autorizarea construirii" (PAC), under Legea 169/2026
 * (Codul amenajării teritoriului, urbanismului și construcțiilor), Anexa 2 "Conținutul-cadru al proiectului pentru
 * autorizarea construirii" (#364). DTAC under Legea 50/1991 is the name it had before 2026-08-25.
 *
 * Only what the Anexa 2 text states is encoded; the research file `ro-permit-requirements.md` (section 00) holds the
 * quotes. What it does not state is left out on purpose:
 *   - architecture drawings (plans, roof, facades, sections) have NO numeric scale, only "o scară adecvată": the set
 *     template below asks for none, so each sheet takes the scale the automatic set chooses;
 *   - the paper format and the binding order of the sheets are not stated anywhere in the Code: the template uses the
 *     automatic set's paper (`SET_PAPER`) and lists the sheets in the order of Anexa 2 point 1 only.
 *
 * Numeric scales are stated for four sheets the viewer does not draw from the model (the încadrare, the two situation
 * plans, the utility plan); they are listed in the checklist with their READ scales, as items to be supplied.
 */

import type { ProjectView } from './document.js';
import { SET_PAPER } from './drawing-set.js';
import { allPlans, type SetTemplate } from './set-template.js';
import { sameElevation } from './view-defaults.js';

/**
 * What the works are, which decides which items of Anexa 2 apply. The Code distinguishes the cases itself:
 *   - a new building: everything in point 1 applies except 1.4.4, which is for "proiectul de intervenție asupra clădirilor
 *     existente";
 *   - an intervention on an existing building: 1.4.4 a) to d) are added (1.4.4: "În cazul proiectului de intervenție
 *     asupra clădirilor existente, documentațiile grafice și fotografice vor fi completate de: a) analiza diagnostic ...
 *     b) evaluarea/expertizarea tehnică ... c) expertiza tehnică ... d) releveul detaliat ...");
 *   - an interior-only intervention (still on an existing building, so 1.4.4 applies), where the last sentence of 1.4.4
 *     lifts part of the rest: "În cazul intervențiilor numai la interior nu mai sunt necesare documentele privind
 *     inserarea în sit, volumetria, planul acoperișului/terasei, fațadele, documentațiile grafice sau fotografice
 *     privind încadrarea/inserția."
 * That sentence closes point 1.4, "proiectul de arhitectură", and lists architecture documents: the items it lifts are those
 * of 1.4 it names, the roof and terrace plan, the facades and the graphic and photo documentation of the insertion and
 * context (1.4.3 b). "Inserarea în sit" and "volumetria" have no item of their own in 1.4. The situation plans (1.b and
 * 1.c, detailed in 1.2 and 1.3) and the location plan (1.a, 1.1) are separate top-level items of point 1, outside 1.4,
 * so they stay required. The floor plans, sections and utility plan stay required too.
 */
export type PacIntervention = 'new' | 'existing' | 'interior';
export const PAC_INTERVENTIONS: readonly PacIntervention[] = ['new', 'existing', 'interior'];
export const PAC_DEFAULT_INTERVENTION: PacIntervention = 'new';

/** How an Anexa 2 item reaches the filing. */
export type PacKind = 'drawing' | 'written' | 'existingBuilding';

export interface PacItem {
  /** Stable; the catalogue key is `pac.item.<id>`. */
  id: string;
  /** The Anexa 2 point the item comes from, as the text numbers it. */
  point: string;
  kind: PacKind;
  /**
   * The scales (the 25000 of 1:25.000) Anexa 2 allows for the sheet, "după caz": null when the text names none. A
   * drawing with null is drawn "la o scară adecvată", or is not a scaled drawing.
   */
  scales: readonly number[] | null;
  /** The series of the set (`RuledSeries`) whose sheets draw it from the model, else null: the person supplies it. */
  drawnBy: 'plans' | 'elevations' | 'sections' | null;
  /** The last sentence of 1.4.4 lifts the item for an interior-only intervention (see `PacIntervention`). */
  notForInterior?: true;
}

/** The items of Anexa 2 point 1, in the order the text lists them. Every `scales` is a quotation (see the research file, 00.1). */
export const PAC_ITEMS: readonly PacItem[] = [
  { id: 'siteLocation', point: '1.a, 1.1', kind: 'drawing', scales: [25000, 10000, 5000, 2000, 1000], drawnBy: null },
  { id: 'situationExisting', point: '1.b, 1.2', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'situationProposed', point: '1.c, 1.3', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'plans', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: 'plans' },
  { id: 'roof', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: null, notForInterior: true },
  { id: 'facades', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: 'elevations', notForInterior: true },
  { id: 'sections', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: 'sections' },
  { id: 'context', point: '1.4.3 b)', kind: 'drawing', scales: null, drawnBy: null, notForInterior: true },
  { id: 'utilities', point: '1.5', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'engineeringDrawings', point: '1.6.5', kind: 'drawing', scales: null, drawnBy: null },
  { id: 'architectureMemo', point: '1.4.2', kind: 'written', scales: null, drawnBy: null },
  { id: 'specialtyMemos', point: '1.6.1', kind: 'written', scales: null, drawnBy: null },
  { id: 'neighbourExpertise', point: '1.6.2', kind: 'written', scales: null, drawnBy: null },
  { id: 'geotechnical', point: '1.6.3', kind: 'written', scales: null, drawnBy: null },
  { id: 'calculationBrief', point: '1.6.4', kind: 'written', scales: null, drawnBy: null },
  { id: 'diagnosis', point: '1.4.4 a)', kind: 'existingBuilding', scales: null, drawnBy: null },
  { id: 'structuralExpertise', point: '1.4.4 b), c)', kind: 'existingBuilding', scales: null, drawnBy: null },
  { id: 'survey', point: '1.4.4 d)', kind: 'existingBuilding', scales: null, drawnBy: null },
];

/** The names the PAC sheets carry, in the language of the caller. */
export interface PacSheetNames {
  name: string;
  plans: string;
  facades: string;
  sections: string;
}

/**
 * The set template that draws the architecture sheets of Anexa 2 point 1.4.3 a) from a model: the floor plans of EVERY
 * storey the model has ("planurile tuturor nivelurilor"; the rule `allPlans` finds as many as there are), the facades
 * and the main sections, none at a forced scale. A rule a building cannot meet (one section only) is skipped and said,
 * as for every set template.
 */
export function pacSetTemplate(names: PacSheetNames): SetTemplate {
  const layout = { paper: SET_PAPER, orientation: 'landscape' as const };
  return {
    name: names.name,
    schedules: [],
    annotations: {},
    sheets: [
      { name: names.plans, series: 'plans', layout, slots: [{ view: { kind: 'allPlans' } }] },
      { name: names.facades, series: 'elevations', layout, slots: (['north', 'east', 'south', 'west'] as const).map((direction) => ({ view: { kind: 'elevation', direction } })) },
      { name: names.sections, series: 'sections', layout, slots: [{ view: { kind: 'section', place: 0 } }, { view: { kind: 'section', place: 1 } }] },
    ],
  };
}

/** Whether `scale` (50 for 1:50) is one Anexa 2 allows for the item; true when the text states none. */
export function pacScaleAllowed(item: Pick<PacItem, 'scales'>, scale: number): boolean {
  return item.scales === null || item.scales.includes(scale);
}

/** How the filing stands on an item: held by the sheets, not held, or the Code does not ask for it in this case. */
export type PacState = 'yes' | 'no' | 'na';

export interface PacCoverageRow {
  item: PacItem;
  state: PacState;
  /** The set draws it (`state` is 'yes'). */
  drawn: boolean;
  /** For the floor plans: the storeys (level names, lowest first) with no plan placed on a sheet. Empty for every other item. */
  missingStoreys: string[];
}

/** A sheet as coverage reads it: what series it is, and which views it shows. */
export interface PacCoverageSheet {
  series?: string;
  viewports?: readonly { viewId: string }[];
}

export interface PacCoverageContext {
  /** The project's views: a floor plan is matched to its storey through its view, not through the series of the sheet it is on. */
  views: readonly ProjectView[];
  /** The works; absent is a new building. */
  intervention?: PacIntervention;
}

/** Whether Anexa 2 asks for the item for these works; the one place the rules of `PacIntervention` are applied. */
export function pacApplies(item: Pick<PacItem, 'kind' | 'notForInterior'>, intervention: PacIntervention): boolean {
  if (item.kind === 'existingBuilding') return intervention !== 'new';
  return !(item.notForInterior && intervention === 'interior');
}

/**
 * The checklist against a set: which Anexa 2 items the sheets already draw. Items to be supplied are never "drawn".
 * "Planurile tuturor nivelurilor" (1.4.3 a) is held only when EVERY storey of the building has a plan placed on a sheet;
 * otherwise `missingStoreys` names the ones that have not.
 */
export function pacCoverage(sheets: readonly PacCoverageSheet[], context: PacCoverageContext, items: readonly PacItem[] = PAC_ITEMS): PacCoverageRow[] {
  const intervention = context.intervention ?? PAC_DEFAULT_INTERVENTION;
  const placed = new Set(sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const storeys = allPlans(context.views);
  const missingStoreys = storeys.filter((plan) => !context.views.some((v) => v.kind === 'plan' && !v.site && !v.detail && !v.discipline && !v.reflected && sameElevation(v.level.elevation, plan.level.elevation) && placed.has(v.id))).map((plan) => plan.level.name);
  return items.map((item): PacCoverageRow => {
    if (!pacApplies(item, intervention)) return { item, state: 'na', drawn: false, missingStoreys: [] };
    if (item.drawnBy === 'plans') {
      const state: PacState = storeys.length > 0 && missingStoreys.length === 0 ? 'yes' : 'no';
      return { item, state, drawn: state === 'yes', missingStoreys };
    }
    const drawn = item.drawnBy !== null && sheets.some((s) => s.series === item.drawnBy);
    return { item, state: drawn ? 'yes' : 'no', drawn, missingStoreys: [] };
  });
}
