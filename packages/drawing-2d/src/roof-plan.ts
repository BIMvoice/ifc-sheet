/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A roof in a plan (#490): drawn whole down to its eaves, with its ridges, hips and valleys.
 *
 * A plan's projection stops at its band's floor, which is right for a floor but cuts a roof seen from above into a
 * contour: Bonsai's roof plan, 1.2 m deep from the model's top, drew a smaller L at 3.8 m for a roof with eaves at
 * 3.0 m. A roof the band reaches into is seen down to its lowest point (`roofBands`).
 *
 * A roof that is not an extrusion (Bonsai's gable roof, any IfcRoof with a body of its own) projects in a plan by its
 * outline (`meshOutline2d`, or the silhouette): the eaves and nothing inside them, so a roof plan showed an empty L.
 * Its slopes meet at creases that face the viewer on both sides; those are the lines a roof plan draws. A crease with
 * one side turned away is on the outline already, and one with both sides turned away is the roof's underside.
 *
 * Only for a plan (looking down, or up in a reflected ceiling plan) and only for an IfcRoof: in a plan, the creases of
 * other meshes (furniture, terrain, stairs) are tessellation more often than edges a drawing wants.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { DrawingLine, SectionPlaneConfig } from './types.js';
import { EdgeExtractor } from './edge-extractor.js';
import { getViewDirectionForPlane, signedDepth, type ProjectionBandDepths } from './projection-bands.js';
import { vec3, vec3Dot, vec3Normalize } from './math.js';
import { withOwnSurfaceDepth } from './outline-depth.js';

/**
 * The least angle between two slopes that is drawn, 10°: a ridge between two 5° slopes. Lower than the generator's
 * 30° crease angle, which leaves out the ridge of any roof pitched under 15°.
 */
const ROOF_CREASE_DEGREES = 10;

/** How far a face must turn toward the viewer to count as seen, as the silhouette test's deadband. */
const FACING_EPSILON = 1e-4;

const extractor = new EdgeExtractor(ROOF_CREASE_DEGREES);

/** Whether `ifcType` is a roof whose creases a plan draws. */
export function isRoofType(ifcType: string | undefined | null): boolean {
  return typeof ifcType === 'string' && ifcType.toUpperCase() === 'IFCROOF';
}

/**
 * The projection lines of the creases of `mesh` whose two faces both face the viewer of `plane`: the ridges, hips and
 * valleys of a roof seen in a plan. None for a mesh that is not a roof or a plane that is not a plan's.
 */
export function roofCreaseLines(mesh: MeshData, plane: SectionPlaneConfig, bands: ProjectionBandDepths): DrawingLine[] {
  if (plane.axis !== 'y' || plane.customPlane || !isRoofType(mesh.ifcType)) return [];
  const view = vec3Normalize(getViewDirectionForPlane(plane));
  const seen = extractor.extractEdges(mesh).filter((e) => e.type === 'crease' && e.face0Normal !== null && e.face1Normal !== null
    && vec3Dot(e.face0Normal, view) < -FACING_EPSILON && vec3Dot(e.face1Normal, view) < -FACING_EPSILON);
  // Each line takes the depth of the roof's own surface by it, so the slopes beside a hip never hide it (`outline-depth.ts`).
  return withOwnSurfaceDepth(extractor.edgesToProjectionLines(seen, plane, bands), plane, mesh);
}

/**
 * The bands `mesh` is projected with in a plan: `bands`, deepened to the lowest point of a roof that reaches into them
 * (or through the cut), so the roof is drawn to its eaves rather than cut off at the band's floor.
 */
export function roofBands(mesh: MeshData, plane: SectionPlaneConfig, bands: ProjectionBandDepths): ProjectionBandDepths {
  if (plane.axis !== 'y' || plane.customPlane || bands.below <= 0 || !isRoofType(mesh.ifcType)) return bands;
  const { positions, origin } = mesh;
  const [ox, oy, oz] = origin ?? [0, 0, 0];
  let nearest = -Infinity;
  let farthest = Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const d = signedDepth(vec3(positions[i] + ox, positions[i + 1] + oy, positions[i + 2] + oz), plane);
    if (d > nearest) nearest = d;
    if (d < farthest) farthest = d;
  }
  return nearest >= -bands.below && -farthest > bands.below ? { ...bands, below: -farthest } : bands;
}
