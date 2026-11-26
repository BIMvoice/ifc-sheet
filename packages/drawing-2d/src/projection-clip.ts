/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from './types.js';
import { getViewDirectionForPlane, looksUp } from './projection-bands.js';
import { clipMeshToHalfSpace } from './half-space-clip.js';

/** Clip in 3D BEFORE discarding depth in a projected footprint (#6615).
 * Origins and source buffers are preserved by the existing clipper. */
export function clipMeshToProjectionWindow(
  mesh: MeshData, plane: SectionPlaneConfig, minDepth: number, maxDepth: number,
): MeshData | null {
  if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth) || maxDepth <= minDepth) return null;
  const view = getViewDirectionForPlane(plane);
  const offset = (plane.customPlane?.distance ?? plane.position) * (looksUp(plane) ? 1 : -1);
  const far = clipMeshToHalfSpace(mesh, view, offset + maxDepth).mesh;
  if (!far) return null;
  return clipMeshToHalfSpace(far, { x: -view.x, y: -view.y, z: -view.z }, -offset - minDepth).mesh;
}

/** A piece of a mesh clipped to one projection band, and which band: what it draws is solid below the cut, dashed above. */
export interface ProjectionBandPiece {
  mesh: MeshData;
  band: 'visible' | 'overhead';
}

/**
 * `mesh` clipped to the band below the cut and to the band above it. Each piece says which band it is, because its own
 * extent cannot: a piece above the cut has its lowest vertex ON the cut, and read back in f32 (the Rust outline's
 * `axisMin`, 136.39999 for a 136.4 m cut) it lies a few micrometres below, so a classification by extent called the
 * wall over an opening "spanning" and drew it solid across the room (skolebygg Plan 02, 2026-11-26).
 */
export function projectionBandPieces(mesh: MeshData, plane: SectionPlaneConfig, below: number, above: number): ProjectionBandPiece[] {
  const pieces: ProjectionBandPiece[] = [];
  const under = clipMeshToProjectionWindow(mesh, plane, 0, below);
  if (under) pieces.push({ mesh: under, band: 'visible' });
  const over = clipMeshToProjectionWindow(mesh, plane, -above, 0);
  if (over) pieces.push({ mesh: over, band: 'overhead' });
  return pieces;
}
