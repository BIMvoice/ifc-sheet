/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { releaseOwnedVisibility, type VisibilityOwnership } from '@/lib/visibility/ownership';

interface ChartVisibilityState {
  chartVisibilityOwned?: VisibilityOwnership;
  setChartVisibilityOwned?: (owned: VisibilityOwnership) => void;
  isolatedEntities?: Set<number> | null;
  ghostExceptEntities?: Set<number> | null;
  clearIsolation?: () => void;
  clearGhost?: () => void;
}

/** Release the chart's shared visibility channel before teardown can invalidate its claim. */
export function endChartVisibilityPresentation(state: ChartVisibilityState): void {
  releaseOwnedVisibility(state, state.chartVisibilityOwned ?? null);
  state.setChartVisibilityOwned?.(null);
}
