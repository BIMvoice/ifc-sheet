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

/**
 * The meshes of the wall each door stands in, for `openingSymbols`: `hostOf` names the wall (`openingHostsOf`) and `all` is every mesh
 * of the model, the walls among them (a plan's symbols are made from the doors' and windows' meshes alone, which hold no wall).
 */
export function hostWallMeshes(all: readonly MeshData[], hostOf: (id: number) => number | undefined): (id: number) => readonly MeshData[] {
  let byId: Map<number, MeshData[]> | undefined;
  return (id) => {
    const host = hostOf(id);
    if (host === undefined) return [];
    if (!byId) {
      byId = new Map();
      for (const m of all) if (/^IFCWALL/i.test(m.ifcType ?? '') && (m.geometryClass ?? 0) !== 2) byId.set(m.expressId, [...(byId.get(m.expressId) ?? []), m]);
    }
    return byId.get(host) ?? [];
  };
}
