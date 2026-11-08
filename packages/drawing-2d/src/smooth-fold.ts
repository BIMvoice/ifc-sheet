/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether a smooth mesh edge is on the outline of its surface seen from a
 * direction (#557).
 *
 * The outline of a curved surface (a handrail, a rail, a round column, a
 * helical stringer) runs along SMOOTH edges, whose faces meet at less than the
 * crease angle. A smooth edge is on the outline where the surface folds over
 * in the view: one face turns toward the viewer and the other away.
 *
 * Between them may lie faces seen exactly edge-on (the top facet of a tube
 * seen level, the strip of a terrain where it is level along the view). Such a
 * face has no area in the view, so the edge beside it is on the outline only
 * when the surface on its far side folds back to the same side of the edge as
 * the near face: the top facet of a tube, whose far neighbour turns away. When
 * a face turned toward the viewer continues on the far side, the surface runs
 * on without a fold and the edge is a line through its middle: the edges of a
 * terrain's level strip, which a section drew as lines across the terrain.
 */

import type { EdgeData, Vec3 } from './types.js';
import { vec3, vec3Cross, vec3Dot, vec3Normalize } from './math.js';

/** A mesh's welded faces and edge adjacency, as `EdgeExtractor.extractEdges` built them. */
export interface MeshTopology {
  positions: Float32Array;
  origin?: [number, number, number];
  /** Welded triangle indices (one index per position). */
  indices: Uint32Array;
  /** Outward face normals, one per triangle. */
  normals: Vec3[];
  /** The faces on each edge, keyed `min:max` of its welded indices. */
  edgeFaces: Map<string, { faceIndices: number[] }>;
}

/** Edge-on faces walked through at most, per edge: the whole flat strip of a tube or a terrain. */
const MAX_WALK = 256;

const smoothEdges = new WeakMap<EdgeData, { topo: MeshTopology; f0: number; f1: number }>();

/** Remember the mesh and the two faces of a smooth edge, for `smoothEdgeOnOutline`. */
export function registerSmoothEdge(edge: EdgeData, topo: MeshTopology, f0: number, f1: number): void {
  smoothEdges.set(edge, { topo, f0, f1 });
}

/**
 * Whether the smooth `edge` is on the outline seen along `view` (normalised).
 * A face is toward the viewer under `-epsilon`, away over `epsilon`, edge-on between.
 */
export function smoothEdgeOnOutline(edge: EdgeData, view: Vec3, epsilon: number): boolean {
  const entry = smoothEdges.get(edge);
  if (!entry) return false;
  const { topo, f0, f1 } = entry;
  const side = (f: number): number => {
    const d = vec3Dot(topo.normals[f], view);
    return d < -epsilon ? -1 : d > epsilon ? 1 : 0;
  };
  const s0 = side(f0);
  const s1 = side(f1);
  if (s0 === s1) return false;
  if (s0 !== 0 && s1 !== 0) return true; // one toward the viewer, one away
  if (s0 === 1 || s1 === 1) return false; // away and edge-on: no face toward the viewer here
  return foldsBeyond(topo, s0 === -1 ? f0 : f1, s0 === -1 ? f1 : f0, edge, view, side);
}

/**
 * Walk the edge-on faces from `edgeOn` and say whether no face toward the
 * viewer lies beyond them on the other side of `edge` from `front`.
 */
function foldsBeyond(topo: MeshTopology, front: number, edgeOn: number, edge: EdgeData, view: Vec3, side: (f: number) => number): boolean {
  const u = vec3Normalize(vec3Cross(view, Math.abs(view.x) < 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0)));
  const v = vec3Cross(view, u);
  const ax = vec3Dot(edge.v0, u), ay = vec3Dot(edge.v0, v);
  const dx = vec3Dot(edge.v1, u) - ax, dy = vec3Dot(edge.v1, v) - ay;
  const sideOf = (p: Vec3): number => dx * (vec3Dot(p, v) - ay) - dy * (vec3Dot(p, u) - ax);
  const scale = Math.hypot(dx, dy);
  const tolerance = 1e-9 * Math.max(scale * scale, 1e-12);
  const near = sideOf(oppositeVertex(topo, front, edge, edgeOn));
  if (Math.abs(near) <= tolerance) return true;

  const seen = new Set<number>([front, edgeOn]);
  const queue = [edgeOn];
  for (let q = 0; q < queue.length && q < MAX_WALK; q++) {
    const g = queue[q];
    for (let k = 0; k < 3; k++) {
      const a = topo.indices[g * 3 + k], b = topo.indices[g * 3 + ((k + 1) % 3)];
      const shared = topo.edgeFaces.get(`${Math.min(a, b)}:${Math.max(a, b)}`);
      if (!shared) continue;
      for (const h of shared.faceIndices) {
        if (seen.has(h)) continue;
        seen.add(h);
        const s = side(h);
        if (s === 0) { queue.push(h); continue; }
        if (s !== -1) continue;
        const far = sideOf(vertexOff(topo, h, a, b));
        if (Math.abs(far) > tolerance && Math.sign(far) !== Math.sign(near)) return false;
      }
    }
  }
  return true;
}

/** The vertex of face `f` not on the edge it shares with face `other`. */
function oppositeVertex(topo: MeshTopology, f: number, edge: EdgeData, other: number): Vec3 {
  const shared = new Set([0, 1, 2].map((k) => topo.indices[other * 3 + k]));
  for (let k = 0; k < 3; k++) {
    const i = topo.indices[f * 3 + k];
    if (!shared.has(i)) return vertex(topo, i);
  }
  return edge.v0;
}

/** The vertex of face `f` that is neither `a` nor `b`. */
function vertexOff(topo: MeshTopology, f: number, a: number, b: number): Vec3 {
  for (let k = 0; k < 3; k++) {
    const i = topo.indices[f * 3 + k];
    if (i !== a && i !== b) return vertex(topo, i);
  }
  return vertex(topo, a);
}

function vertex(topo: MeshTopology, i: number): Vec3 {
  const o = topo.origin;
  const p = topo.positions;
  return o ? vec3(p[i * 3] + o[0], p[i * 3 + 1] + o[1], p[i * 3 + 2] + o[2]) : vec3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
}
