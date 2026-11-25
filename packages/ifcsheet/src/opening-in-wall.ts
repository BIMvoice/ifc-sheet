/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door's plan symbol is drawn on the rectangle round the door's own mesh (`opening-symbols.ts`). That mesh is the leaf and its
 * frame, not the opening: a frame is often thinner than the wall it stands in (the door sits in the outer half of the wall, its
 * leaf then starting mid-wall) and wider than the hole by its lining (the jambs lie inside the wall's cut). Drawn on that
 * rectangle, the hinge, the leaf and the swing arc lie over the wall band (#678).
 *
 * `fitToHostWall` puts the rectangle where the wall says the opening is: its depth the wall's thickness, centred in the wall, and
 * its width the gap the wall's own vertices leave at the plan's cut (the void's jamb faces). A wall that shows no such gap leaves the
 * rectangle as it was.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { OpeningRect } from './opening-symbols.js';
import { drawingProjector } from './drawing-frame.js';

/** How far beyond the opening's ends the wall's thickness is read, in metres: a wall's two faces run past the jambs. */
const READ_BEYOND = 0.3;
/** A vertex this close to a limit is on it, not inside it, in metres. */
const EPS = 1e-3;
/** How far a thin door's faces may lie off the wall's band and still be a door in that wall, in metres. */
const PROUD = 0.05;
/** Vertices this close together, in metres, are one jamb. */
const CLUSTER = 0.005;
/** The thickest wall a door is fitted to: a thicker host is not read as one wall band. */
const MAX_THICKNESS = 1.2;
/**
 * How far inside the ends of a door's frame its void's jambs may lie, in metres: the frame's lining or casing past the jamb (25 mm in
 * #678's house, 70 mm for the wrap-around frames measured for #831). A wall's vertices farther inside are not the void's faces.
 */
const MAX_LINING = 0.15;

/**
 * Where most of `vs` lie along the wall, within a few millimetres of each other, of the places the plan's cut at height `cut` passes
 * through (a jamb face runs from below the cut to above it): the largest such cluster's mean (the nearer to the middle of a tie), null
 * for none. A wall's vertices inside an opening's width that all lie above or below the cut (the corners of its faces' triangles round
 * the head, a narrower void higher up) are not the jamb the plan shows (#831).
 */
function jambOf(vs: readonly { s: number; h: number }[], cut: number): number | null {
  const sorted = [...vs].sort((a, b) => a.s - b.s);
  const groups: { s: number; h: number }[][] = [];
  for (const v of sorted) {
    const last = groups[groups.length - 1];
    if (last && v.s - last[last.length - 1].s <= CLUSTER) last.push(v); else groups.push([v]);
  }
  const jambs = groups.filter((g) => g.some((v) => v.h <= cut + EPS) && g.some((v) => v.h >= cut - EPS));
  if (jambs.length === 0) return null;
  const mean = (g: { s: number }[]) => g.reduce((a, v) => a + v.s, 0) / g.length;
  return mean(jambs.reduce((best, g) => (g.length > best.length || (g.length === best.length && Math.abs(mean(g)) < Math.abs(mean(best))) ? g : best)));
}

/** `rect` fitted to the wall `host` (its meshes) the door stands in; `rect` itself when the wall does not show the opening. */
export function fitToHostWall(rect: OpeningRect, host: readonly MeshData[], plane: SectionPlaneConfig, standsProud = false): OpeningRect {
  const at: { s: number; t: number; h: number }[] = [];
  const project = drawingProjector(plane);
  for (const mesh of host) {
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      const { x, y } = project(ox + p[i], oy + p[i + 1], oz + p[i + 2]);
      at.push({ s: (x - rect.c.x) * rect.u.x + (y - rect.c.y) * rect.u.y, t: (x - rect.c.x) * rect.n.x + (y - rect.c.y) * rect.n.y, h: oy + p[i + 1] });
    }
  }
  const half = rect.width / 2;
  const near = at.filter((v) => Math.abs(v.s) <= half + READ_BEYOND);
  if (near.length === 0) return rect;
  const t0 = Math.min(...near.map((v) => v.t)), t1 = Math.max(...near.map((v) => v.t));
  // The door must stand in the wall, else this is not the wall it is cut in: the wall's band holds the door's middle line, its frame
  // standing proud of either face by any amount (a casing or a wrap-around frame does, by 55 to 85 mm in the models measured for #831),
  // or, for a door thinner than 2 x PROUD, the band reaches within PROUD of both its faces.
  // `standsProud`: a mesh-only window's box may reach out past a wall face by any amount (window-in-wall.ts), so it need only overlap the wall.
  const outside = standsProud
    ? t0 > rect.depth / 2 || t1 < -rect.depth / 2
    : t0 > Math.max(EPS, -rect.depth / 2 + PROUD) || t1 < Math.min(-EPS, rect.depth / 2 - PROUD);
  if (outside || t1 - t0 > MAX_THICKNESS) return rect;
  // The wall has vertices inside the door's width only where the void's jambs are: each jamb is the place most of them share on its side,
  // within the frame's lining of its end.
  const inside = near.filter((v) => Math.abs(v.s) < half - EPS && v.t >= t0 - EPS && v.t <= t1 + EPS);
  const reach = Math.max(half / 2, half - MAX_LINING);
  const left = jambOf(inside.filter((v) => v.s < -reach), plane.position), right = jambOf(inside.filter((v) => v.s > reach), plane.position);
  // A window's own width is the measure (its box is the opening; the wall's vertices inside it are not jambs).
  const [s0, s1] = !standsProud && left !== null && right !== null ? [left, right] : [-half, half];
  const ds = (s0 + s1) / 2, dt = (t0 + t1) / 2;
  return { ...rect, c: { x: rect.c.x + rect.u.x * ds + rect.n.x * dt, y: rect.c.y + rect.u.y * ds + rect.n.y * dt }, width: s1 - s0, depth: t1 - t0 };
}

/** A wall as a plan at one height sees it: its meshes, the axis its footprint runs along and the footprint's extent along and across it. */
interface WallBand { meshes: MeshData[]; a: { x: number; y: number }; s0: number; s1: number; t0: number; t1: number }

/** The walls of `byId` the plan `plane` cuts, each with its footprint's axis (the principal axis of its vertices) and extent. */
function wallBands(byId: ReadonlyMap<number, MeshData[]>, plane: SectionPlaneConfig): WallBand[] {
  const project = drawingProjector(plane);
  const out: WallBand[] = [];
  for (const meshes of byId.values()) {
    const pts: { x: number; y: number }[] = [];
    let h0 = Infinity, h1 = -Infinity;
    for (const mesh of meshes) {
      const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
      const p = mesh.positions;
      for (let i = 0; i + 2 < p.length; i += 3) {
        pts.push(project(ox + p[i], oy + p[i + 1], oz + p[i + 2]));
        h0 = Math.min(h0, oy + p[i + 1]); h1 = Math.max(h1, oy + p[i + 1]);
      }
    }
    // Only a wall the cut passes through shows jambs on this plan: not a lintel piece over a door, nor a wall of another storey.
    if (pts.length < 3 || plane.position < h0 || plane.position > h1) continue;
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let xx = 0, xy = 0, yy = 0;
    for (const p of pts) { xx += (p.x - mx) ** 2; xy += (p.x - mx) * (p.y - my); yy += (p.y - my) ** 2; }
    const angle = Math.atan2(2 * xy, xx - yy) / 2;
    const a = { x: Math.cos(angle), y: Math.sin(angle) };
    const band: WallBand = { meshes, a, s0: Infinity, s1: -Infinity, t0: Infinity, t1: -Infinity };
    for (const p of pts) {
      const s = p.x * a.x + p.y * a.y, t = p.y * a.x - p.x * a.y;
      band.s0 = Math.min(band.s0, s); band.s1 = Math.max(band.s1, s); band.t0 = Math.min(band.t0, t); band.t1 = Math.max(band.t1, t);
    }
    out.push(band);
  }
  return out;
}

/** How far a wall's axis may turn from a door's width and still be the wall the door stands in: 5°. */
const PARALLEL = Math.cos((5 * Math.PI) / 180);

/**
 * The walls a door read as `rect` stands in when the model names none (no IfcRelFillsElement to an opening that voids a wall: walls
 * drawn with a gap, or split at the door, in some exports): each wall cut by the plan whose band holds the door's middle line and whose
 * footprint reaches the door's width. A wall longer than twice its thickness must also run along the door's width; a shorter piece (a
 * 0.1 m stub at a jamb) has no direction to read, so its footprint is taken in the door's own frame. Two pieces of a wall split at the
 * door are both taken, so the fit reads a jamb on each.
 *
 * A thin piece that closes a wall's end at the jamb runs across the wall, not along the door: in a large Dutch housing model each such
 * jamb is an IfcWall 0.1 m long (the wall's thickness) and 20 to 30 mm wide, so it is longer than twice its thickness and runs the wrong
 * way, and the door was drawn on its frame, 25 mm wider than the gap. A wall that runs another way is still taken when its footprint lies
 * inside the band of the walls taken (along the door, or a stub): it is a piece of that wall, not a cross wall (which reaches out of it).
 */
function wallsAround(bands: readonly WallBand[], rect: OpeningRect): MeshData[] {
  const half = rect.width / 2 + CLUSTER;
  // The footprint's extent in the door's frame: along its width (s) and across it (t).
  const inDoorFrame = (w: WallBand) => {
    const corners = [[w.s0, w.t0], [w.s1, w.t0], [w.s1, w.t1], [w.s0, w.t1]].map(([s, t]) => {
      const x = w.a.x * s - w.a.y * t - rect.c.x, y = w.a.y * s + w.a.x * t - rect.c.y;
      return { s: x * rect.u.x + y * rect.u.y, t: x * rect.n.x + y * rect.n.y };
    });
    const ss = corners.map((p) => p.s), ts = corners.map((p) => p.t);
    return { s0: Math.min(...ss), s1: Math.max(...ss), t0: Math.min(...ts), t1: Math.max(...ts) };
  };
  const reaches = (f: { s0: number; s1: number }) => f.s0 <= half && f.s1 >= -half;
  const along: WallBand[] = [], across: WallBand[] = [], taken: WallBand[] = [];
  for (const w of bands) {
    if (w.t1 - w.t0 > MAX_THICKNESS) continue;
    if (w.s1 - w.s0 > 2 * (w.t1 - w.t0)) {
      if (Math.abs(w.a.x * rect.u.x + w.a.y * rect.u.y) < PARALLEL) { across.push(w); continue; }
      const s = rect.c.x * w.a.x + rect.c.y * w.a.y, t = rect.c.y * w.a.x - rect.c.x * w.a.y;
      if (t >= w.t0 - EPS && t <= w.t1 + EPS && w.s0 <= s + half && w.s1 >= s - half) along.push(w);
      continue;
    }
    const f = inDoorFrame(w);
    if (f.t0 <= EPS && f.t1 >= -EPS && reaches(f)) taken.push(w);
  }
  const held = [...along, ...taken].map(inDoorFrame);
  if (held.length > 0) {
    const t0 = Math.min(...held.map((f) => f.t0)), t1 = Math.max(...held.map((f) => f.t1));
    for (const w of across) {
      const f = inDoorFrame(w);
      if (f.t0 >= t0 - EPS && f.t1 <= t1 + EPS && reaches(f)) taken.push(w);
    }
  }
  const keep = new Set([...along, ...taken]);
  return bands.filter((w) => keep.has(w)).flatMap((w) => w.meshes);
}

/**
 * The meshes of the wall each door stands in, for `openingSymbols`: `hostOf` names the wall (`openingHostsOf`) and `all` is every mesh
 * of the model, the walls among them (a plan's symbols are made from the doors' and windows' meshes alone, which hold no wall). For a
 * door the model hosts in no wall, `read` (its footprint on the plan cut at `plane`) finds the walls it stands in (`wallsAround`).
 */
export function hostWallMeshes(all: readonly MeshData[], hostOf: (id: number) => number | undefined): (id: number, read?: OpeningRect, plane?: SectionPlaneConfig) => readonly MeshData[] {
  let byId: Map<number, MeshData[]> | undefined;
  const bands = new Map<SectionPlaneConfig, WallBand[]>();
  return (id, read, plane) => {
    if (!byId) {
      byId = new Map();
      for (const m of all) if (/^IFCWALL/i.test(m.ifcType ?? '') && (m.geometryClass ?? 0) !== 2) byId.set(m.expressId, [...(byId.get(m.expressId) ?? []), m]);
    }
    const host = hostOf(id);
    if (host !== undefined) return byId.get(host) ?? [];
    if (!read || !plane) return [];
    let cut = bands.get(plane);
    if (!cut) bands.set(plane, (cut = wallBands(byId, plane)));
    return wallsAround(cut, read);
  };
}
