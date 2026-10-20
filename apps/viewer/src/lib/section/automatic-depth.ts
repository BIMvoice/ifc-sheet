/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How far a section or elevation with no depth of its own looks behind its
 * cut, metres. The drawing generator and the depth band drawn on a plan both
 * ask here, so the band shows the depth the drawing really uses.
 */

import type { SectionPlaneAxis } from '@/store/types';
import { sectionAxisRange, type AxisBounds } from './section-distance';

/** Half the model's depth along the cut (its diagonal for a plane that is not along an axis). */
export const SECTION_VIEW_DEPTH_FRACTION = 0.5;

/** The depth a vertical cut sees with no depth of its own, or `null` when the bounds cannot say. */
export function automaticViewDepth(plane: { axis: SectionPlaneAxis; custom?: unknown }, bounds: AxisBounds | null): number | null {
  if (!bounds) return null;
  const span = plane.custom
    ? Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z)
    : (() => { const r = sectionAxisRange(bounds, plane.axis); return r ? r.max - r.min : null; })();
  return span === null ? null : Math.max(span * SECTION_VIEW_DEPTH_FRACTION, 1e-3);
}
