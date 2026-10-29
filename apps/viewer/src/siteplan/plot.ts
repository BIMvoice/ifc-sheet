/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The plot on a site plan: its boundary (a closed polyline the user draws on
 * the site plan, on the "Plot boundary" layer), its area, and the setbacks —
 * for each boundary edge, the distance from it to the nearest point of the
 * building's footprint, negative where the building is over that line. Pure, in the site plan's drawing metres.
 */

import type { ProjectDocument, ProjectView } from '@/project/types';

export { PLOT_BOUNDARY_LAYER, doubleSignedArea, insideRing, plotBoundaryOf, ringArea, setbacks, type Setback } from '@bimvoice/ifcsheet/site-marks';
import { plotBoundaryOf, ringArea } from '@bimvoice/ifcsheet/site-marks';

/** Whether a view is a site plan. */
export const isSitePlan = (view: ProjectView | undefined): boolean => view?.kind === 'plan' && view.site === true;

/**
 * The plot area, m², from the boundary drawn on the project's site plan, or
 * `null` when no site plan has one. The urban indicators' site area
 * (`urban/site-area.ts`) takes it unless a site area is typed in the project.
 */
export function plotAreaOf(project: Pick<ProjectDocument, 'views' | 'drafts'>): number | null {
  for (const view of project.views) {
    if (!isSitePlan(view)) continue;
    const ring = plotBoundaryOf(project.drafts, view.id);
    if (ring) return ringArea(ring);
  }
  return null;
}
