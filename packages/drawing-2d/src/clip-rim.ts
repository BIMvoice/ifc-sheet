/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rim of a clip (`GeneratorOptions.clipPlanes`). Meshes a caller clipped
 * open (a cut-away axonometric) have open edges along each clip plane; the
 * caller draws that rim itself, as cut lines through `extraLines`, so the
 * generator leaves those open edges out instead of drawing them a second
 * time as projection lines. Only open (boundary) edges are dropped: a crease
 * lying in a clip plane is real geometry.
 */

import type { EdgeData, Vec3 } from './types.js';

/** A half-space `dot(p, normal) <= offset` (world) the meshes were clipped to. */
export interface ClipPlane {
  normal: Vec3;
  offset: number;
}

/** How far from a clip plane (metres) an open edge's ends may be and still count as the clip's rim. */
const CLIP_RIM_TOLERANCE_M = 1e-4;

/** Whether `edge` is an open edge lying in one of `planes`. */
export function onClipPlane(edge: EdgeData, planes: readonly ClipPlane[]): boolean {
  if (edge.type !== 'boundary') return false;
  return planes.some(({ normal: n, offset }) =>
    Math.abs(edge.v0.x * n.x + edge.v0.y * n.y + edge.v0.z * n.z - offset) <= CLIP_RIM_TOLERANCE_M
    && Math.abs(edge.v1.x * n.x + edge.v1.y * n.y + edge.v1.z * n.z - offset) <= CLIP_RIM_TOLERANCE_M);
}
