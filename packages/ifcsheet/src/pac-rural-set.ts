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
 *   - the paper is not stated by the text. Anexa 3 targets a house of at most P + M and 150 mp developed area, whose plan
 *     (about 12 x 12 m) is 24 cm at 1:50, so each drawing gets a sheet of its own on A3 landscape. A drawing that does
 *     not fit A3 at 1:50 (a building larger than the Anexa 3 scope) steps up the paper of that sheet only, to A2 and then
 *     A1 (`PAC_RURAL_STEP_UP`); the scale is never changed to save paper;
 *   - the fence plans (8 c) and the roof plans have no sheet series in the set, so they are listed to be supplied.
 */

import type { PacItem, PacSheetNames } from './pac-set.js';
import type { PaperSize } from './document.js';
import type { RuledSeries, SetTemplate, SheetRule, ViewRule } from './set-template.js';

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

/** The paper of every sheet, unless its drawing does not fit it at 1:50 (see `PAC_RURAL_STEP_UP`). */
export const PAC_RURAL_PAPER = 'A3' as const;

/** The papers a sheet steps up to, in order, when its drawing does not fit `PAC_RURAL_PAPER` at 1:50. */
export const PAC_RURAL_STEP_UP: readonly PaperSize[] = ['A2', 'A1'];

/**
 * The set template that draws the sheets of Anexa 3 point 8 a) from a model: one view per sheet, at 1:50, on A3
 * landscape, or on the first of A2, A1 that the view fits at 1:50. Sheets of a series are named `<name> 1`, `<name> 2`, ...
 */
export function pacRuralSetTemplate(names: PacSheetNames): SetTemplate {
  const layout = { paper: PAC_RURAL_PAPER, orientation: 'landscape' as const };
  const scale = PAC_RURAL_SCALE;
  // Marks: CONVENTION, not required by Anexa 3 or Ordinul 975/2026 (the research file `ro-permit-requirements.md` found no north
  // arrow and no scale bar in them). The convention: a north arrow on plans, a scale bar on every scaled view.
  const sheets = (name: string, series: RuledSeries, views: ViewRule[]): SheetRule[] =>
    views.map((view, i) => ({ name: `${name} ${i + 1}`, series, layout: { ...layout, stepUp: [...PAC_RURAL_STEP_UP] }, slots: [{ view, scale, scaleBar: true, ...(series === 'plans' ? { northArrow: true } : {}) }] }));
  return {
    name: names.name,
    schedules: [],
    annotations: {},
    sheets: [
      ...sheets(names.plans, 'plans', [{ kind: 'plan', storey: 0 }, { kind: 'plan', storey: 1 }]),
      ...sheets(names.facades, 'elevations', (['north', 'east', 'south', 'west'] as const).map((direction) => ({ kind: 'elevation', direction }))),
      ...sheets(names.sections, 'sections', [{ kind: 'section', place: 0 }, { kind: 'section', place: 1 }]),
    ],
  };
}
