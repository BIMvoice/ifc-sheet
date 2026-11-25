/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The options of `Drawing2DGenerator.generate`, and its progress report (moved out of `drawing-generator.ts`, #863). */

import type { MeshData } from '@ifc-lite/geometry';
import type { DrawingLine, MeshOutline2D, SectionAxis } from './types.js';
import type { ExteriorViewOptions } from './hidden-line.js';

export interface GeneratorOptions extends ExteriorViewOptions {
  /** Use GPU acceleration if available */
  useGPU: boolean;
  /** Include hidden lines in output */
  includeHiddenLines: boolean;
  /** Include projection lines (visible geometry beyond cut) */
  includeProjection: boolean;
  /** Include silhouettes and feature edges */
  includeEdges: boolean;
  /** Merge collinear line segments */
  mergeLines: boolean;
  /**
   * Optional winding-robust outline provider (the Rust `meshOutline2d` WASM
   * binding, issue #979). When supplied, non-extruded geometry projects via
   * this footprint outline instead of the normal-based mesh silhouette (which
   * ifc-lite's unreliable winding can break). Return `null` to fall back to
   * silhouette extraction for that mesh.
   *
   * CARDINAL planes only: the callback receives just (axis, flipped) and its
   * output is in cardinal projection space, so on a custom (face-picked)
   * plane the generator bypasses it and uses the plane-aware silhouette path
   * instead (PR #2644 review).
   */
  outlineProvider?: (mesh: MeshData, axis: SectionAxis, flipped: boolean) => MeshOutline2D | null;
  /**
   * Pre-projected lines merged in BEFORE the hidden-line stage (issue #2042):
   * the section RIM of a CPU half-space clip. Build them with
   * `projectWorldLineSeeds`, never a hand-rolled projection — they must share
   * this config's plane basis and view-depth convention.
   *
   * They are classified alongside the projection lines even though they carry
   * `category: 'cut'`: cutter-produced cut lines sit in the plane at view
   * depth 0 and can never be occluded, but on an oblique 3D view a rim edge
   * can sit behind other geometry and must print dashed.
   */
  extraLines?: DrawingLine[];
  /** Progress callback */
  onProgress?: (stage: string, progress: number) => void;
  /**
   * Called often while the drawing is made: per mesh cut, rasterized or
   * outlined, per element whose polygons are built, per line classified and per
   * group of lines merged. One stage of a large model can run for many
   * seconds without a progress report; a caller that runs the generator off
   * the main thread uses this to say it is still at work (#863). It must be
   * cheap: throttle in the callback, not here.
   */
  onTick?: () => void;
}

export interface GeneratorProgress {
  stage: 'cutting' | 'polygons' | 'edges' | 'hidden' | 'merging' | 'complete';
  progress: number;
  message: string;
}
