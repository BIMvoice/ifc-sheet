/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A 3D view as a drawing on a sheet.
 *
 * An axonometric is a parallel projection of the whole model along one
 * direction, so it has a true scale and prints as vector hidden-line like any
 * other view. It rides the engine the 3D-view PDF already uses
 * (`lib/export/view-pdf/camera-drawing.ts`): a synthetic plane in front of the
 * model, no cut, everything projected as solid with the hidden-line pass
 * classifying what is occluded. A perspective has no single scale, so it can
 * only print as a raster capture of the viewport (`view-raster.ts`).
 *
 * Frame: the viewer is Y-up, X east, Z south (`view-plane.ts`). The camera
 * stands at a corner and looks at the model, so its offset from the model is
 * `(sx, 1, sz) / sqrt(3)` with `sx`, `sz` = +1 for east / south: the true
 * isometric elevation of 35.26 degrees. The drawing's x is screen-right and y
 * screen-up (see `camera-drawing.ts`), and the sheet puts a drawing on paper
 * with `drafting/frame.ts`'s `drawingToScreen`, which keeps y up only for the
 * front/side signs; the drawing is therefore handed to the sheet as a `front`
 * (x right, y up) drawing, whatever its direction.
 */

import { vec3, type CameraFrame, type Drawing2D, type Vec3 } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { generateCameraDrawing } from '@/lib/export/view-pdf/camera-drawing';
import { drawingAsViewShows } from './view-appearance';
import type { AxonometricPreset, ProjectView, ThreeDProjectView, ThreeDProjection } from './types';

export const AXONOMETRIC_PRESETS: readonly AxonometricPreset[] = ['se', 'sw', 'ne', 'nw'];
/** An axonometric prints its whole outline: its silhouette edges lie on the occluder's boundary (see `HiddenLineOptions.edgeTolerancePx`). */
const EDGE_TOLERANCE_PX = 1;

export const DEFAULT_AXONOMETRIC_PRESET: AxonometricPreset = 'se';

const SQRT3 = Math.sqrt(3);
/** Which way a corner lies from the model: +x east / -x west, +z south / -z north. */
const CORNER: Record<AxonometricPreset, { sx: 1 | -1; sz: 1 | -1 }> = {
  se: { sx: 1, sz: 1 },
  sw: { sx: -1, sz: 1 },
  ne: { sx: 1, sz: -1 },
  nw: { sx: -1, sz: -1 },
};

/** The direction a camera at `preset` looks along (from the corner to the model), unit length. */
export function presetViewDirection(preset: AxonometricPreset): Vec3 {
  const { sx, sz } = CORNER[preset];
  return vec3(-sx / SQRT3, -1 / SQRT3, -sz / SQRT3);
}

/** How a 3D view prints: its own choice, else orthographic is an axonometric and anything else a perspective. */
export function projectionOf(view: ThreeDProjectView): ThreeDProjection {
  return view.projection ?? (view.viewpoint?.projectionMode === 'orthographic' ? 'axonometric' : 'perspective');
}

/** A 3D view that prints as vector lines at a true scale. */
export function isVectorAxonometric(view: ProjectView): view is ThreeDProjectView {
  return view.kind === '3d' && projectionOf(view) === 'axonometric' && !view.shaded;
}

/** A 3D view that prints as a raster capture: every perspective, and an axonometric asked to be shaded. */
export function isRasterView(view: ProjectView): view is ThreeDProjectView {
  return view.kind === '3d' && !isVectorAxonometric(view);
}

/** A 3D view with a scale: the parallel projections. */
export function hasTrueScale(view: ProjectView | undefined): boolean {
  return !view || view.kind !== '3d' || projectionOf(view) === 'axonometric';
}

/**
 * The camera an axonometric is drawn from: its preset corner, else the saved
 * camera's own direction and up, else the default corner. Only the direction
 * and up matter to a parallel projection; the plane is placed from the model's
 * bounds, so the position is just `-direction`.
 */
export function axonometricCamera(view: ThreeDProjectView): CameraFrame {
  const saved = view.viewpoint;
  const fromSaved = saved
    ? vec3(saved.target.x - saved.position.x, saved.target.y - saved.position.y, saved.target.z - saved.position.z)
    : null;
  const usable = fromSaved && Math.hypot(fromSaved.x, fromSaved.y, fromSaved.z) > 1e-9;
  const direction = view.preset || !usable ? presetViewDirection(view.preset ?? DEFAULT_AXONOMETRIC_PRESET) : fromSaved;
  const up = view.preset || !saved || !usable ? vec3(0, 1, 0) : vec3(saved.up.x, saved.up.y, saved.up.z);
  return { position: vec3(-direction.x, -direction.y, -direction.z), target: vec3(0, 0, 0), up };
}

/**
 * The drawing for the sheet: the generated one, with its legacy cardinal axis
 * set to `z` so the sheet's frame (`drawingToScreen`: x right, y up on paper)
 * reads the camera basis as it is. The plane's `customPlane` is untouched and
 * is what every plane-aware helper reads first.
 */
export function asSheetDrawing(drawing: Drawing2D): Drawing2D {
  const { plane } = drawing.config;
  return { ...drawing, config: { ...drawing.config, plane: { ...plane, axis: 'z', position: plane.customPlane?.origin.z ?? plane.position } } };
}

/** The vector hidden-line drawing of `meshes` seen as `view` sees them, at 1:`scale`. */
export async function generateAxonometricDrawing(
  meshes: readonly MeshData[],
  view: ThreeDProjectView,
  scale = view.scale ?? 100,
  onProgress?: (stage: string, progress: number) => void,
): Promise<Drawing2D> {
  const { drawing } = await generateCameraDrawing({ meshes, camera: axonometricCamera(view), scaleFactor: scale, hiddenLineEdgeTolerancePx: EDGE_TOLERANCE_PX, includeFeatureEdges: true, onProgress });
  return asSheetDrawing(drawing);
}

/** The drawing a sheet shows for an axonometric: generated, then as the view shows it (hidden lines left out unless asked). */
export async function drawAxonometric(
  meshes: readonly MeshData[],
  view: ThreeDProjectView,
  onProgress?: (stage: string, progress: number) => void,
): Promise<Drawing2D> {
  return drawingAsViewShows(await generateAxonometricDrawing(meshes, view, view.scale ?? 100, onProgress), view);
}
