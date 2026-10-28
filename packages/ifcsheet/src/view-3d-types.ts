/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A 3D view of the project and how it prints (vector axonometric, or a raster capture). Re-exported by `document.ts`. */

import type { ProjectLevel, ProjectViewBase } from './document.js';

export type ProjectionMode = 'perspective' | 'orthographic';

/** A saved camera: where it stands, what it looks at, and how it projects. */
export interface CameraViewpoint {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  fov: number;
  projectionMode: ProjectionMode;
  orthoSize?: number;
}

/** How a 3D view prints: an axonometric is parallel (a true scale), a perspective has none. */
export type ThreeDProjection = 'axonometric' | 'perspective';

/** The four isometric corners a model is seen from; the camera stands at that corner, 35.26 degrees up. */
export type AxonometricPreset = 'se' | 'sw' | 'ne' | 'nw';

/** A raster capture of the 3D viewport, printed as an image on a sheet. Sized in paper millimetres at print resolution, so it carries its own box. */
export interface ViewRaster {
  /** PNG data URL of the capture. */
  href: string;
  widthPx: number; heightPx: number;
  /** The paper box the capture was sized for, millimetres. */
  widthMm: number; heightMm: number;
}

/** A box in the drawing frame (viewer metres, Y up): what a section box keeps. */
export interface SectionBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * What a cut-away axonometric removes before it is drawn (#97): the model above
 * a storey's cut, and everything outside a section box. The faces the cut
 * leaves in the solids are filled, like a plan's cut.
 */
export interface AxonometricCutaway {
  /** The storey cut: nothing higher than `cutHeight` over the level's floor (`levelFloorY`) is drawn. */
  storey?: { level: ProjectLevel; cutHeight: number };
  /** Only what lies inside this box is drawn. */
  box?: SectionBox;
}

export interface ThreeDProjectView extends ProjectViewBase {
  kind: '3d';
  /** `null` means "the default 3D view": fit the whole model. */
  viewpoint: CameraViewpoint | null;
  /** How the view prints. Absent: an orthographic `viewpoint` is an axonometric, anything else a perspective. */
  projection?: ThreeDProjection;
  /** An axonometric seen from a preset corner instead of a saved camera; wins over `viewpoint`'s direction. */
  preset?: AxonometricPreset;
  /** Print as a raster capture of the viewport (always so for a perspective). Absent on an axonometric: vector hidden-line. */
  raster?: ViewRaster | null;
  /** An axonometric printed as a shaded raster instead of vector lines. */
  shaded?: boolean;
  /** A cut-away axonometric (#97): cut at a storey and/or to a section box, and drawn at its nominal scale (see `axonometric.ts`). Vector only. */
  cutaway?: AxonometricCutaway;
}
