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
 * nearest surface (`withOwnSurfaceDepth`, as the Rust outline does), read only
 * from the faces the line lies on: a ring wall's inner outline lies behind its
 * own front wall, which must still hide it. A view from a camera (an
 * axonometric, the 3D-view PDF) keeps main's line work for curved surfaces:
 * there the lowered depth let lines show past the elements in front of them.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { DrawingLine, SectionPlaneConfig, Vec3 } from './types.js';
import type { EdgeExtractor } from './edge-extractor.js';
import type { ProjectionBandDepths } from './projection-bands.js';
import type { ClipPlane } from './clip-rim.js';
import { withOwnSurfaceDepth } from './outline-depth.js';
import type { LocalFaces } from './local-surface.js';
import { planeAffine } from './face-grid.js';
import { faceAdjacency, smoothEdgeFaces, type MeshTopology } from './smooth-fold.js';

export interface SilhouetteLineOptions {
  includeFeatureEdges?: boolean;
  clipPlanes?: readonly ClipPlane[];
  /**
   * Draw the outline of curved surfaces along their smooth edges, with their element's own surface depth: a section,
   * a plan or an elevation, never a view from a camera (`ExteriorViewOptions.cameraView`).
   */
  curvedOutlines: boolean;
}

export function meshSilhouetteLines(
  extractor: EdgeExtractor, mesh: MeshData, plane: SectionPlaneConfig, bands: ProjectionBandDepths, viewDir: Vec3, options: SilhouetteLineOptions,
): DrawingLine[] {
  const edges = extractor.extractEdges(mesh, options.curvedOutlines, viewDir);
  const silhouettes = extractor.extractExteriorEdges(edges, viewDir, options.includeFeatureEdges, options.clipPlanes);
  const curved = silhouettes.filter((e) => e.type === 'smooth');
  if (curved.length === 0) return extractor.edgesToProjectionLines(silhouettes, plane, bands);
  const lines = extractor.edgesToProjectionLines(silhouettes.filter((e) => e.type !== 'smooth'), plane, bands);
  // Each curved line reads its depth from the faces it lies on (`LocalSurface`); the mesh's adjacency is shared.
  let local: LocalFaces | undefined;
  for (const edge of curved) {
    const own = extractor.edgesToProjectionLines([edge], plane, bands);
    const faces = own.length > 0 ? smoothEdgeFaces(edge) : undefined;
    if (!faces) { lines.push(...own); continue; }
    local ??= localFaces(faces.topo, plane);
    lines.push(...withOwnSurfaceDepth(own, plane, mesh, { seeds: faces.seeds, mesh: local }));
  }
  return lines;
}

function localFaces(topo: MeshTopology, plane: SectionPlaneConfig): LocalFaces {
  const n = topo.normals.length;
  return {
    adjacency: faceAdjacency(topo), affine: planeAffine(plane),
    first: new Int32Array(n).fill(-1), count: new Uint8Array(n), pool: new Float64Array(0), used: 0, seen: new Int32Array(n), stamp: 0,
  };
}
