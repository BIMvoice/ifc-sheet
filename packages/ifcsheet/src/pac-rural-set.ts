/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The simplified permit project for a rural single-family house (maximum P + M, at most 150 mp built developed area),
 * Legea 169/2026 Anexa 3 (#364). It builds on `pac-set.ts`: the same item shape, the same coverage check.
 *
 * Only what the Anexa 3 text states is encoded:
 *   - point 8 a) draws the plans of all levels, the roof plans, the facades and the main sections "la o scară adecvată
 *     1:50", so the drawing slots below ask for 1:50;
 *   - the three situation plans (points 2, 3, 4) are "1:1.000 sau 1:500"; the plan de încadrare (1 a) names no scale;
 *   - the paper is not stated by the text; 1:50 does not fit the automatic set's A2 for a house with several views per
 *     sheet (AC20-FZK-Haus needs A0), so the template names A0, the largest paper the set uses;
 *   - the fence plans (8 c) and the roof plans have no sheet series in the set, so they are listed to be supplied.
 */

import type { PacItem, PacSheetNames } from './pac-set.js';
import type { SetTemplate } from './set-template.js';

/** The scale of Anexa 3 point 8 a) (1:50). */
export const PAC_RURAL_SCALE = 50;

/** The items of Anexa 3 (list 1 a)-f), points 6-9), in the order the text lists them. Ids are `rural.*`. */
export const PAC_RURAL_ITEMS: readonly PacItem[] = [
  { id: 'rural.siteLocation', point: '1 a)', kind: 'drawing', scales: null, drawnBy: null },
  { id: 'rural.situationExisting', point: '1 b), 2', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'rural.situationProposed', point: '1 c), 3', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'rural.utilities', point: '1 d), 4', kind: 'drawing', scales: [1000, 500], drawnBy: null },
  { id: 'rural.plans', point: '1 e), 8 a)', kind: 'drawing', scales: [PAC_RURAL_SCALE], drawnBy: 'plans' },
  { id: 'rural.roof', point: '1 e), 8 a)', kind: 'drawing', scales: [PAC_RURAL_SCALE], drawnBy: null },
  { id: 'rural.facades', point: '1 e), 8 a)', kind: 'drawing', scales: [PAC_RURAL_SCALE], drawnBy: 'elevations' },
  { id: 'rural.sections', point: '1 e), 8 a)', kind: 'drawing', scales: [PAC_RURAL_SCALE], drawnBy: 'sections' },
  { id: 'rural.context', point: '1 e), 8 b)', kind: 'drawing', scales: null, drawnBy: null },
  { id: 'rural.fencePlans', point: '1 f), 8 c)', kind: 'drawing', scales: null, drawnBy: null },
  { id: 'rural.memo', point: '6 a), 7', kind: 'written', scales: null, drawnBy: null },
  { id: 'rural.survey', point: '9 a)', kind: 'existingBuilding', scales: null, drawnBy: null },
  { id: 'rural.structuralExpertise', point: '9 b)', kind: 'existingBuilding', scales: null, drawnBy: null },
];

/** The set template that draws the sheets of Anexa 3 point 8 a) from a model, every drawing slot at 1:50. */
export function pacRuralSetTemplate(names: PacSheetNames): SetTemplate {
  const layout = { paper: 'A0' as const, orientation: 'landscape' as const };
  const scale = PAC_RURAL_SCALE;
  return {
    name: names.name,
    schedules: [],
    annotations: {},
    sheets: [
      { name: names.plans, series: 'plans', layout, slots: [{ view: { kind: 'plan', storey: 0 }, scale }, { view: { kind: 'plan', storey: 1 }, scale }] },
      { name: names.facades, series: 'elevations', layout, slots: (['north', 'east', 'south', 'west'] as const).map((direction) => ({ view: { kind: 'elevation', direction }, scale })) },
      { name: names.sections, series: 'sections', layout, slots: [{ view: { kind: 'section', place: 0 }, scale }, { view: { kind: 'section', place: 1 }, scale }] },
    ],
  };
}
