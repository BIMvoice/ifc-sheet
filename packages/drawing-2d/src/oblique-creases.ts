/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The corners of a wall seen at an angle, which its outline does not draw (#831).
 *
 * A projection draws an element by its outline (the Rust `meshOutline2d`, or the silhouette): the edge of what it covers
 * in the drawing. Seen square on, every corner of a wall is on that edge: the reveals of a window opening are edge-on, so
 * the opening's outline at the wall's face is where the wall stops. Seen at an angle (the north elevation of a wall at
 * 26.6°), one reveal of each opening turns toward the viewer and is drawn over by the wall itself: the corner between the
 * wall's face and that reveal, and the head and sill across it, are inside the outline and were not drawn, so the opening
 * lost its outline on that side.
 *
 * Those are the creases with a face turned toward the viewer at an angle (neither square on nor edge-on) and no face turned
 * away. A crease with a face turned away is on the outline already; one between a face seen square on and one seen
 * edge-on is too, wherever the outline runs, so a drawing of square walls gains no line. Only walls: the creases of other
 * meshes (furniture, terrain, stairs) are tessellation more often than edges a drawing wants (as `roof-plan.ts`).
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { DrawingLine, SectionPlaneConfig, Vec3 } from './types.js';
import type { EdgeExtractor } from './edge-extractor.js';
import type { ProjectionBandDepths } from './projection-bands.js';
import { vec3Dot, vec3Normalize } from './math.js';
import { withOwnSurfaceDepth } from './outline-depth.js';

/** How far a face must turn toward the viewer to count as seen, as the silhouette test's deadband. */
const FACING_EPSILON = 1e-4;
/** How near square on (the cosine's distance from 1) a face counts as seen square on: within about 2.6°. */
const SQUARE_EPSILON = 1e-3;
/** How near a crease piece must lie to an outline line to be that line (metres across it). */
const ON_OUTLINE = 1e-4;
/** A piece left over shorter than this (metres) is the outline's own end, not a line of its own. */
const MIN_PIECE = 1e-3;

const WALL_TYPES = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE']);

/** Whether `ifcType` is a wall, whose corners seen at an angle are drawn. */
export function isWallType(ifcType: string | undefined | null): boolean {
  return typeof ifcType === 'string' && WALL_TYPES.has(ifcType.toUpperCase());
}

/**
 * The projection lines of the creases of wall `mesh` that face the viewer along `view` at an angle and are not on its
 * `outline` (the lines its outline drew), each with the depth of the wall's own surface by it. None for a mesh that is
 * not a wall.
 */
export function obliqueCreaseLines(
  extractor: EdgeExtractor, mesh: MeshData, plane: SectionPlaneConfig, bands: ProjectionBandDepths, view: Vec3, outline: readonly DrawingLine[],
): DrawingLine[] {
  if (!isWallType(mesh.ifcType)) return [];
  const look = vec3Normalize(view);
  if (!anyFaceAtAngle(mesh, look)) return []; // a wall seen square on: every crease is on its outline
  const seen = extractor.extractEdges(mesh).filter((e) => {
    if (e.type !== 'crease' || !e.face0Normal || !e.face1Normal) return false;
    const a = vec3Dot(e.face0Normal, look), b = vec3Dot(e.face1Normal, look);
    if (a > FACING_EPSILON || b > FACING_EPSILON) return false; // a face turned away: on the outline
    const oblique = (d: number) => d < -FACING_EPSILON && d > -1 + SQUARE_EPSILON;
    return oblique(a) || oblique(b);
  });
  if (seen.length === 0) return [];
  const lines = extractor.edgesToProjectionLines(seen, plane, bands).flatMap((line) => offOutline(line, outline));
  return withOwnSurfaceDepth(lines, plane, mesh);
}

/** Whether some face of `mesh` is seen along `look` neither square on nor edge-on (either winding: the edges come later). */
function anyFaceAtAngle(mesh: MeshData, look: Vec3): boolean {
  const { positions: p, indices } = mesh;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const size = Math.hypot(nx, ny, nz);
    if (!(size > 0)) continue;
    const d = Math.abs(nx * look.x + ny * look.y + nz * look.z) / size;
    if (d > FACING_EPSILON && d < 1 - SQUARE_EPSILON) return true;
  }
  return false;
}

/** The pieces of `line` that no line of `outline` already draws: the parts of it off every outline line along it. */
function offOutline(line: DrawingLine, outline: readonly DrawingLine[]): DrawingLine[] {
  const { start, end } = line.line;
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return [];
  const ux = dx / length, uy = dy / length;
  // The t intervals of `line` that outline lines along it cover.
  const covered: Array<[number, number]> = [];
  for (const o of outline) {
    const a = o.line.start, b = o.line.end;
    const across = (p: { x: number; y: number }) => Math.abs((p.x - start.x) * uy - (p.y - start.y) * ux);
    if (across(a) > ON_OUTLINE || across(b) > ON_OUTLINE) continue;
    const ta = ((a.x - start.x) * ux + (a.y - start.y) * uy) / length;
    const tb = ((b.x - start.x) * ux + (b.y - start.y) * uy) / length;
    const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(1, Math.max(ta, tb));
    if (lo < hi) covered.push([lo, hi]);
  }
  if (covered.length === 0) return [line];
  covered.sort((p, q) => p[0] - q[0]);
  const depthEnd = line.depthEnd ?? line.depth;
  const piece = (t0: number, t1: number): DrawingLine => ({
    ...line,
    line: { start: { x: start.x + dx * t0, y: start.y + dy * t0 }, end: { x: start.x + dx * t1, y: start.y + dy * t1 } },
    depth: line.depth + (depthEnd - line.depth) * t0,
    depthEnd: line.depth + (depthEnd - line.depth) * t1,
  });
  const out: DrawingLine[] = [];
  let from = 0;
  for (const [lo, hi] of covered) {
    if ((lo - from) * length > MIN_PIECE) out.push(piece(from, lo));
    from = Math.max(from, hi);
  }
  if ((1 - from) * length > MIN_PIECE) out.push(piece(from, 1));
  return out;
}
