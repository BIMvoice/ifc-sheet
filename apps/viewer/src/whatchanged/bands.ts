/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The band each view of the project looks at, in the model's frame: a plan from
 * its level's floor to its cut, a section or elevation as far either side of its
 * cut as its depth (its own, else the automatic one). A detail looks where the
 * view it was marked on looks. Views with no plane yet (an elevation before the
 * model has bounds) have none.
 */

import { automaticViewDepth } from '@/lib/section/automatic-depth';
import type { AxisBounds } from '@/lib/section/section-distance';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { resolvePlanLevel } from '@/project/view-defaults';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { cutBand, planBand, type ViewBand } from './visibility';

export function viewBands(views: readonly ProjectView[], levels: readonly ProjectLevel[], bounds: AxisBounds | null): ViewBand[] {
  const own = (v: ProjectView): ViewBand | null => {
    if (v.kind === 'plan') {
      const level = resolvePlanLevel(v, levels) ?? v.level;
      return planBand(v.id, level.elevation, level.elevation + v.cutHeight);
    }
    if (v.kind !== 'section' && v.kind !== 'elevation') return null;
    const plane = viewPlaneConfig(v, levels, bounds);
    if (!plane || plane.axis === 'y' || plane.customPlane) return null;
    const depth = v.viewDepth ?? automaticViewDepth({ axis: plane.axis === 'x' ? 'side' : 'front' }, bounds);
    return depth === null ? null : cutBand(v.id, plane.axis, plane.position, depth);
  };
  return views.flatMap((v): ViewBand[] => {
    const source = v.detail ? views.find((o) => o.id === v.detail!.of) : v;
    const band = source ? own(source) : null;
    return band ? [{ ...band, viewId: v.id }] : [];
  });
}
