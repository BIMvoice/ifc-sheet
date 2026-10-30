/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing of each view on a sheet, cut from the meshes by the section
 * generator (`@ifc-lite/drawing-2d`): a plan at its level's cut height, an
 * elevation on its plane outside the facade, a section on its own plane.
 * A 3D view that prints as vector lines is drawn as an axonometric, cut away
 * when it asks (`axonometric.ts`, the same function the app draws it with).
 * Unstyled: cut faces and visible lines only. The app styles its drawings
 * (pens, hatches, symbols, annotation) in `project/view-graphics.ts` and the
 * sheet components; that styling has not moved here yet.
 */

import { createSectionConfig, Drawing2DGenerator, type Drawing2D, type SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { ModelExtent } from './drawing-set.js';
import type { ElevationDirection, ProjectLevel, ProjectView, SectionProjectPlane } from './document.js';
import { customPlaneCenter } from './section-plane.js';
import { drawAxonometricView, isVectorAxonometric } from './axonometric.js';
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

/** Whether a drawing holds nothing at all: no line, no cut face, no projected face. */
export const isEmptyDrawing = (d: Drawing2D): boolean => d.lines.length === 0 && d.cutPolygons.length === 0 && d.projectionPolygons.length === 0;

/**
 * How the app draws a plan whose cut, with its own depth, shows nothing, when the model has fewer than two levels (the
 * app scopes the bands to the storey from two up, `useDrawingGeneration.ts`): the floor side as deep as the cut is high
 * (`constructionProjectionDepth` of a plan with no depth, `project/view-drawings.ts`), and the overhead side over the whole
 * extent, because with one level there is no other floor to keep out. A bridge deck above a storey at 0 is seen
 * from there: its cut at 1.2 m meets nothing, and the deck above it is what the app draws. `null` for a view that is not a
 * plan, or a model with two levels or more (a cut with nothing in its storey is empty there, in the app too).
 */
export function overheadPlanConfig(view: ProjectView, config: SectionConfig, levels: readonly ProjectLevel[], extent: ModelExtent): SectionConfig | null {
  if (view.kind !== 'plan' || levels.length >= 2) return null;
  const below = planDepthBelowCut(view.cutHeight > 0 ? view.cutHeight : 0, config.plane.position, extent.max.y);
  const above = Math.max(extent.max.y - extent.min.y, 1e-3);
  return { ...config, projectionDepth: below, clipProjectionBands: true, projectionBelowDepth: below, projectionAboveDepth: above };
}

/**
 * The drawing of every view in `views` that has a plane, by view id. Views
 * whose drawing fails are left out and reported through `onError`. A plan
 * whose cut shows nothing is drawn as the app draws it (`overheadPlanConfig`);
 * one still empty after that is reported through `onEmpty`.
 */
export async function generateViewDrawings(
  views: readonly ProjectView[], meshes: MeshData[], levels: readonly ProjectLevel[], extent: ModelExtent,
  onError: (view: ProjectView, error: unknown) => void = () => {},
  onEmpty: (view: ProjectView) => void = () => {},
): Promise<Map<string, Drawing2D>> {
  const out = new Map<string, Drawing2D>();
  if (meshes.length === 0) return out;
  const generator = new Drawing2DGenerator();
  await generator.initialize();
  try {
    for (const view of views) {
      if (isVectorAxonometric(view)) {
        try {
          // Hidden lines are classified and left out unless the view asks, as the app shows a 3D view (`view-appearance.ts`).
          const drawing = await drawAxonometricView(meshes, view, levels);
          out.set(view.id, view.showHidden ? drawing : { ...drawing, lines: drawing.lines.filter((l) => l.visibility !== 'hidden' && l.category !== 'hidden') });
        } catch (err) {
          onError(view, err);
        }
        continue;
      }
      const config = sectionConfigFor(view, levels, extent);
      if (!config) continue;
      try {
        const projection = config.projectionDepth > 0;
        let drawing = await generator.generate(meshes, config, { includeHiddenLines: false, includeProjection: projection, includeEdges: projection, mergeLines: true });
        const overhead = view.kind === 'plan' && isEmptyDrawing(drawing) ? overheadPlanConfig(view, config, levels, extent) : null;
        if (overhead) drawing = await generator.generate(meshes, overhead, { includeHiddenLines: false, includeProjection: true, includeEdges: true, mergeLines: true });
        if (view.kind === 'plan' && isEmptyDrawing(drawing)) onEmpty(view);
        out.set(view.id, drawing);
      } catch (err) {
        onError(view, err);
      }
    }
  } finally {
    generator.dispose();
  }
  return out;
}
