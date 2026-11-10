/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The plot on a site plan: its boundary (a closed polyline the user draws on
 * the site plan, on the "Plot boundary" layer), its area, and the setbacks —
 * for each boundary edge, the distance from it to the nearest point of the
 * building's footprint, negative where the building is over that line. Pure, in the site plan's drawing metres.
 */

import type { ProjectView } from '@/project/types';

export { PLOT_BOUNDARY_LAYER, doubleSignedArea, insideRing, plotBoundaryOf, ringArea, setbacks, type Setback } from '@bimvoice/ifcsheet/site-marks';

/** Whether a view is a site plan. */
export const isSitePlan = (view: ProjectView | undefined): boolean => view?.kind === 'plan' && view.site === true;

/** The plot area, m², from the boundary drawn on the project's site plan, or `null` when no site plan has one (the engine's, which the urban indicators' site area takes unless one is typed). */
export { plotAreaOf } from '@bimvoice/ifcsheet';
