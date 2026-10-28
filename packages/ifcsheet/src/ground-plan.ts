/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PlanProjectView, ProjectView } from './document.js';

/**
 * How far below the datum (elevation 0) a floor may sit and still be the
 * storey entered from the ground, metres. A ground floor is often set a little
 * under the datum (a plinth, a threshold); a foundation or basement is a
 * storey deeper.
 */
export const GROUND_TOLERANCE_M = 0.3;

/**
 * The plan a set's elevation marks and sections are drawn on: the storey
 * entered from the ground, which is the lowest plan whose floor is not more
 * than {@link GROUND_TOLERANCE_M} below elevation 0. A foundation or basement
 * plan below it shows footings, not the facades the marks point at. When every
 * plan is below ground the one nearest to it (the highest) is chosen; when
 * every plan is above (a site elevation as datum) that is the lowest.
 */
export function groundPlan(views: readonly ProjectView[]): PlanProjectView | null {
  const plans = views.filter((v): v is PlanProjectView => v.kind === 'plan' && !v.site);
  const byElevation = [...plans].sort((a, b) => a.level.elevation - b.level.elevation);
  return byElevation.find((v) => v.level.elevation >= -GROUND_TOLERANCE_M) ?? byElevation[byElevation.length - 1] ?? null;
}
