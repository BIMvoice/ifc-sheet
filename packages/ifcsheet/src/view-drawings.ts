/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing of each view on a sheet, cut from the meshes by the section
 * generator (`@ifc-lite/drawing-2d`): a plan at its level's cut height, an
 * elevation on its plane outside the facade, a section on its own plane.
 * Unstyled: cut faces and visible lines only. The app styles its drawings
 * (pens, hatches, symbols, annotation) in `project/view-graphics.ts` and the
 * sheet components; that styling has not moved here yet.
 */

import { createSectionConfig, Drawing2DGenerator, type Drawing2D, type SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { ModelExtent } from './drawing-set.js';
import type { ElevationDirection, ProjectLevel, ProjectView, SectionProjectPlane } from './document.js';
import { customPlaneCenter } from './section-plane.js';
import { levelFloorY, planDepthBelowCut, resolvePlanLevel } from './view-defaults.js';

/** Where an elevation stands and which way it looks (`ELEVATION_PLANES` in the app's `project/view-plane.ts`). */
const ELEVATION_PLANES: Record<ElevationDirection, { axis: 'x' | 'z'; atMax: boolean; flipped: boolean }> = {
  south: { axis: 'z', atMax: true, flipped: false },
  north: { axis: 'z', atMax: false, flipped: true },
  east: { axis: 'x', atMax: true, flipped: false },
  west: { axis: 'x', atMax: false, flipped: true },
};

const AXIS = { down: 'y', front: 'z', side: 'x' } as const;

/** A plane stored in world metres, with its custom plane anchored where the generator anchors it. */
function storedPlane(plane: SectionProjectPlane, depth: number): SectionConfig {
  const config = createSectionConfig(AXIS[plane.axis], plane.offset, { projectionDepth: depth, includeHiddenLines: false });
  config.plane.flipped = plane.flipped;
  const custom = plane.custom;
  if (custom) {
    const origin = customPlaneCenter(custom);
    config.plane.customPlane = {
      normal: { x: custom.normal[0], y: custom.normal[1], z: custom.normal[2] },
      distance: custom.distance,
      origin: { x: origin[0], y: origin[1], z: origin[2] },
      tangent: { x: custom.tangent[0], y: custom.tangent[1], z: custom.tangent[2] },
      bitangent: { x: custom.bitangent[0], y: custom.bitangent[1], z: custom.bitangent[2] },
    };
  }
  return config;
}

/** The generator's settings for `view`, or `null` for a view with no plane (3D, drafting) or a plan whose level is gone. */
export function sectionConfigFor(view: ProjectView, levels: readonly ProjectLevel[], extent: ModelExtent): SectionConfig | null {
  const span = Math.max(extent.max.x - extent.min.x, extent.max.y - extent.min.y, extent.max.z - extent.min.z, 1);
  switch (view.kind) {
    case 'plan': {
      const level = resolvePlanLevel(view, levels) ?? (levels.length === 0 ? view.level : undefined);
      if (!level) return null;
      // A plan with no depth of its own shows its cut. A cut above the model stays there and cuts nothing (#226).
      const cut = levelFloorY(level) + view.cutHeight;
      return createSectionConfig('y', cut, { projectionDepth: planDepthBelowCut(view.viewDepth ?? 0, cut, extent.max.y), includeHiddenLines: false });
    }
    case 'elevation': {
      if (view.interior) return storedPlane(view.interior.plane, view.viewDepth ?? span);
      const { axis, atMax, flipped } = ELEVATION_PLANES[view.direction];
      const position = view.planeOffset ?? (atMax ? extent.max[axis] : extent.min[axis]);
      const config = createSectionConfig(axis, position, { projectionDepth: view.viewDepth ?? span, includeHiddenLines: false });
      config.plane.flipped = flipped;
      return config;
    }
    case 'section':
      return storedPlane(view.plane, view.viewDepth ?? span);
    default:
      return null;
  }
}

/**
 * The drawing of every view in `views` that has a plane, by view id. Views
 * whose drawing fails are left out and reported through `onError`.
 */
export async function generateViewDrawings(
  views: readonly ProjectView[], meshes: MeshData[], levels: readonly ProjectLevel[], extent: ModelExtent,
  onError: (view: ProjectView, error: unknown) => void = () => {},
): Promise<Map<string, Drawing2D>> {
  const out = new Map<string, Drawing2D>();
  if (meshes.length === 0) return out;
  const generator = new Drawing2DGenerator();
  await generator.initialize();
  try {
    for (const view of views) {
      const config = sectionConfigFor(view, levels, extent);
      if (!config) continue;
      try {
        const projection = config.projectionDepth > 0;
        out.set(view.id, await generator.generate(meshes, config, { includeHiddenLines: false, includeProjection: projection, includeEdges: projection, mergeLines: true }));
      } catch (err) {
        onError(view, err);
      }
    }
  } finally {
    generator.dispose();
  }
  return out;
}
