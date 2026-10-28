/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cut faces of a cut-away axonometric (#97): where a clip plane passes
 * through a solid, the face it leaves.
 *
 * Each face is found the way a plan finds its cut: the section cutter and the
 * polygon builder of `@ifc-lite/drawing-2d` on a cardinal plane, so a storey
 * cut-away fills exactly what the plan at that height fills. A section box
 * then trims each face to the box's other sides (a convex clip in the plane).
 * The faces come back twice: as polygons in the world, for the drawing to
 * project and fill, and as triangles (a cap mesh), for the hidden-line pass,
 * so a clipped wall's cut face hides the inside of the wall.
 */

import { PolygonBuilder, SectionCutter, getProjectionAxes, type DrawingPolygon, type Point2D, type Vec3 } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';

export type Axis = 'x' | 'y' | 'z';

/** A cardinal clip plane: the kept side is `sign * p[axis] <= sign * position`. */
export interface CardinalPlane {
  axis: Axis;
  position: number;
  /** +1 keeps what is below `position` along the axis (the box's max side, the storey cut), -1 what is above (its min side). */
  sign: 1 | -1;
}

/** A face left by one plane, its rings in the world (outer first). */
export interface WorldFace {
  rings: Vec3[][];
  source: DrawingPolygon;
}

/** A 2D rectangle in a plane's own coordinates (`getProjectionAxes`). */
interface Rect {
  min: Point2D;
  max: Point2D;
}

/** The plane's 2D point back in the world: the inverse of `projectTo2D(p, axis, false)`. */
export function liftPoint(p: Point2D, axis: Axis, position: number): Vec3 {
  const { u, v } = getProjectionAxes(axis);
  const out = { x: 0, y: 0, z: 0 };
  out[axis] = position;
  out[u] = p.x;
  out[v] = p.y;
  return out;
}

/** The part of `box` that lies in the plane, in its 2D coordinates; `null` without a box (nothing to trim to). */
function trimRect(plane: CardinalPlane, box: { min: Vec3; max: Vec3 } | null): Rect | null {
  if (!box) return null;
  const { u, v } = getProjectionAxes(plane.axis);
  return { min: { x: box.min[u], y: box.min[v] }, max: { x: box.max[u], y: box.max[v] } };
}

/** Sutherland-Hodgman of one ring against an axis-aligned rectangle (convex, so each ring clips on its own). */
function clipRing(ring: readonly Point2D[], r: Rect): Point2D[] {
  let out: Point2D[] = [...ring];
  const edges: ((p: Point2D) => number)[] = [
    (p) => p.x - r.min.x, (p) => r.max.x - p.x, (p) => p.y - r.min.y, (p) => r.max.y - p.y,
  ];
  for (const inside of edges) {
    if (out.length === 0) break;
    const next: Point2D[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      const b = out[(i + 1) % out.length];
      const da = inside(a);
      const db = inside(b);
      if (da >= 0) next.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    out = next;
  }
  return out;
}

function ringArea(ring: readonly Point2D[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * The faces `plane` cuts from `meshes`, trimmed to `box`, as 2D rings in the
 * plane (outer first, then holes) with their source polygon. A ring the box
 * trims to nothing is dropped; an outer ring trimmed to nothing drops the face.
 */
export function planeFaces(meshes: readonly MeshData[], plane: CardinalPlane, box: { min: Vec3; max: Vec3 } | null): { rings: Point2D[][]; source: DrawingPolygon }[] {
  const cutter = new SectionCutter({ axis: plane.axis, position: plane.position, flipped: false });
  const { segments } = cutter.cutMeshes([...meshes]);
  const polygons = new PolygonBuilder().buildPolygons(segments);
  const rect = trimRect(plane, box);
  const out: { rings: Point2D[][]; source: DrawingPolygon }[] = [];
  for (const source of polygons) {
    const rings = [source.polygon.outer, ...source.polygon.holes].map((ring) => (rect ? clipRing(ring, rect) : [...ring]));
    if (rings[0].length < 3 || Math.abs(ringArea(rings[0])) < 1e-12) continue;
    out.push({ rings: [rings[0], ...rings.slice(1).filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= 1e-12)], source });
  }
  return out;
}

/**
 * Triangles covering the even-odd fill of `rings`, by horizontal strips: the
 * strip between two consecutive vertex heights is crossed by the same edges
 * all the way, so each pair of crossings at its mid-height bounds one
 * trapezoid. Exact for any simple rings with holes, no ear search, and
 * `O(vertices^2)` on a face, which a cut face (a wall, a column, a slab
 * outline) keeps small. Returned as flat 2D triples.
 */
export function fillTriangles(rings: readonly (readonly Point2D[])[]): Point2D[] {
  const edges: [Point2D, Point2D][] = [];
  const ys = new Set<number>();
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      ys.add(a.y);
      if (a.y !== b.y) edges.push([a, b]);
    }
  }
  const levels = [...ys].sort((a, b) => a - b);
  const xAt = ([a, b]: [Point2D, Point2D], y: number): number => a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  const out: Point2D[] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const y0 = levels[i];
    const y1 = levels[i + 1];
    const mid = (y0 + y1) / 2;
    const crossing = edges.filter(([a, b]) => (a.y <= mid) !== (b.y <= mid));
    crossing.sort((e, f) => xAt(e, mid) - xAt(f, mid));
    for (let k = 0; k + 1 < crossing.length; k += 2) {
      const l = crossing[k];
      const r = crossing[k + 1];
      const bl = { x: xAt(l, y0), y: y0 };
      const br = { x: xAt(r, y0), y: y0 };
      const tl = { x: xAt(l, y1), y: y1 };
      const tr = { x: xAt(r, y1), y: y1 };
      out.push(bl, br, tr, bl, tr, tl);
    }
  }
  return out;
}

/** One mesh of every face's triangles, in the world, for the depth buffer only (it draws nothing). */
export function capMesh(faces: readonly { rings: Point2D[][] }[], plane: CardinalPlane): MeshData | null {
  const positions: number[] = [];
  for (const face of faces) {
    for (const p of fillTriangles(face.rings)) {
      const w = liftPoint(p, plane.axis, plane.position);
      positions.push(w.x, w.y, w.z);
    }
  }
  if (positions.length === 0) return null;
  const count = positions.length / 3;
  const normal = { x: 0, y: 0, z: 0 };
  normal[plane.axis] = plane.sign;
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < count; i++) {
    normals[i * 3] = normal.x;
    normals[i * 3 + 1] = normal.y;
    normals[i * 3 + 2] = normal.z;
  }
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  return { expressId: 0, ifcType: 'IfcAnnotation', modelIndex: 0, positions: new Float32Array(positions), normals, indices, color: [0, 0, 0, 0] };
}
