/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The vector hidden-line drawing of a model seen along a camera direction: the
 * one place a camera becomes a `Drawing2D`. The app's to-scale 3D-view PDF,
 * an axonometric placed on a sheet and a cut-away axonometric (#97), in the
 * app and here in the engine, all come through here, so they cannot disagree
 * about the basis, the depth window or what counts as occluded.
 *
 * Frame, traced: `buildCameraSectionPlane` (`packages/drawing-2d/src/view-plane.ts`)
 * makes `tangent = normalize(cross(viewDir, up))` (screen right),
 * `bitangent = cross(tangent, viewDir)` (screen up) and `normal = -viewDir`, and
 * `projectTo2DBasis` (`math.ts`) projects a world point to
 * `(dot(p - origin, tangent), dot(p - origin, bitangent))`. A drawing's x is
 * therefore screen-right and its y screen-up, in metres, for ANY direction;
 * the plane sits in front of the whole model, so nothing is cut and the model
 * is a pure projection.
 */

import {
  Drawing2DGenerator,
  buildCameraSectionPlane,
  createSectionConfig,
  projectWorldLineSeeds,
  worldBoundsOfMeshes,
  type CameraFrame,
  type Drawing2D,
  type DrawingLine,
  type SectionConfig,
  type SectionPlaneConfig,
  type Vec3,
  type WorldBounds3D,
  type WorldLineSeed,
} from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';

/**
 * Depth of the "everything is solid" band in front of the camera plane. The
 * projection classifier reads `below` as the kept window and `above` as the
 * sliver on the far side of the plane; a synthetic plane placed in front of
 * the whole model therefore wants the full view depth below and (almost)
 * nothing above, which is the same trick the plan-view drawing uses to mean
 * "project everything behind the plane, solid".
 */
const ABOVE_PLANE_DEPTH_M = 1e-3;

export interface CameraDrawingInput {
  meshes: readonly MeshData[];
  camera: CameraFrame;
  /** The "N" in 1:N, carried on the section config. */
  scaleFactor: number;
  /** World-space segments (a section's rim) to project through the same plane. */
  rimSeeds?: readonly WorldLineSeed[];
  /** Pixels of tolerance for an edge on its occluder's outline (`GeneratorOptions.hiddenLineEdgeTolerancePx`); absent: none. */
  hiddenLineEdgeTolerancePx?: number;
  /** Draw the creases facing the camera as well as the silhouette (`GeneratorOptions.includeFeatureEdges`). */
  includeFeatureEdges?: boolean;
  /** Meshes that hide but draw nothing: the cut faces of clipped solids (`GeneratorOptions.extraOccluders`). */
  occluders?: readonly MeshData[];
  /** The half-spaces `meshes` were clipped to, whose open rim `rimSeeds` already draws (`GeneratorOptions.clipPlanes`). */
  clipPlanes?: readonly { normal: Vec3; offset: number }[];
  onProgress?: (stage: string, progress: number) => void;
}

export interface CameraDrawing {
  drawing: Drawing2D;
  plane: SectionPlaneConfig;
  viewDepth: number;
  worldBounds: WorldBounds3D;
}

export async function generateCameraDrawing(input: CameraDrawingInput): Promise<CameraDrawing> {
  const worldBounds = worldBoundsOfMeshes(input.meshes);
  if (!worldBounds) throw new Error('Nothing to export: the visible geometry has no usable coordinates.');
  const { plane, viewDepth } = buildCameraSectionPlane(input.camera, worldBounds);

  // Rim segments are world-space, so they project through the SAME plane the
  // meshes do and carry real view depths, which is what lets the hidden-line
  // pass dash the far side of a cut object on an oblique view.
  const extraLines: DrawingLine[] = input.rimSeeds?.length ? projectWorldLineSeeds([...input.rimSeeds], plane) : [];

  const config: SectionConfig = createSectionConfig(plane.axis, plane.position, {
    projectionDepth: viewDepth,
    projectionBelowDepth: viewDepth,
    projectionAboveDepth: ABOVE_PLANE_DEPTH_M,
    // ALWAYS classify, whatever the caller draws. Skipping classification does
    // not remove occluded edges, it leaves them unclassified, so they print as
    // SOLID lines indistinguishable from geometry that can actually be seen.
    includeHiddenLines: true,
    scale: input.scaleFactor,
  });
  config.plane = plane;

  const generator = new Drawing2DGenerator();
  try {
    // No GPU device is passed, so `useGPU` has nothing to select even before
    // the custom plane forces the CPU cutter. Stated explicitly so a future
    // GPU-capable caller cannot silently take the cardinal-only path.
    await generator.initialize();
    const drawing = await generator.generate([...input.meshes], config, {
      useGPU: false,
      includeHiddenLines: true,
      includeProjection: true,
      includeEdges: true,
      mergeLines: true,
      extraLines,
      hiddenLineEdgeTolerancePx: input.hiddenLineEdgeTolerancePx,
      includeFeatureEdges: input.includeFeatureEdges,
      extraOccluders: input.occluders?.length ? [...input.occluders] : undefined,
      clipPlanes: input.clipPlanes?.length ? input.clipPlanes : undefined,
      onProgress: input.onProgress,
    });
    return { drawing, plane, viewDepth, worldBounds };
  } finally {
    generator.dispose();
  }
}
