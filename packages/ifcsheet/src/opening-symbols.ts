/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Plan symbols for doors and windows, as a floor plan shows them: a door as its leaf drawn open at 90° with the swing arc, a window as
 * its frame with the glazing line. A plan cut through a door otherwise shows only the gap in the wall (and whatever slice of the leaf the cut catches).
 *
 * Read from the geometry, so it works for any model, authored or loaded: each door / window mesh the plan's cut passes through is projected
 * onto the drawing, and the minimum-area rectangle around that footprint gives the opening — its long side the width, its short side the wall depth.
 * The swing side is not in the mesh: it comes from the door's stated operation (`IfcDoor.OperationType`, else its type's: `door-operation.ts`)
 * read against its placement, and defaults to one side consistently (the drawing's +x / +y normal) when the model states none; the per-door
 * flips toggle from there.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { JoinerySpec } from '@ifc-lite/create';
import { doorSwingFlips, UNSTATED_DOOR_OPERATION, type DoorOperation } from './door-operation.js';
import { at, doorSymbol } from './door-symbol.js';
import { typedPlanSymbol } from './joinery-plan-placement.js';
import { drawingProjector, worldToDrawing } from './drawing-frame.js';
import { fitToHostWall } from './opening-in-wall.js';
import { doorPieces, type DoorStated } from './door-pieces.js';
import { fitWindowToHostWall } from './window-in-wall.js';
import type { DraftShape, Pt } from './draft-types.js';

export interface OpeningRect {
  c: Pt;
  /** Unit vector along the width. */
  u: Pt;
  /** Unit normal (across the wall). */
  n: Pt;
  width: number;
  depth: number;
}

export { DOUBLE_LEAF_WIDTH, doorSymbol } from './door-symbol.js';

const crossO = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (pts.length < 3) return pts;
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && crossO(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** The minimum-area rectangle around `points` (rotating the hull's edges), or null when degenerate. */
export function minAreaRect(points: Pt[]): OpeningRect | null {
  return rectOfHull(hull(points));
}

/**
 * The points of `xy` (x0, y0, x1, y1, ...) that can be corners of their convex hull: every point but those inside the octagon of the
 * extreme points (least and greatest x, y, x + y and x - y) by more than a rounding margin. A point that deep inside lies inside the
 * hull, so `hull` drops it anyway and returns the same corners without it; a door's mesh has about a thousand vertices and most of
 * them are inside its footprint (#154).
 */
export function hullCandidates(xy: Float64Array, n: number): Pt[] {
  const all = (): Pt[] => {
    const out: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = { x: xy[2 * i], y: xy[2 * i + 1] };
    return out;
  };
  if (n < 9) return all();
  // Extreme points, in the order they lie around the hull (counter-clockwise from the bottom): the least y, the greatest x - y, x,
  // x + y, y, y - x, and the least x and x + y. `best` holds the greatest of each score (y negated for the least, and so on).
  const ext = [0, 0, 0, 0, 0, 0, 0, 0];
  const best = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity];
  let big = 0;
  for (let i = 0; i < n; i++) {
    const x = xy[2 * i], y = xy[2 * i + 1];
    big = Math.max(big, Math.abs(x), Math.abs(y));
    if (-y > best[0]) { best[0] = -y; ext[0] = i; }
    if (x - y > best[1]) { best[1] = x - y; ext[1] = i; }
    if (x > best[2]) { best[2] = x; ext[2] = i; }
    if (x + y > best[3]) { best[3] = x + y; ext[3] = i; }
    if (y > best[4]) { best[4] = y; ext[4] = i; }
    if (y - x > best[5]) { best[5] = y - x; ext[5] = i; }
    if (-x > best[6]) { best[6] = -x; ext[6] = i; }
    if (-x - y > best[7]) { best[7] = -x - y; ext[7] = i; }
  }
  const ox: number[] = [], oy: number[] = [];
  for (const i of ext) {
    const x = xy[2 * i], y = xy[2 * i + 1];
    if (ox.length && ox[ox.length - 1] === x && oy[oy.length - 1] === y) continue;
    ox.push(x); oy.push(y);
  }
  while (ox.length > 1 && ox[0] === ox[ox.length - 1] && oy[0] === oy[oy.length - 1]) { ox.pop(); oy.pop(); }
  // Points all on one line or at one point leave an octagon with no inside (each edge has its reverse), so every point is kept.
  const m = ox.length;
  // How far inside an edge a point must be to be dropped, scaled to the coordinates so rounding cannot decide it.
  const size = Math.max(best[2] + best[6], best[4] + best[0]);
  const margin = 1e-9 * (size + big);
  const ex: number[] = [], ey: number[] = [], el: number[] = [];
  for (let k = 0; k < m; k++) {
    const dx = ox[(k + 1) % m] - ox[k], dy = oy[(k + 1) % m] - oy[k];
    ex.push(dx); ey.push(dy); el.push(margin * Math.hypot(dx, dy));
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = xy[2 * i], y = xy[2 * i + 1];
    let inside = true;
    for (let k = 0; k < m && inside; k++) inside = ex[k] * (y - oy[k]) - ey[k] * (x - ox[k]) > el[k];
    if (!inside) out.push({ x, y });
  }
  return out;
}

/** The minimum-area rectangle around a convex hull (`hull`'s), or null when degenerate. */
function rectOfHull(h: Pt[]): OpeningRect | null {
  if (h.length < 3) return null;
  let best: { area: number; rect: OpeningRect } | null = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = { x: -u.y, y: u.x };
    let minU = Infinity, maxU = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const p of h) {
      const pu = p.x * u.x + p.y * u.y, pn = p.x * n.x + p.y * n.y;
      minU = Math.min(minU, pu); maxU = Math.max(maxU, pu);
      minN = Math.min(minN, pn); maxN = Math.max(maxN, pn);
    }
    const area = (maxU - minU) * (maxN - minN);
    if (best && area >= best.area) continue;
    const cu = (minU + maxU) / 2, cn = (minN + maxN) / 2;
    const c = { x: u.x * cu + n.x * cn, y: u.y * cu + n.y * cn };
    // Width along the longer side.
    const along = maxU - minU >= maxN - minN;
    best = {
      area,
      rect: along
        ? { c, u, n, width: maxU - minU, depth: maxN - minN }
        : { c, u: n, n: { x: -n.y, y: n.x }, width: maxN - minN, depth: maxU - minU },
    };
  }
  if (!best || best.rect.width < 1e-6) return null;
  // One consistent orientation: u toward +x (or +y), n its left normal.
  const r = best.rect;
  if (r.u.x < -1e-9 || (Math.abs(r.u.x) <= 1e-9 && r.u.y < 0)) {
    r.u = { x: -r.u.x, y: -r.u.y };
  }
  r.n = { x: -r.u.y, y: r.u.x };
  return r;
}

/** A window: its frame across the wall and the glazing as a double line along the middle. */
export function windowSymbol(r: OpeningRect): DraftShape[] {
  const w = r.width / 2, d = r.depth / 2, g = Math.min(0.012, d / 3);
  return [
    { type: 'polyline', pts: [at(r, -w, -d), at(r, w, -d), at(r, w, d), at(r, -w, d)], closed: true },
    { type: 'line', a: at(r, -w, -g), b: at(r, w, -g) },
    { type: 'line', a: at(r, -w, g), b: at(r, w, g) },
  ];
}

export interface OpeningSymbol {
  /** The element's mesh id (the renderer's global id). */
  id: number;
  kind: 'door' | 'window';
  /** Thin lines (all of a symbol read from the mesh). */
  shapes: DraftShape[];
  /** A configured type's cut parts (frame, sashes), drawn heavy. */
  heavy?: DraftShape[];
  dashed?: DraftShape[];
}

/** Every shape of a symbol, whatever its weight. */
export const symbolShapes = (s: OpeningSymbol): DraftShape[] => [...s.shapes, ...(s.heavy ?? []), ...(s.dashed ?? [])];

/** The flips that draw `op` as the model states it, from the placement `l2w` (row-major, renderer frame: IFC local X is column 0, local Y minus column 2); null when its axes do not run along the opening. */
function statedFlips(op: DoorOperation, l2w: readonly number[], plane: SectionPlaneConfig, rect: OpeningRect): number | null {
  const dir = (x: number, y: number, z: number): Pt => {
    const a = worldToDrawing(plane, { x: 0, y: 0, z: 0 }), b = worldToDrawing(plane, { x, y, z });
    return { x: b.x - a.x, y: b.y - a.y };
  };
  return doorSwingFlips(op, dir(l2w[0], l2w[4], l2w[8]), dir(-l2w[2], -l2w[6], -l2w[10]), rect.u, rect.n);
}

const KIND: Record<string, 'door' | 'window'> = { IFCDOOR: 'door', IFCDOORSTANDARDCASE: 'door', IFCWINDOW: 'window', IFCWINDOWSTANDARDCASE: 'window' };

interface JoineryElement { id: number; kind: 'door' | 'window'; meshes: MeshData[]; minY: number; maxY: number }

/** Each mesh list's doors and windows, by element, with the height range of all its meshes: read once per model, not once per plan (#154). */
const joineryByMeshes = new WeakMap<readonly MeshData[], { length: number; elements: JoineryElement[] }>();

function joineryElements(meshes: readonly MeshData[]): JoineryElement[] {
  const held = joineryByMeshes.get(meshes);
  if (held && held.length === meshes.length) return held.elements;
  const byId = new Map<number, JoineryElement>();
  for (const mesh of meshes) {
    const kind = KIND[(mesh.ifcType ?? '').toUpperCase()];
    if (!kind || (mesh.geometryClass ?? 0) === 2) continue;
    const oy = mesh.origin?.[1] ?? 0;
    let el = byId.get(mesh.expressId);
    if (!el) byId.set(mesh.expressId, el = { id: mesh.expressId, kind, meshes: [], minY: Infinity, maxY: -Infinity });
    el.meshes.push(mesh);
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      const y = oy + p[i + 1];
      el.minY = Math.min(el.minY, y);
      el.maxY = Math.max(el.maxY, y);
    }
  }
  const elements = [...byId.values()];
  joineryByMeshes.set(meshes, { length: meshes.length, elements });
  return elements;
}

/** Every vertex of `meshes` in world coordinates (the mesh's local-frame origin + its positions), flat. */
function worldPoints(meshes: readonly MeshData[]): number[] {
  const world: number[] = [];
  for (const mesh of meshes) {
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) world.push(ox + p[i], oy + p[i + 1], oz + p[i + 2]);
  }
  return world;
}

/** The opening `meshes` cut by the plan `plane` (horizontal, not custom) make: the minimum-area rectangle round their footprint. */
function footprintRect(meshes: readonly MeshData[], plane: SectionPlaneConfig): OpeningRect | null {
  let n = 0;
  for (const mesh of meshes) n += Math.floor(mesh.positions.length / 3);
  const xy = new Float64Array(2 * n);
  let k = 0;
  const project = drawingProjector(plane);
  for (const mesh of meshes) {
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      const q = project(ox + p[i], oy + p[i + 1], oz + p[i + 2]);
      xy[k++] = q.x;
      xy[k++] = q.y;
    }
  }
  return rectOfHull(hull(hullCandidates(xy, n)));
}

/**
 * The door and window symbols of a plan cut at `plane` (a horizontal plane,
 * world units): every door / window whose meshes the cut height passes
 * through, or through the wall it is hosted in (`hostedInCutWall`). Meshes of one element are taken together. `hostWallOf` gives the meshes of the wall
 * a door stands in (for a door the model hosts in none, the walls its footprint `read` stands in): its symbol is fitted to that wall's thickness and opening (`opening-in-wall.ts`).
 * `hosted` says whether the model hosts a door (`openingHostsOf`): a door hosted in nothing that stands in a hosted door's gap is a piece of it, not drawn (`door-pieces.ts`); among doors hosted in nothing, `stated` (`doorStatedOf`) helps tell the door from its pieces (`door-loose-pieces.ts`).
 */
export function openingSymbols(
  meshes: readonly MeshData[], plane: SectionPlaneConfig, flipsOf: (id: number) => number = () => 0,
  typedOf: (id: number) => { spec: JoinerySpec; flips: number; source?: string } | null = () => null,
  operationOf: (id: number) => DoorOperation | null = () => null,
  hostedInCutWall: (id: number, cut: number) => boolean = () => false,
  hostWallOf: (id: number, read?: OpeningRect, plane?: SectionPlaneConfig) => readonly MeshData[] = () => [],
  hosted: (id: number) => boolean = () => true, stated: (id: number) => DoorStated = () => ({ statesSize: false }),
): OpeningSymbol[] {
  if (plane.axis !== 'y' || plane.customPlane) return [];
  const cut = plane.position;
  const byId = new Map<number, { kind: 'door' | 'window'; meshes: readonly MeshData[]; l2w?: number[]; height: number }>();
  // Only the elements the cut passes through are projected, not every door and window of every storey (#154).
  for (const el of joineryElements(meshes)) {
    // The cut passes through it, or through the wall it is hosted in (`opening-hosts.ts`, #586).
    if ((cut < el.minY || cut > el.maxY) && !hostedInCutWall(el.id, cut)) continue;
    let l2w: number[] | undefined;
    for (const mesh of el.meshes) l2w ??= mesh.localToWorld;
    byId.set(el.id, { kind: el.kind, meshes: el.meshes, l2w, height: el.maxY - el.minY });
  }
  const out: OpeningSymbol[] = [], reads = new Map<number, OpeningRect | null>();
  const readOf = (id: number): OpeningRect | null => { if (!reads.has(id)) reads.set(id, footprintRect(byId.get(id)!.meshes, plane)); return reads.get(id) ?? null; };
  const pieces = doorPieces([...byId].filter(([, e]) => e.kind === 'door').map(([id]) => id), readOf, hosted, (id) => byId.get(id)!.height, stated);
  for (const [id, entry] of [...byId].filter(([id]) => !pieces.has(id))) {
    const configured = entry.l2w ? typedOf(id) : null;
    const typed = configured && entry.l2w ? typedPlanSymbol(configured.spec, worldPoints(entry.meshes), entry.l2w, plane, configured.flips, configured.source !== 'model') : null;
    if (typed) {
      out.push({ id, kind: entry.kind, shapes: typed.thin, heavy: typed.heavy, dashed: typed.dashed });
      continue;
    }
    const read = readOf(id);
    if (!read) continue;
    // A door's or window's symbol stands in the wall's opening, not on its frame's footprint (`opening-in-wall.ts` #678, `window-in-wall.ts` #651).
    const hostMeshes = hostWallOf(id, entry.kind === 'door' ? read : undefined, plane);
    const rect = hostMeshes.length === 0 ? read : entry.kind === 'door' ? fitToHostWall(read, hostMeshes, plane) : fitWindowToHostWall(read, footprintRect(hostMeshes, plane), hostMeshes, plane);
    if (entry.kind === 'door') {
      const stated = operationOf(id);
      // A door that states no operation is read as Bonsai and IfcOpenShell make one (`UNSTATED_DOOR_OPERATION`), against its own placement, not the footprint's arbitrary axes (#679); the manual flips toggle that hand.
      const own = entry.l2w ? statedFlips(stated ?? UNSTATED_DOOR_OPERATION, entry.l2w, plane, rect) : null;
      // A placement whose X does not run along the opening leaves the hand unknown, but a sliding, folding or revolving door is still not a swinging one.
      const door = doorSymbol(rect, (own ?? 0) ^ flipsOf(id), stated && (own !== null || stated.motion !== 'swing') ? stated : undefined);
      out.push({ id, kind: 'door', shapes: door.thin, heavy: door.heavy, dashed: door.dashed });
    } else out.push({ id, kind: 'window', shapes: windowSymbol(rect) });
  }
  return out;
}
