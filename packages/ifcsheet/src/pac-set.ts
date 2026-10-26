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

import { SET_PAPER } from './drawing-set.js';
import type { SetTemplate } from './set-template.js';

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
}

/** The items of Anexa 2 point 1, in the order the text lists them. Every `scales` is a quotation (see the research file, 00.1). */
export const PAC_ITEMS: readonly PacItem[] = [
  { id: 'siteLocation', point: '1.a, 1.1', kind: 'drawing', scales: [25000, 10000, 5000, 2000, 1000], drawnBy: null },
  { id: 'situationExisting', point: '1.b, 1.2', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'situationProposed', point: '1.c, 1.3', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'plans', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: 'plans' },
  { id: 'roof', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: null },
  { id: 'facades', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: 'elevations' },
  { id: 'sections', point: '1.4.3 a)', kind: 'drawing', scales: null, drawnBy: 'sections' },
  { id: 'context', point: '1.4.3 b)', kind: 'drawing', scales: null, drawnBy: null },
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
 * The set template that draws the architecture sheets of Anexa 2 point 1.4.3 a) from a model: the floor plans, the
 * facades and the main sections, none at a forced scale. A rule a building cannot meet (no first floor) is skipped and
 * said, as for every set template.
 */
export function pacSetTemplate(names: PacSheetNames): SetTemplate {
  const layout = { paper: SET_PAPER, orientation: 'landscape' as const };
  return {
    name: names.name,
    schedules: [],
    annotations: {},
    sheets: [
      { name: names.plans, series: 'plans', layout, slots: [{ view: { kind: 'plan', storey: 0 } }, { view: { kind: 'plan', storey: 1 } }] },
      { name: names.facades, series: 'elevations', layout, slots: (['north', 'east', 'south', 'west'] as const).map((direction) => ({ view: { kind: 'elevation', direction } })) },
      { name: names.sections, series: 'sections', layout, slots: [{ view: { kind: 'section', place: 0 } }, { view: { kind: 'section', place: 1 } }] },
    ],
  };
}

/** Whether `scale` (50 for 1:50) is one Anexa 2 allows for the item; true when the text states none. */
export function pacScaleAllowed(item: Pick<PacItem, 'scales'>, scale: number): boolean {
  return item.scales === null || item.scales.includes(scale);
}

export interface PacCoverageRow {
  item: PacItem;
  /** The set draws it: a sheet of the series that draws it exists. */
  drawn: boolean;
}

/** The checklist against a set: which Anexa 2 items the sheets already draw. Items to be supplied are never "drawn". */
export function pacCoverage(sheets: readonly { series?: string }[], items: readonly PacItem[] = PAC_ITEMS): PacCoverageRow[] {
  return items.map((item) => ({ item, drawn: item.drawnBy !== null && sheets.some((s) => s.series === item.drawnBy) }));
}
