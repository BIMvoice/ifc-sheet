/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The crop of a view as the Bonsai drawing's camera takes it (#548): the area the view shows, in its drawing metres. In the order the
 * sheet decides it: an interior elevation's wall face, a detail's area, the first sheet viewport's crop box (paper millimetres at
 * the viewport's scale, around the drawing point it shows), else the whole model's box on the view's plane.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { worldToDrawing } from '@/drafting/frame';
import type { AxisBounds } from '@/lib/section/section-distance';
import type { ProjectSheet, ProjectView } from '@/project/types';

export interface Crop { min: { x: number; y: number }; max: { x: number; y: number } }

/** The eight corners of a box, in the viewer frame. */
export function boundsCorners(b: AxisBounds): { x: number; y: number; z: number }[] {
  return [b.min.x, b.max.x].flatMap((x) => [b.min.y, b.max.y].flatMap((y) => [b.min.z, b.max.z].map((z) => ({ x, y, z }))));
}

function around(c: { x: number; y: number }, w: number, h: number): Crop {
  return { min: { x: c.x - w / 2, y: c.y - h / 2 }, max: { x: c.x + w / 2, y: c.y + h / 2 } };
}

/** The model's box on the view's plane; null with no bounds. */
export function boundsCrop(config: SectionPlaneConfig, bounds: AxisBounds | null): Crop | null {
  if (!bounds) return null;
  const pts = boundsCorners(bounds).map((c) => worldToDrawing(config, c));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

export function viewCrop(
  view: ProjectView,
  config: SectionPlaneConfig,
  sheets: readonly Pick<ProjectSheet, 'viewports'>[],
  bounds: AxisBounds | null,
): Crop | null {
  if (view.kind === 'elevation' && view.interior) return view.interior.crop;
  if (view.detail) return { min: view.detail.min, max: view.detail.max };
  const fit = boundsCrop(config, bounds);
  for (const sheet of sheets) {
    for (const vp of sheet.viewports ?? []) {
      if (vp.viewId !== view.id || vp.width <= 0 || vp.height <= 0) continue;
      const centre = vp.center ?? (fit ? { x: (fit.min.x + fit.max.x) / 2, y: (fit.min.y + fit.max.y) / 2 } : null);
      // Paper millimetres at 1:scale are scale / 1000 metres each.
      if (centre) return around(centre, (vp.width * vp.scale) / 1000, (vp.height * vp.scale) / 1000);
    }
  }
  return fit;
}
