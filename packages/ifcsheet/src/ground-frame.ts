/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room the ground takes in the frame of a facade elevation and a section (#557). The ground a view draws
 * (`drawingWithGround`) lies outside the building's own extent: an elevation's ground line runs `GROUND_OVERHANG_M` past the
 * walls and can be below the lowest wall, a section's earth block is as wide as the terrain and goes `DEPTH_SHARE` of the
 * building below it. The app frames its drawings on all their geometry, so it shows the ground whole; the engine frames the
 * viewport on `viewExtent`, so that must include it, or the frame clips what the drawing draws.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { ModelExtent } from './drawing-set.js';
import type { ProjectView } from './document.js';
import { DEPTH_SHARE, GROUND_OVERHANG_M } from './ground.js';

/** What the ground reaches, viewer frame, metres: the terrain's footprint and the lowest and highest its top surface gets. */
export interface GroundReach {
  min: { x: number; z: number };
  max: { x: number; z: number };
  topMin: number;
  topMax: number;
}

/** The reach of `terrain` (its footprint, and the heights of its upward-facing faces); undefined for none. */
export function groundReachOf(terrain: readonly MeshData[]): GroundReach | undefined {
  let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
  let topMin = Infinity; let topMax = -Infinity;
  let lowest = Infinity; let highest = -Infinity;
  for (const m of terrain) {
    // world = origin + position: a mesh is in its element's own frame (`origin`), as `entity-bounds.ts` reads it.
    const [ox, oy, oz] = m.origin ?? [0, 0, 0];
    for (let i = 0; i + 2 < m.positions.length; i += 3) {
      const x = m.positions[i] + ox; const y = m.positions[i + 1] + oy; const z = m.positions[i + 2] + oz;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      lowest = Math.min(lowest, y); highest = Math.max(highest, y);
      if (m.normals[i + 1] > 0.5) { topMin = Math.min(topMin, y); topMax = Math.max(topMax, y); }
    }
  }
  if (!Number.isFinite(minX)) return undefined;
  const top = Number.isFinite(topMin);
  return { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ }, topMin: top ? topMin : lowest, topMax: top ? topMax : highest };
}

/**
 * The width and height of a facade elevation or section frame that holds the ground as well as the building, or null when
 * the view draws no ground in it (a plan, a detail, an interior elevation, an extent without ground).
 */
export function groundedViewExtent(view: ProjectView, extent: ModelExtent): { w: number; h: number } | null {
  const g = extent.ground;
  if (!g || view.detail) return null;
  const dx = extent.max.x - extent.min.x;
  const dz = extent.max.z - extent.min.z;
  const dy = extent.max.y - extent.min.y;
  if (view.kind === 'elevation' && !view.interior) {
    const across = view.direction === 'north' || view.direction === 'south' ? dx : dz;
    const low = Math.min(extent.min.y, g.topMin);
    return { w: across + 2 * GROUND_OVERHANG_M, h: Math.max(extent.max.y, g.topMax) - low };
  }
  if (view.kind === 'section') {
    const ux = Math.max(extent.max.x, g.max.x) - Math.min(extent.min.x, g.min.x);
    const uz = Math.max(extent.max.z, g.max.z) - Math.min(extent.min.z, g.min.z);
    const n = view.plane.custom?.normal;
    const across = n ? Math.abs(n[0]) * uz + Math.abs(n[2]) * ux : Math.max(ux, uz);
    // The earth goes down a share of the building's own drawing, which is at most as large as the building's extent.
    const drop = DEPTH_SHARE * Math.max(n ? Math.abs(n[0]) * dz + Math.abs(n[2]) * dx : Math.max(dx, dz), dy);
    return { w: across, h: Math.max(extent.max.y, g.topMax) - (extent.min.y - drop) };
  }
  return null;
}
