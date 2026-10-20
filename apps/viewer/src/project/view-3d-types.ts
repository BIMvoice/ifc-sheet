/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The 3D view kind and what it prints (moved out of `types.ts`, which re-exports it, for the module-size limit). */

import type { CameraViewpoint } from '@/store/types';
import type { ProjectViewBase } from './types';

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
}
