/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Plan symbols for doors and windows, as a floor plan shows them: a door
 * as its leaf drawn open at 90° with the swing arc, a window as its frame
 * with the glazing line. A plan cut through a door otherwise shows only
 * the gap in the wall (and whatever slice of the leaf the cut catches).
 *
 * Read from the geometry, so it works for any model, authored or loaded:
 * each door / window mesh the plan's cut passes through is projected onto
 * the drawing, and the minimum-area rectangle around that footprint gives
 * the opening — its long side the width, its short side the wall depth.
 * The swing side is not in the mesh: it comes from the door's stated operation
 * (`IfcDoor.OperationType`, else its type's: `door-operation.ts`) read against its
 * placement, and defaults to one side consistently (the drawing's +x / +y
 * normal) when the model states none; the per-door flips toggle from there.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { JoinerySpec } from '@ifc-lite/create';
import { doorSwingFlips, type DoorOperation } from './door-operation.js';
import { typedPlanSymbol } from './joinery-plan-placement.js';
import { worldToDrawing } from './drawing-frame.js';
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

const at = (r: OpeningRect, su: number, sn: number): Pt => ({
  x: r.c.x + r.u.x * su + r.n.x * sn,
  y: r.c.y + r.u.y * su + r.n.y * sn,
});

/** Above this width a door read from its mesh is drawn as a pair of leaves. */
export const DOUBLE_LEAF_WIDTH = 1.4;

/** The quarter turn from the closed leaf (along `jamb`) to the open one (along `leaf`), counter-clockwise, as an arc about `hinge`. */
function swingArc(hinge: Pt, jamb: Pt, leaf: Pt, w: number): DraftShape {
  const a = Math.atan2(jamb.y, jamb.x);
  const b = Math.atan2(leaf.y, leaf.x);
  const ccw = jamb.x * leaf.y - jamb.y * leaf.x > 0;
  return { type: 'arc', c: hinge, r: w, start: ccw ? a : b, end: ccw ? b : a };
}

/** A line with an open arrowhead at `b`. */
function arrowShapes(a: Pt, b: Pt): DraftShape[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const head = Math.min(0.08, len / 3);
  return [
    { type: 'line', a, b },
    { type: 'polyline', closed: false, pts: [{ x: b.x - ux * head - uy * head / 2, y: b.y - uy * head + ux * head / 2 }, b, { x: b.x - ux * head + uy * head / 2, y: b.y - uy * head - ux * head / 2 }] },
  ];
}

/**
 * A door as a plan draws it. By default each leaf open at 90° as a thin rectangle (its thickness, drawn heavy) and its swing arc from
 * the leaf's tip back to the closed position (thin), hinged on the −u jamb and swinging to the +n side; `flips` bit 1 hinges it on the
 * other jamb, bit 2 swings it to the other side. Two leaves, one per jamb, when `op.leaves` says so, else when wider than `DOUBLE_LEAF_WIDTH`.
 * `op`, the operation the model states (IFC4.3 IfcDoorTypeOperationEnum, `door-operation.ts`), changes what a leaf draws:
 * - SINGLE_SWING_* / DOUBLE_DOOR_SINGLE_SWING: the above;
 * - DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_* (`op.oppositeLeaf`): the leaf on the jamb `flips` bit 1 names swings to the leaf side, the other to
 *   the opposite side;
 * - DOUBLE_SWING_* / DOUBLE_DOOR_DOUBLE_SWING (double-acting): the same, and the swing to the other side as a dashed arc about the same hinge;
 * - SLIDING_TO_* / DOUBLE_DOOR_SLIDING: each leaf a heavy bar along the wall face, with an arrow along the wall towards the jamb it slides to;
 * - FOLDING_TO_* / DOUBLE_DOOR_FOLDING: each leaf two halves folded in a zig-zag from the jamb it stacks on;
 * - REVOLVING: a thin circle with a heavy cross, the leaves, about the middle of the opening;
 * - LIFTING_* / ROLLINGUP (overhead): each leaf a heavy bar along the wall face and the panel's retracted position as a dashed line along the
 *   middle of the opening, with no swing arc (a lifting or rolling panel swings nowhere).
 */
export function doorSymbol(r: OpeningRect, flips = 0, op?: DoorOperation): { thin: DraftShape[]; heavy: DraftShape[]; dashed: DraftShape[] } {
  const sh = flips & 1 ? 1 : -1;
  const sn = flips & 2 ? -1 : 1;
  const t = Math.min(0.05, Math.max(0.02, r.depth * 0.4));
  const thin: DraftShape[] = [], heavy: DraftShape[] = [], dashed: DraftShape[] = [];
  if (op?.motion === 'revolving') {
    const R = r.width / 2;
    thin.push({ type: 'circle', c: r.c, r: R });
    for (const d of [r.u, r.n]) heavy.push({ type: 'line', a: { x: r.c.x - d.x * R, y: r.c.y - d.y * R }, b: { x: r.c.x + d.x * R, y: r.c.y + d.y * R } });
    return { thin, heavy, dashed };
  }
  if (op?.motion === 'overhead') {
    // On the leaf side's wall face, as a sliding leaf is: `flips` bit 2 moves it to the other face.
    const face = sn * r.depth / 2, outer = face + sn * t;
    const parts = op.leaves === 2 ? [[-r.width / 2, 0], [0, r.width / 2]] : [[-r.width / 2, r.width / 2]];
    for (const [from, to] of parts) heavy.push({ type: 'polyline', closed: true, pts: [at(r, from, face), at(r, to, face), at(r, to, outer), at(r, from, outer)] });
    dashed.push({ type: 'line', a: at(r, -r.width / 2, 0), b: at(r, r.width / 2, 0) });
    return { thin, heavy, dashed };
  }
  const leaves = (op ? op.leaves : r.width > DOUBLE_LEAF_WIDTH ? 2 : 1) === 2 ? [sh, -sh] : [sh];
  const w = r.width / leaves.length;
  for (const [i, side] of leaves.entries()) {
    // The side this leaf swings or lies to: the second leaf of a pair that swings opposite ways goes to the other side.
    const ln = op?.oppositeLeaf && i === 1 ? -sn : sn;
    if (op?.motion === 'sliding') {
      // The leaf along the wall face on the leaf side, spanning the width it covers, and the way it slides: towards its jamb.
      const from = side * (r.width / 2 - w), to = side * r.width / 2;
      const face = ln * r.depth / 2, outer = face + ln * t;
      heavy.push({ type: 'polyline', closed: true, pts: [at(r, from, face), at(r, to, face), at(r, to, outer), at(r, from, outer)] });
      const mid = (from + to) / 2, lane = outer + ln * 0.08;
      thin.push(...arrowShapes(at(r, mid - side * w / 4, lane), at(r, mid + side * w / 4, lane)));
      continue;
    }
    if (op?.motion === 'folding') {
      // Two halves from the jamb, folded out to the leaf side at 60° and back to the wall line: the zig-zag of a folded leaf.
      const half = w / 2;
      const foot = at(r, side * r.width / 2, ln * r.depth / 2);
      const inward = { x: -r.u.x * side, y: -r.u.y * side };
      const out = { x: r.n.x * ln, y: r.n.y * ln };
      const fold = { x: foot.x + inward.x * half * Math.cos(Math.PI / 3) + out.x * half * Math.sin(Math.PI / 3), y: foot.y + inward.y * half * Math.cos(Math.PI / 3) + out.y * half * Math.sin(Math.PI / 3) };
      const end = { x: foot.x + inward.x * half * 2 * Math.cos(Math.PI / 3), y: foot.y + inward.y * half * 2 * Math.cos(Math.PI / 3) };
      heavy.push({ type: 'polyline', closed: false, pts: [foot, fold, end] });
      continue;
    }
    const hinge = at(r, side * r.width / 2, ln * r.depth / 2);
    const leaf = { x: r.n.x * ln, y: r.n.y * ln };
    const jamb = { x: -r.u.x * side, y: -r.u.y * side };
    const tip = { x: hinge.x + leaf.x * w, y: hinge.y + leaf.y * w };
    heavy.push({ type: 'polyline', closed: true, pts: [hinge, tip, { x: tip.x + jamb.x * t, y: tip.y + jamb.y * t }, { x: hinge.x + jamb.x * t, y: hinge.y + jamb.y * t }] });
    thin.push(swingArc(hinge, jamb, leaf, w));
    if (op?.doubleActing) {
      // Swings to the other side too: the same hinge on the other wall face, the other quarter turn, dashed.
      const back = { x: -leaf.x, y: -leaf.y };
      dashed.push(swingArc(at(r, side * r.width / 2, -ln * r.depth / 2), jamb, back, w));
    }
  }
  return { thin, heavy, dashed };
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
  for (const mesh of meshes) {
    const [ox, , oz] = mesh.origin ?? [0, 0, 0];
    const p = mesh.positions;
    // `worldToDrawing` for a plan: x (negated when flipped) and z.
    for (let i = 0; i + 2 < p.length; i += 3) {
      const x = ox + p[i];
      xy[k++] = plane.flipped ? -x : x;
      xy[k++] = oz + p[i + 2];
    }
  }
  return rectOfHull(hull(hullCandidates(xy, n)));
}

/**
 * The door and window symbols of a plan cut at `plane` (a horizontal plane,
 * world units): every door / window whose meshes the cut height passes
 * through. Meshes of one element are taken together.
 */
export function openingSymbols(
  meshes: readonly MeshData[], plane: SectionPlaneConfig, flipsOf: (id: number) => number = () => 0,
  typedOf: (id: number) => { spec: JoinerySpec; flips: number; source?: string } | null = () => null,
  operationOf: (id: number) => DoorOperation | null = () => null,
): OpeningSymbol[] {
  if (plane.axis !== 'y' || plane.customPlane) return [];
  const cut = plane.position;
  const byId = new Map<number, { kind: 'door' | 'window'; meshes: readonly MeshData[]; l2w?: number[] }>();
  // Only the elements the cut passes through are projected, not every door and window of every storey (#154).
  for (const el of joineryElements(meshes)) {
    if (cut < el.minY || cut > el.maxY) continue;
    let l2w: number[] | undefined;
    for (const mesh of el.meshes) l2w ??= mesh.localToWorld;
    byId.set(el.id, { kind: el.kind, meshes: el.meshes, l2w });
  }
  const out: OpeningSymbol[] = [];
  for (const [id, entry] of byId) {
    const configured = entry.l2w ? typedOf(id) : null;
    const typed = configured && entry.l2w ? typedPlanSymbol(configured.spec, worldPoints(entry.meshes), entry.l2w, plane, configured.flips, configured.source !== 'model') : null;
    if (typed) {
      out.push({ id, kind: entry.kind, shapes: typed.thin, heavy: typed.heavy, dashed: typed.dashed });
      continue;
    }
    const rect = footprintRect(entry.meshes, plane);
    if (!rect) continue;
    if (entry.kind === 'door') {
      const stated = operationOf(id);
      const own = stated && entry.l2w ? statedFlips(stated, entry.l2w, plane, rect) : null;
      // The manual flips toggle the stated hand, as they toggle the default one.
      // A placement whose X does not run along the opening leaves the hand unknown, but a sliding, folding or revolving door is still not a swinging one.
      const door = doorSymbol(rect, (own ?? 0) ^ flipsOf(id), stated && (own !== null || stated.motion !== 'swing') ? stated : undefined);
      out.push({ id, kind: 'door', shapes: door.thin, heavy: door.heavy, dashed: door.dashed });
    } else out.push({ id, kind: 'window', shapes: windowSymbol(rect) });
  }
  return out;
}
