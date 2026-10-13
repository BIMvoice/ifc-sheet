/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The band each view of the project looks at, in the render frame: a plan from
 * its depth below its cut up to the cut (its own depth, else its cut height: down
 * to its floor), a section or elevation from its cut as far as its depth toward
 * what it looks at (its own, else the automatic one; which side comes from the
 * plane's `flipped`). A detail looks where the view it was marked on looks, and
 * only at the area it was marked on. Views with no plane yet (an elevation
 * before the model has bounds) have none, and neither has a section cut along a
 * plane that is not along an axis (`unread` lists them).
 */

import { automaticViewDepth } from '@/lib/section/automatic-depth';
import type { AxisBounds } from '@/lib/section/section-distance';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { resolvePlanLevel } from '@/project/view-defaults';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { cutBand, planBand, type ViewBand } from './visibility';

export interface Bands {
  bands: ViewBand[];
  /** Views cut along a plane that is not along an axis: their changes are not read. */
  unread: string[];
}

export function viewBands(views: readonly ProjectView[], levels: readonly ProjectLevel[], bounds: AxisBounds | null): Bands {
  const byId = new Map(views.map((v) => [v.id, v] as const));
  const unread: string[] = [];
  const own = (v: ProjectView): ViewBand | null => {
    if (v.kind === 'section' && v.plane.custom) { unread.push(v.id); return null; }
    const plane = viewPlaneConfig(v, levels, bounds);
    if (!plane) return null;
    if (v.kind === 'plan') {
      const level = resolvePlanLevel(v, levels) ?? v.level;
      const cut = level.elevation + v.cutHeight;
      return { ...planBand(v.id, cut - (typeof v.viewDepth === 'number' && v.viewDepth >= 0 ? v.viewDepth : v.cutHeight), cut), plane };
    }
    if (v.kind !== 'section' && v.kind !== 'elevation') return null;
    if (plane.axis === 'y' || plane.customPlane) { unread.push(v.id); return null; }
    const depth = typeof v.viewDepth === 'number' && v.viewDepth > 0 ? v.viewDepth : automaticViewDepth({ axis: plane.axis === 'x' ? 'side' : 'front' }, bounds);
    return depth === null ? null : { ...cutBand(v.id, plane.axis, plane.position, depth, plane.flipped), plane };
  };
  const bands = views.flatMap((v): ViewBand[] => {
    const source = v.detail ? byId.get(v.detail.of) : v;
    const band = source ? own(source) : null;
    return band ? [{ ...band, viewId: v.id, ...(v.detail ? { crop: { min: v.detail.min, max: v.detail.max } } : {}) }] : [];
  });
  return { bands, unread };
}
