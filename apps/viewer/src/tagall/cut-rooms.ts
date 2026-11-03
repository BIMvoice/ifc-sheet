/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rooms a section or an elevation cuts (#677), read as a plan's are: from the spaces' own geometry, not from the drawing
 * (the viewer hides IfcSpace by default, so its section drawing holds no space). Each space is cut by the view's plane and the
 * cut outline, in the view's drawing coordinates, is where its tag stands, as the footprint is on a plan. The same engine
 * code finds the outline (`footprintOf`, which cuts at a height: the space's vertices are laid out as (drawing x, depth from
 * the plane, drawing y), so the plane is height 0). The area is the space's floor area, since a section's outline is a slice:
 * the model's quantities when it states them (`modelArea`), else the footprint read here. An exterior elevation's plane cuts
 * no room and gets none; an interior elevation's plane stands inside its room and does.
 */

import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { Pt } from '@/drafting/types';
import { drawingToWorld, viewNormal, worldToDrawing, type Vec3 } from '@/drafting/frame';
import { ringBounds, type Rect } from '@/labels/label-geometry';
import { renderIdGlobalId } from '@/project/element-guid';
import { footprintOf, ringArea, roomFootprints, type RoomOfPlan, type SpaceMesh } from './footprint';

type CutDrawing = Pick<Drawing2D, 'cutPolygons' | 'lines'>;
type Mesh = SpaceMesh & { expressId: number; ifcType?: string; origin?: readonly number[] };
type Box = ReturnType<typeof ringBounds>;

const spaceMeshes = (meshes: readonly Mesh[]): Map<number, Mesh[]> => {
  const out = new Map<number, Mesh[]>();
  for (const m of meshes) if (m.ifcType === 'IfcSpace') out.set(m.expressId, [...(out.get(m.expressId) ?? []), m]);
  return out;
};

/** The floor area of the space made of `parts`, square metres: its footprint at mid-height. Undefined when the mesh gives none. */
export function spaceFloorArea(parts: readonly Mesh[]): number | undefined {
  let low = Infinity, high = -Infinity;
  for (const m of parts) {
    for (let i = 1; i < m.positions.length; i += 3) {
      const y = m.positions[i] + (m.origin?.[1] ?? 0);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  }
  if (!Number.isFinite(low)) return undefined;
  const ring = roomFootprints(parts, (low + high) / 2, low)[0]?.ring;
  return ring ? ringArea(ring) : undefined;
}

/** The outline in which `plane` cuts the space made of `parts`, in drawing coordinates; null when the plane does not go through it. */
function cutOutline(plane: SectionPlaneConfig, parts: readonly Mesh[]): Pt[] | null {
  const on = drawingToWorld(plane, { x: 0, y: 0 });
  const n = viewNormal(plane);
  const positions: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const base = positions.length / 3;
    for (let i = 0; i + 2 < m.positions.length; i += 3) {
      const w: Vec3 = { x: m.positions[i] + (m.origin?.[0] ?? 0), y: m.positions[i + 1] + (m.origin?.[1] ?? 0), z: m.positions[i + 2] + (m.origin?.[2] ?? 0) };
      const at = worldToDrawing(plane, w);
      positions.push(at.x, (w.x - on.x) * n.x + (w.y - on.y) * n.y + (w.z - on.z) * n.z, at.y);
    }
    for (let i = 0; i < m.indices.length; i++) indices.push(m.indices[i] + base);
  }
  const found = footprintOf({ positions, indices }, 0);
  return found?.at === 'cut' ? found.ring : null;
}

/** A line the drawing shows, as boxes along it (a long diagonal's own box would block half the room). */
function lineBoxes(a: Pt, b: Pt): Rect[] {
  const n = Math.min(200, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.15)));
  return Array.from({ length: n }, (_, i) => {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, q = { x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n };
    return { x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) };
  });
}

const near = (a: Box, b: Box): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/**
 * Each space the plane cuts, one per space, ordered by id, with the cut outlines of everything else near it that its tag
 * keeps clear of (the walls and slabs the drawing cuts; a space the drawing happens to show is not one).
 */
export function roomsOfCut(plane: SectionPlaneConfig | undefined, drawing: CutDrawing | null | undefined, meshes: readonly Mesh[]): RoomOfPlan[] {
  if (!plane) return [];
  const others = (drawing?.cutPolygons ?? []).filter((p) => p.ifcType !== 'IfcSpace' && p.polygon.outer.length >= 3).map((p) => ({ ring: p.polygon.outer, box: ringBounds(p.polygon.outer) }));
  const seen = (drawing?.lines ?? []).filter((l) => l.visibility !== 'hidden').map((l) => ({ a: l.line.start, b: l.line.end, box: { x0: Math.min(l.line.start.x, l.line.end.x), y0: Math.min(l.line.start.y, l.line.end.y), x1: Math.max(l.line.start.x, l.line.end.x), y1: Math.max(l.line.start.y, l.line.end.y) } }));
  return [...spaceMeshes(meshes)].sort((a, b) => a[0] - b[0]).flatMap(([renderId, parts]) => {
    const guid = renderIdGlobalId(renderId);
    const ring = guid ? cutOutline(plane, parts) : null;
    if (!guid || !ring) return [];
    const box = ringBounds(ring);
    return [{ renderId, ring, at: 'cut' as const, guid, floorArea: spaceFloorArea(parts) ?? null, keepClear: others.filter((o) => near(o.box, box)).map((o) => o.ring), preferClear: seen.filter((l) => near(l.box, box)).flatMap((l) => lineBoxes(l.a, l.b)) }];
  });
}
