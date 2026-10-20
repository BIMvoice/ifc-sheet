/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Interior elevations of a room: one elevation view per wall face, each
 * looking at its wall from inside the room, cropped to the wall, named after
 * the room and the side the wall is on. Pure: a room's footprint in, views
 * out, and the sheet they hang on together.
 *
 * An interior elevation is an elevation view with its own plane and a crop,
 * drawn by the one view pipeline: the plane is a custom section plane
 * (`view-plane.ts` resolves it like a section's), the crop is applied by
 * `drawingAsViewShows`.
 *
 * Frame (viewer, Y-up, `[x, z, -y]` from IFC): a footprint point is plan
 * (x, z) stored as `Pt` (x, y); project north is IFC +Y, viewer −Z.
 *
 * Left and right. A drawing point is `x = dot(p − origin, tangent)`
 * (`projectTo2DBasis`), and the sheet and the drawing canvas put it on paper
 * as `kx · x` with `kx = −1` for a cut whose axis is `side`, else 1
 * (`screenSigns` in `drafting/frame.ts`, `viewportTransform` in
 * `SheetPaper.tsx`). So the plane's tangent must be the viewer's right on a
 * `front` cut and their left on a `side` cut. Taking the normal toward the
 * wall (flipped: looked at from behind) on a `front` cut and back into the
 * room on a `side` cut gives exactly that with the renderer's own
 * `planeBasis(normal)` (tangent `normal × Y`), so the 3D cap and the drawing
 * share one basis, bitangent up.
 */

import { planeBasis } from '@ifc-lite/renderer';
import type { Pt } from '@/drafting/types';
import { choosePaper, drawingArea, fitsScale, fittingScale, nextInSeries, rowOfViewports, SET_PAPERS } from './drawing-set';
import { freshProjectId } from './view-defaults';
import type { ElevationDirection, InteriorElevation, NewProjectView, ProjectSheet, SectionProjectPlane } from './types';

export interface InteriorElevationOptions {
  /** Wall faces shorter than this are skipped, metres. */
  minFaceLength: number;
  /** How far the view sees beyond the wall face, metres: into the wall, short of the next room. */
  beyond: number;
  /** How far the plane stays inside the room from its far side, metres. */
  standoff: number;
  /** Extra width either side of the wall in the crop, metres. */
  margin: number;
}

export const INTERIOR_ELEVATION_DEFAULTS: InteriorElevationOptions = { minFaceLength: 0.3, beyond: 0.3, standoff: 0.05, margin: 0 };

/** An interior elevation as it is added to the project. */
export type InteriorElevationView = Extract<NewProjectView, { kind: 'elevation' }> & { id: string; interior: InteriorElevation };

/** A room as its interior elevations need it. */
export interface InteriorRoom {
  /** IfcSpace GlobalId. */
  guid: string;
  /** Number and name, as the views are named ("4 Schlafzimmer"). */
  label: string;
  /** Footprint, plan (x, z) as `Pt` (x, y). */
  ring: readonly Pt[];
  /** Floor and top of the room, viewer Y, metres. */
  floor: number;
  top: number;
}

/** One wall face of a room. */
export interface WallFace {
  /** Its ends, plan, as seen from inside the room: on the viewer's left, then right. */
  left: Pt;
  right: Pt;
  /** Unit plan direction from the room toward the wall. */
  out: Pt;
  length: number;
}

/** Distance under which a footprint vertex sits on the line of its neighbours, metres. */
const COLLINEAR_M = 0.01;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const len = (a: Pt): number => Math.hypot(a.x, a.y);
/** The viewer's right when looking along plan direction `d`: `d × up` in the viewer frame is (−d.z, d.x). */
const rightOf = (d: Pt): Pt => ({ x: -d.y, y: d.x });

/** `ring` without repeated points and without vertices on the line through their neighbours. */
export function simplifyRing(ring: readonly Pt[]): Pt[] {
  let pts = ring.filter((p, i) => len(sub(p, ring[(i + 1) % ring.length])) > 1e-6);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const ac = sub(c, a);
      const l = len(ac);
      const t = l > 0 ? dot(sub(b, a), ac) / (l * l) : -1;
      const off = l > 0 ? Math.abs(ac.x * (b.y - a.y) - ac.y * (b.x - a.x)) / l : Infinity;
      if (t > 0 && t < 1 && off < COLLINEAR_M) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        i--;
      }
    }
  }
  return pts;
}

const signedArea = (ring: readonly Pt[]): number => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

/** The wall faces of a footprint: one per edge, collinear edges merged, short ones skipped; in the footprint's order. */
export function wallFaces(ring: readonly Pt[], minFaceLength = INTERIOR_ELEVATION_DEFAULTS.minFaceLength): WallFace[] {
  const pts = simplifyRing(ring);
  if (pts.length < 3) return [];
  // The room is on the left of each edge of a ring with positive area, on the right otherwise.
  const ccw = signedArea(pts) > 0;
  return pts.flatMap((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const d = sub(b, a);
    const length = len(d);
    if (length < minFaceLength) return [];
    const inward = ccw ? { x: -d.y / length, y: d.x / length } : { x: d.y / length, y: -d.x / length };
    const out = { x: -inward.x, y: -inward.y };
    const [left, right] = dot(a, rightOf(out)) <= dot(b, rightOf(out)) ? [a, b] : [b, a];
    return [{ left, right, out, length }];
  });
}

/** The side of the room a wall is on: its outward direction against project north (IFC +Y, viewer −Z), by quadrant. */
export function compassSide(out: Pt): ElevationDirection {
  const bearing = (Math.atan2(out.x, -out.y) * 180) / Math.PI; // clockwise from north
  if (bearing >= -45 && bearing < 45) return 'north';
  if (bearing >= 45 && bearing < 135) return 'east';
  if (bearing >= -135 && bearing < -45) return 'west';
  return 'south';
}

/** Where a ray from `from` along `dir` first meets the ring's edges other than `skip`, as a distance; Infinity when it meets none. */
function rayHit(ring: readonly Pt[], from: Pt, dir: Pt, skip: number): number {
  let best = Infinity;
  ring.forEach((a, i) => {
    if (i === skip) return;
    const e = sub(ring[(i + 1) % ring.length], a);
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-12) return;
    const w = sub(a, from);
    const t = (w.x * e.y - w.y * e.x) / den;
    const u = (w.x * dir.y - w.y * dir.x) / den;
    if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
  });
  return best;
}

/**
 * How deep the room is in front of a face: the least distance, across the
 * face's width, from the face to the room's boundary straight ahead. The
 * plane sits there, so what stands in the room in front of the wall is seen
 * in elevation, and nothing beyond the room is between the plane and the wall.
 */
export function clearDepth(ring: readonly Pt[], face: WallFace): number {
  const pts = simplifyRing(ring);
  const skip = pts.findIndex((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return (len(sub(p, face.left)) < 1e-6 && len(sub(q, face.right)) < 1e-6) || (len(sub(p, face.right)) < 1e-6 && len(sub(q, face.left)) < 1e-6);
  });
  const inward = { x: -face.out.x, y: -face.out.y };
  let depth = Infinity;
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    const at = { x: face.left.x + (face.right.x - face.left.x) * t, y: face.left.y + (face.right.y - face.left.y) * t };
    depth = Math.min(depth, rayHit(pts, at, inward, skip));
  }
  return depth;
}

/**
 * The plane of an interior elevation: parallel to the face, `depth` metres
 * inside the room, looking at the face, with its basis origin at height 0 so
 * drawing y is world height like a facade elevation's. See the module note
 * for the axis, normal and flip.
 */
export function interiorPlane(face: WallFace, depth: number): SectionProjectPlane {
  const view: [number, number, number] = [face.out.x, 0, face.out.y];
  const axis = Math.abs(view[2]) >= Math.abs(view[0]) ? 'front' : 'side';
  const normal: [number, number, number] = axis === 'front' ? view : [-view[0], 0, -view[2]];
  const mid = { x: (face.left.x + face.right.x) / 2, y: (face.left.y + face.right.y) / 2 };
  const pickedAt: [number, number, number] = [mid.x - face.out.x * depth, 0, mid.y - face.out.y * depth];
  const { tangent, bitangent } = planeBasis(normal);
  const distance = pickedAt[0] * normal[0] + pickedAt[2] * normal[2];
  return { axis, offset: axis === 'front' ? pickedAt[2] : pickedAt[0], flipped: axis === 'front', custom: { normal, distance, pickedAt, tangent, bitangent } };
}

/** A plan point at height `y` in the drawing coordinates of `plane` (`projectTo2DBasis`). */
export function onInteriorPlane(plane: SectionProjectPlane, p: Pt, y: number): Pt {
  const c = plane.custom!;
  const d = [p.x - c.pickedAt[0], y - c.pickedAt[1], p.y - c.pickedAt[2]];
  return { x: d[0] * c.tangent[0] + d[1] * c.tangent[1] + d[2] * c.tangent[2], y: d[0] * c.bitangent[0] + d[1] * c.bitangent[1] + d[2] * c.bitangent[2] };
}

const SIDE_NAMES: Record<ElevationDirection, string> = { north: 'North', east: 'East', south: 'South', west: 'West' };

/** One elevation of `room`'s face, before it is named. */
export function interiorElevation(room: InteriorRoom, face: WallFace, options: InteriorElevationOptions = INTERIOR_ELEVATION_DEFAULTS): { interior: InteriorElevation; viewDepth: number; direction: ElevationDirection } {
  const ahead = clearDepth(room.ring, face);
  const depth = Number.isFinite(ahead) ? Math.max(options.standoff, ahead - options.standoff) : options.standoff;
  const plane = interiorPlane(face, depth);
  const xs = [onInteriorPlane(plane, face.left, 0).x, onInteriorPlane(plane, face.right, 0).x];
  const crop = { min: { x: Math.min(...xs) - options.margin, y: room.floor }, max: { x: Math.max(...xs) + options.margin, y: room.top } };
  return { interior: { room: room.guid, plane, crop }, viewDepth: depth + options.beyond, direction: compassSide(face.out) };
}

/**
 * The interior elevations of `room`, one per wall face, clockwise from the
 * one facing nearest north. Named "<room> – <side>"; a side with several
 * faces numbers them ("North 1", "North 2"), clockwise.
 */
export function interiorElevationViews(room: InteriorRoom, options: InteriorElevationOptions = INTERIOR_ELEVATION_DEFAULTS): InteriorElevationView[] {
  // Clockwise bearing of the face, starting where the north quadrant starts.
  const bearing = (f: WallFace) => ((Math.atan2(f.out.x, -f.out.y) * 180) / Math.PI + 405) % 360;
  const faces = wallFaces(room.ring, options.minFaceLength).sort((a, b) => bearing(a) - bearing(b));
  const made = faces.map((face) => interiorElevation(room, face, options));
  const count = new Map<ElevationDirection, number>();
  for (const m of made) count.set(m.direction, (count.get(m.direction) ?? 0) + 1);
  const seen = new Map<ElevationDirection, number>();
  return made.map(({ interior, viewDepth, direction }) => {
    const n = (seen.get(direction) ?? 0) + 1;
    seen.set(direction, n);
    const side = (count.get(direction) ?? 0) > 1 ? `${SIDE_NAMES[direction]} ${n}` : SIDE_NAMES[direction];
    return { id: freshProjectId('view'), kind: 'elevation', name: `${room.label} – ${side}`, direction, viewDepth, interior };
  });
}

/** The scale interior elevations are drawn at when they fit. */
export const INTERIOR_SCALE = 50;

/**
 * The sheet a room's interior elevations hang on together, in one row: the
 * smallest paper that takes them at 1:50, else the set's paper and scale
 * choice (`choosePaper`, `fittingScale`). Numbered next in the interiors
 * series (A-4xx), apart from the facade elevations, so rescaling those
 * leaves it alone.
 */
export function interiorElevationSheet(label: string, views: readonly InteriorElevationView[], sheets: readonly Pick<ProjectSheet, 'number'>[], now = Date.now()): ProjectSheet {
  const sizes = views.map(({ interior: { crop } }) => ({ w: crop.max.x - crop.min.x, h: crop.max.y - crop.min.y }));
  const paper = SET_PAPERS.find((p) => fitsScale(sizes, drawingArea(p), INTERIOR_SCALE)) ?? choosePaper([sizes]).paper;
  const area = drawingArea(paper);
  const scale = fitsScale(sizes, area, INTERIOR_SCALE) ? INTERIOR_SCALE : fittingScale(sizes, area);
  return {
    id: freshProjectId('sheet'), number: nextInSeries(sheets, 'interiors'), name: `${label} – Interior elevations`, createdAt: now, paper, orientation: 'landscape',
    viewports: rowOfViewports(views, sizes, scale, paper),
  };
}
