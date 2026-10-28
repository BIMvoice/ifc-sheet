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
import { doorSwingFlips, type DoorOperation } from '@bimvoice/ifcsheet';
import { typedPlanSymbol } from '@/joinery/plan-placement';
import { worldToDrawing } from './frame';
import type { DraftShape, Pt } from './types';

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
  const h = hull(points);
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

/**
 * A door as a plan draws it: each leaf open at 90° as a thin rectangle (its
 * thickness, drawn heavy) and its swing arc from the leaf's tip back to the
 * closed position (thin). By default hinged on the −u jamb and swinging to
 * the +n side; `flips` bit 1 hinges it on the other jamb, bit 2 swings it to
 * the other side. Two leaves, one per jamb, when `leafCount` says so, else when wider than `DOUBLE_LEAF_WIDTH`.
 */
export function doorSymbol(r: OpeningRect, flips = 0, leafCount?: 1 | 2): { thin: DraftShape[]; heavy: DraftShape[] } {
  const sh = flips & 1 ? 1 : -1;
  const sn = flips & 2 ? -1 : 1;
  const t = Math.min(0.05, Math.max(0.02, r.depth * 0.4));
  const leaves = (leafCount ?? (r.width > DOUBLE_LEAF_WIDTH ? 2 : 1)) === 2 ? [sh, -sh] : [sh];
  const w = r.width / leaves.length;
  const thin: DraftShape[] = [], heavy: DraftShape[] = [];
  for (const side of leaves) {
    const hinge = at(r, side * r.width / 2, sn * r.depth / 2);
    const leaf = { x: r.n.x * sn, y: r.n.y * sn };
    const jamb = { x: -r.u.x * side, y: -r.u.y * side };
    const tip = { x: hinge.x + leaf.x * w, y: hinge.y + leaf.y * w };
    heavy.push({ type: 'polyline', closed: true, pts: [hinge, tip, { x: tip.x + jamb.x * t, y: tip.y + jamb.y * t }, { x: hinge.x + jamb.x * t, y: hinge.y + jamb.y * t }] });
    const a = Math.atan2(jamb.y, jamb.x);
    const b = Math.atan2(leaf.y, leaf.x);
    // The quarter turn between the closed and the open leaf, counter-clockwise.
    const ccw = jamb.x * leaf.y - jamb.y * leaf.x > 0;
    thin.push({ type: 'arc', c: hinge, r: w, start: ccw ? a : b, end: ccw ? b : a });
  }
  return { thin, heavy };
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
  const joinery = meshes.filter((mesh) => KIND[(mesh.ifcType ?? '').toUpperCase()] && (mesh.geometryClass ?? 0) !== 2);
  // First each element's height range, over all its meshes: only the elements the cut passes through are
  // projected, not every door and window of every storey (#154).
  const range = new Map<number, { minY: number; maxY: number }>();
  for (const mesh of joinery) {
    const oy = mesh.origin?.[1] ?? 0;
    const r = range.get(mesh.expressId) ?? { minY: Infinity, maxY: -Infinity };
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      const y = oy + p[i + 1];
      r.minY = Math.min(r.minY, y);
      r.maxY = Math.max(r.maxY, y);
    }
    range.set(mesh.expressId, r);
  }
  const byId = new Map<number, { kind: 'door' | 'window'; pts: Pt[]; world: number[]; l2w?: number[] }>();
  for (const mesh of joinery) {
    const r = range.get(mesh.expressId)!;
    if (cut < r.minY || cut > r.maxY) continue;
    // World = the mesh's local-frame origin + its positions.
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const entry = byId.get(mesh.expressId) ?? { kind: KIND[(mesh.ifcType ?? '').toUpperCase()], pts: [], world: [] };
    entry.l2w ??= mesh.localToWorld;
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      const y = oy + p[i + 1];
      entry.pts.push(worldToDrawing(plane, { x: ox + p[i], y, z: oz + p[i + 2] }));
      entry.world.push(ox + p[i], y, oz + p[i + 2]);
    }
    byId.set(mesh.expressId, entry);
  }
  const out: OpeningSymbol[] = [];
  for (const [id, entry] of byId) {
    const configured = entry.l2w ? typedOf(id) : null;
    const typed = configured && entry.l2w ? typedPlanSymbol(configured.spec, entry.world, entry.l2w, plane, configured.flips, configured.source !== 'model') : null;
    if (typed) {
      out.push({ id, kind: entry.kind, shapes: typed.thin, heavy: typed.heavy, dashed: typed.dashed });
      continue;
    }
    const rect = minAreaRect(entry.pts);
    if (!rect) continue;
    if (entry.kind === 'door') {
      const stated = operationOf(id);
      const own = stated && entry.l2w ? statedFlips(stated, entry.l2w, plane, rect) : null;
      // The manual flips toggle the stated hand, as they toggle the default one.
      const door = doorSymbol(rect, (own ?? 0) ^ flipsOf(id), own === null ? undefined : stated?.leaves);
      out.push({ id, kind: 'door', shapes: door.thin, heavy: door.heavy });
    } else out.push({ id, kind: 'window', shapes: windowSymbol(rect) });
  }
  return out;
}
