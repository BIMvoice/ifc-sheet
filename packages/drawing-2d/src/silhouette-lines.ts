/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The projection lines of a mesh drawn by its silhouette (`EdgeExtractor`),
 * the generator's path for a custom plane and for a mesh with no Rust outline.
 *
 * The outline of a curved surface (a handrail, a round column) runs along its
 * smooth edges (`smooth-fold.ts`, #557). It lies on the rim of the surface, so
 * within one raster pixel the surface's own front is nearer than the line, and
 * the hidden-line pass hid FZK's stair column behind itself. In a section, a
 * plan or an elevation those lines take the depth of their element's own
 * nearest surface (`withOwnSurfaceDepth`, as the Rust outline does). A view
 * from outside (an axonometric) keeps a line on its occluder's outline through
 * its own edge tolerance instead, and there the lowered depth let lines show
 * past the elements in front of them, so it is left out.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { DrawingLine, SectionPlaneConfig, Vec3 } from './types.js';
import type { EdgeExtractor } from './edge-extractor.js';
import type { ProjectionBandDepths } from './projection-bands.js';
import type { ClipPlane } from './clip-rim.js';
import { withOwnSurfaceDepth } from './outline-depth.js';

export interface SilhouetteLineOptions {
  includeFeatureEdges?: boolean;
  clipPlanes?: readonly ClipPlane[];
  /** Give the lines of curved surfaces their element's own surface depth: true but for a view from outside. */
  curvesOwnDepth: boolean;
}

export function meshSilhouetteLines(
  extractor: EdgeExtractor, mesh: MeshData, plane: SectionPlaneConfig, bands: ProjectionBandDepths, viewDir: Vec3, options: SilhouetteLineOptions,
): DrawingLine[] {
  const edges = extractor.extractEdges(mesh, true);
  const silhouettes = extractor.extractExteriorEdges(edges, viewDir, options.includeFeatureEdges, options.clipPlanes);
  const curved = silhouettes.filter((e) => e.type === 'smooth');
  if (curved.length === 0) return extractor.edgesToProjectionLines(silhouettes, plane, bands);
  const sharp = extractor.edgesToProjectionLines(silhouettes.filter((e) => e.type !== 'smooth'), plane, bands);
  const curves = extractor.edgesToProjectionLines(curved, plane, bands);
  return [...sharp, ...(options.curvesOwnDepth ? withOwnSurfaceDepth(curves, plane, mesh) : curves)];
}
