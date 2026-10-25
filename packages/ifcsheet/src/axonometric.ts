/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `@bimvoice/ifcsheet/axonometric`: a 3D view as a vector drawing, the same in
 * the app and in the engine (#49, #97).
 *
 * An axonometric is a parallel projection of the model along one direction,
 * drawn as hidden-line vectors through `camera-drawing.ts`. A cut-away
 * axonometric is first cut at a storey and/or to a section box, and the faces
 * the cut leaves are filled (`axonometric-cutaway.ts`).
 *
 * Frame: the viewer is Y-up, X east, Z south. The camera stands at a corner
 * and looks at the model, so its offset from the model is `(sx, 1, sz) / sqrt(3)`
 * with `sx`, `sz` = +1 for east / south: the true isometric elevation of 35.26
 * degrees. The drawing's x is screen-right and y screen-up; it is handed to the
 * sheet as a `z` (front) drawing, which every sheet reads as x right, y up on
 * paper (`asSheetDrawing`).
 *
 * Scale. A plain axonometric is at its projection's true scale: the plane
 * perpendicular to the view measures 1:N, and every edge of the model is
 * foreshortened by the angle it makes with that plane. A cut-away axonometric
 * is at its NOMINAL scale: the drawing is enlarged so that a vertical edge
 * measures 1:N on paper. Seen from an isometric corner the three axes are
 * foreshortened alike (by sqrt(2/3)), so 1:N then holds along all three axes,
 * as an isometric drawing is measured; seen from a saved camera, it holds
 * along the vertical.
 */

import { vec3, type CameraFrame, type Drawing2D, type Vec3 } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { ProjectLevel, ProjectView } from './document.js';
import { generateCameraDrawing } from './camera-drawing.js';
import { generateCutawayDrawing, type CutawayClip } from './axonometric-cutaway.js';
import { levelFloorY, sameElevation } from './view-defaults.js';
import type { AxonometricPreset, ThreeDProjection, ThreeDProjectView } from './view-3d-types.js';

export { generateCameraDrawing, type CameraDrawing, type CameraDrawingInput } from './camera-drawing.js';
export { cutawayPlanes, generateCutawayDrawing, type CutawayClip, type CutawayDrawingInput } from './axonometric-cutaway.js';
export type { AxonometricCutaway, SectionBox } from './view-3d-types.js';

export const AXONOMETRIC_PRESETS: readonly AxonometricPreset[] = ['se', 'sw', 'ne', 'nw'];
export const DEFAULT_AXONOMETRIC_PRESET: AxonometricPreset = 'se';
/** An axonometric prints its whole outline: its silhouette edges lie on the occluder's boundary (see `HiddenLineOptions.edgeTolerancePx`). */
export const AXONOMETRIC_EDGE_TOLERANCE_PX = 1;

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

/** A 3D view that prints as vector lines at a scale. */
export function isVectorAxonometric(view: ProjectView): view is ThreeDProjectView {
  return view.kind === '3d' && projectionOf(view) === 'axonometric' && !view.shaded;
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
 * set to `z` so the sheet's frame (x right, y up on paper) reads the camera
 * basis as it is. The plane's `customPlane` is untouched and is what every
 * plane-aware helper reads first.
 */
export function asSheetDrawing(drawing: Drawing2D): Drawing2D {
  const { plane } = drawing.config;
  return { ...drawing, config: { ...drawing.config, plane: { ...plane, axis: 'z', position: plane.customPlane?.origin.z ?? plane.position } } };
}

/**
 * How much a cut-away's drawing is enlarged so that a vertical edge measures
 * its nominal scale: `1 / sqrt(1 - d.y^2)` for the unit view direction `d`
 * (a vertical edge is foreshortened by the sine of its angle to the view).
 * An isometric corner gives `sqrt(3/2)`; a view straight down has no vertical
 * extent to measure and keeps its projection's scale.
 */
export function nominalScaleFactor(camera: CameraFrame): number {
  const d = { x: camera.target.x - camera.position.x, y: camera.target.y - camera.position.y, z: camera.target.z - camera.position.z };
  const len = Math.hypot(d.x, d.y, d.z);
  const sine = len > 0 ? Math.sqrt(Math.max(0, 1 - (d.y / len) ** 2)) : 1;
  return sine > 1e-3 ? 1 / sine : 1;
}

/** `drawing` with every coordinate multiplied by `k` (lines, cut faces, bounds). */
function scaledDrawing(drawing: Drawing2D, k: number): Drawing2D {
  if (k === 1) return drawing;
  const p = (q: { x: number; y: number }) => ({ x: q.x * k, y: q.y * k });
  return {
    ...drawing,
    lines: drawing.lines.map((l) => ({ ...l, line: { start: p(l.line.start), end: p(l.line.end) } })),
    cutPolygons: drawing.cutPolygons.map((c) => ({ ...c, polygon: { outer: c.polygon.outer.map(p), holes: c.polygon.holes.map((h) => h.map(p)) } })),
    bounds: { min: p(drawing.bounds.min), max: p(drawing.bounds.max) },
  };
}

/**
 * What `view` cuts away, in the drawing frame: its storey cut over the level's
 * floor (the loaded level of the same elevation, whose `floorY` is current,
 * else the stored one) and its section box; `null` for an axonometric that
 * cuts nothing.
 */
export function cutawayClipOf(view: ThreeDProjectView, levels: readonly ProjectLevel[]): CutawayClip | null {
  const { cutaway } = view;
  if (!cutaway || (!cutaway.storey && !cutaway.box)) return null;
  const clip: CutawayClip = {};
  if (cutaway.storey) {
    const stored = cutaway.storey.level;
    const level = levels.find((l) => sameElevation(l.elevation, stored.elevation)) ?? stored;
    clip.cutY = levelFloorY(level) + cutaway.storey.cutHeight;
  }
  if (cutaway.box) clip.box = cutaway.box;
  return clip;
}

/**
 * The vector drawing of `meshes` as the axonometric `view` shows them, at
 * 1:`view.scale` (100 by default), ready for a sheet. Unstyled: hidden lines
 * are classified and kept, for the caller to show or leave out.
 */
export async function drawAxonometricView(
  meshes: readonly MeshData[],
  view: ThreeDProjectView,
  levels: readonly ProjectLevel[] = [],
  onProgress?: (stage: string, progress: number) => void,
): Promise<Drawing2D> {
  const camera = axonometricCamera(view);
  const scaleFactor = view.scale ?? 100;
  const clip = cutawayClipOf(view, levels);
  if (!clip) {
    const { drawing } = await generateCameraDrawing({ meshes, camera, scaleFactor, hiddenLineEdgeTolerancePx: AXONOMETRIC_EDGE_TOLERANCE_PX, includeFeatureEdges: true, onProgress });
    return asSheetDrawing(drawing);
  }
  const drawing = await generateCutawayDrawing({ meshes, camera, clip, scaleFactor, hiddenLineEdgeTolerancePx: AXONOMETRIC_EDGE_TOLERANCE_PX, onProgress });
  return asSheetDrawing(scaledDrawing(drawing, nominalScaleFactor(camera)));
}
