/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The band each view of the project looks at, in the render frame, read the way
 * the drawing generator reads it (`useDrawingGeneration`):
 *
 *   plan                 from its depth below the cut (`viewDisplayOverrides`: its own, else the
 *                        cut height, down to its floor) up to the ceiling of its storey: the
 *                        next level above, else the top of the model. What lies above the cut
 *                        draws too, as dashed overhead lines.
 *   section, elevation   from the cut as far as its depth toward what it looks at (its own,
 *                        else half the model's extent along the cut, `SECTION_VIEW_DEPTH_FRACTION`);
 *                        the side comes from the plane's `flipped`.

 * `main` has no detail views: the part of a drawing a sheet shows is its viewport's crop (`report.ts`).
 *
 * Views with no plane yet (an elevation before the model has bounds) have none, and
 * neither has a section cut along a plane that is not along an axis (`unread` lists them).
 */

import { SECTION_VIEW_DEPTH_FRACTION } from '@/hooks/useDrawingGeneration';
import type { AxisBounds } from '@/lib/section/section-distance';
import { viewDisplayOverrides } from '@/project/view-drawings';
import { levelFloorY, resolvePlanLevel } from '@/project/view-defaults';
import { viewPlaneConfig } from '@/project/view-plane-config';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { cutBand, planBand, type ViewBand } from './visibility';

export interface Bands {
  bands: ViewBand[];
  /** Views cut along a plane that is not along an axis: their changes are not read. */
  unread: string[];
}

/** The next level above `elevation`, else the top of the model. */
function storeyCeiling(levels: readonly ProjectLevel[], elevation: number, bounds: AxisBounds | null): number {
  const above = levels.map(levelFloorY).filter((e) => e > elevation + 1e-6);
  return above.length > 0 ? Math.min(...above) : bounds ? bounds.max.y : elevation;
}

export function viewBands(views: readonly ProjectView[], levels: readonly ProjectLevel[], bounds: AxisBounds | null): Bands {
  const unread: string[] = [];
  const own = (v: ProjectView): ViewBand | null => {
    if (v.kind === 'section' && v.plane.custom) { unread.push(v.id); return null; }
    const plane = viewPlaneConfig(v, levels, bounds);
    if (!plane) return null;
    const depth = viewDisplayOverrides(v).constructionProjectionDepth;
    if (v.kind === 'plan') {
      const level = resolvePlanLevel(v, levels) ?? v.level;
      const band = planBand(v.id, plane.position - (depth ?? v.cutHeight), Math.max(plane.position, storeyCeiling(levels, levelFloorY(level), bounds)));
      return { ...band, plane };
    }
    if (v.kind !== 'section' && v.kind !== 'elevation') return null;
    if (plane.axis === 'y' || plane.customPlane) { unread.push(v.id); return null; }
    const span = bounds ? bounds.max[plane.axis] - bounds.min[plane.axis] : NaN;
    const reach = depth ?? (Number.isFinite(span) ? Math.max(span * SECTION_VIEW_DEPTH_FRACTION, 1e-3) : null);
    return reach === null ? null : { ...cutBand(v.id, plane.axis, plane.position, reach, plane.flipped), plane };
  };
  const bands = views.flatMap((v): ViewBand[] => {
    const band = own(v);
    return band ? [band] : [];
  });
  return { bands, unread };
}
