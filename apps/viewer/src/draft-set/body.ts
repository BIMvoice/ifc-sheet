/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The building's own extents as the loaded model gives them: the main body
 * of its elements (`extents.ts`), so a stray element far away sizes neither
 * the draft set nor an elevation's plane.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import type { ElevationDirection } from '@/project/types';
import { mainBodyBounds } from './extents';
import { elevationPlaneOffset } from './plan';
import type { Box3 } from './types';

/** An element's box in the viewer frame, metres: its local box carried through its placement. */
function worldBox(mesh: MeshData): Box3 | null {
  const lb = mesh.localBounds;
  const m = mesh.localToWorld;
  if (!lb || !m || m.length < 16) return null;
  const out: Box3 = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? lb.max[0] : lb.min[0], i & 2 ? lb.max[1] : lb.min[1], i & 4 ? lb.max[2] : lb.min[2]];
    const w = [0, 1, 2].map((r) => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]);
    out.min = { x: Math.min(out.min.x, w[0]), y: Math.min(out.min.y, w[1]), z: Math.min(out.min.z, w[2]) };
    out.max = { x: Math.max(out.max.x, w[0]), y: Math.max(out.max.y, w[1]), z: Math.max(out.max.z, w[2]) };
  }
  return Number.isFinite(out.min.x + out.max.x + out.min.y + out.max.y + out.min.z + out.max.z) ? out : null;
}

/** The extents to size the set to: the main body of the model's elements, else the model's whole box. */
export function draftExtents(whole: Box3 | null): { bounds: Box3 | null; leftOut: number } {
  const viewer = useViewerStore.getState();
  const meshes = viewer.models.size > 0 ? Array.from(viewer.models.values()).flatMap((m) => m.geometryResult?.meshes ?? []) : (viewer.geometryResult?.meshes ?? []);
  const boxes = meshes.map(worldBox).filter((b): b is Box3 => b !== null);
  const body = mainBodyBounds(boxes);
  // A body outside the whole box means the placements are not in the frame the bounds are: trust the bounds.
  const inside = body && whole && body.bounds.min.x >= whole.min.x - 1 && body.bounds.max.x <= whole.max.x + 1 && body.bounds.min.z >= whole.min.z - 1 && body.bounds.max.z <= whole.max.z + 1;
  return inside ? body : { bounds: whole, leftOut: 0 };
}

/**
 * Where a new elevation looking at `direction` puts its plane, from the loaded
 * model's main body; `undefined` when no model is loaded (the view then
 * follows the model's whole box).
 */
export function bodyElevationOffset(direction: ElevationDirection): number | undefined {
  const viewer = useViewerStore.getState();
  const { bounds } = draftExtents(mergedSectionBounds(viewer.models, viewer.geometryResult));
  return bounds ? elevationPlaneOffset(direction, bounds) : undefined;
}
