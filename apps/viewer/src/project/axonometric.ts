/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A 3D view as a drawing on a sheet.
 *
 * An axonometric is a parallel projection of the model along one direction,
 * so it has a scale and prints as vector hidden-line like any other view; a
 * cut-away axonometric (#97) is first cut at a storey and/or to a section box,
 * with the faces the cut leaves filled. Both are drawn by the engine
 * (`@bimvoice/ifcsheet/axonometric`), the same function the headless set uses,
 * so the app and the engine cannot draw a 3D view differently. Its camera,
 * frame and scale are explained there. A perspective has no single scale, so
 * it can only print as a raster capture of the viewport (`view-raster.ts`).
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import {
  AXONOMETRIC_PRESETS, DEFAULT_AXONOMETRIC_PRESET, asSheetDrawing, axonometricCamera, drawAxonometricView, isVectorAxonometric,
  presetViewDirection, projectionOf,
} from '@bimvoice/ifcsheet/axonometric';
import type { CameraViewpoint } from '@/store/types';
import { drawingAsViewShows } from './view-appearance';
import type { ProjectLevel, ProjectView, ThreeDProjectView } from './types';

export { AXONOMETRIC_PRESETS, DEFAULT_AXONOMETRIC_PRESET, asSheetDrawing, axonometricCamera, isVectorAxonometric, presetViewDirection, projectionOf };

/** A 3D view that prints as a raster capture: every perspective, and an axonometric asked to be shaded. */
export function isRasterView(view: ProjectView): view is ThreeDProjectView {
  return view.kind === '3d' && !isVectorAxonometric(view);
}

/** A 3D view with a scale: the parallel projections. */
export function hasTrueScale(view: ProjectView | undefined): boolean {
  return !view || view.kind !== '3d' || projectionOf(view) === 'axonometric';
}

/** The renderer camera's own field of view, radians. */
const DEFAULT_FOV = Math.PI / 4;
/** Slack around the model's bounding sphere when a capture frames it. */
const FRAME_PADDING = 1.05;

/**
 * The camera a raster capture of `view` is taken from. A saved camera is used
 * as it is, unless the view is an axonometric seen from a preset corner (the
 * preset wins, as in `axonometricCamera`); a view with no saved camera is seen
 * from its preset corner, else the default one, so the capture never depends
 * on whatever the 3D view happens to show. A preset camera looks at the centre
 * of `bounds` (renderer frame) and frames its bounding sphere; `null` without
 * a model to frame.
 */
export function captureViewpoint(
  view: ThreeDProjectView,
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null,
  fov = DEFAULT_FOV,
): CameraViewpoint | null {
  const ortho = projectionOf(view) === 'axonometric';
  const saved = view.viewpoint;
  if (saved && !(ortho && view.preset)) return saved;
  if (!bounds) return null;
  const target = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const radius = Math.max(0.5, Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2) * FRAME_PADDING;
  const d = presetViewDirection(view.preset ?? DEFAULT_AXONOMETRIC_PRESET);
  // A parallel projection does not depend on the distance, only on orthoSize; a perspective fits the sphere in its fov.
  const distance = ortho ? radius * 4 : radius / Math.sin(fov / 2);
  return {
    position: { x: target.x - d.x * distance, y: target.y - d.y * distance, z: target.z - d.z * distance },
    target,
    up: { x: 0, y: 1, z: 0 },
    fov,
    projectionMode: ortho ? 'orthographic' : 'perspective',
    ...(ortho ? { orthoSize: radius } : {}),
  };
}

/** The vector drawing of `meshes` seen as `view` sees them, at 1:`view.scale`, for the sheet; `levels` place a cut-away's storey cut (the loaded ones). */
export async function generateAxonometricDrawing(
  meshes: readonly MeshData[],
  view: ThreeDProjectView,
  levels: readonly ProjectLevel[] = [],
  onProgress?: (stage: string, progress: number) => void,
): Promise<Drawing2D> {
  return drawAxonometricView(meshes, view, levels, onProgress);
}

/** The drawing a sheet shows for an axonometric: generated, then as the view shows it (hidden lines left out unless asked). */
export async function drawAxonometric(
  meshes: readonly MeshData[],
  view: ThreeDProjectView,
  levels: readonly ProjectLevel[] = [],
  onProgress?: (stage: string, progress: number) => void,
): Promise<Drawing2D> {
  return drawingAsViewShows(await generateAxonometricDrawing(meshes, view, levels, onProgress), view);
}
