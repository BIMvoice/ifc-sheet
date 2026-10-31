/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The parts DIMALL reads off a plan's generated drawing: the cut outlines of
 * walls, doors and windows, one entry per model element. This is the source of
 * every point DIMALL measures to, and its limit: only what the plan's cut
 * plane passes through is there (a window above the cut height, or a wall
 * lower than it, is not).
 */

import { getProjectionAxes, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { Pt } from '@/drafting/types';
import type { PartKind, PlanPart } from './types';

// A type (IfcWallType, IfcDoorStyle) is a template at the model's origin, not an element of the building.
const KIND: [RegExp, PartKind][] = [[/^IFC(WALL|CURTAINWALL)(?!TYPE)/i, 'wall'], [/^IFCDOOR(?!TYPE|STYLE)/i, 'door'], [/^IFCWINDOW(?!TYPE|STYLE)/i, 'window']];

export function kindOfClass(ifcType: string): PartKind | null {
  return KIND.find(([re]) => re.test(ifcType))?.[1] ?? null;
}

/** What the drawing's plane sees of a mesh: every vertex, projected as the cut outlines are. */
function bodyOf(mesh: MeshData, axis: 'x' | 'y' | 'z', flipped: boolean): Pt[] {
  const { u, v } = getProjectionAxes(axis);
  const [iu, iv] = [{ x: 0, y: 1, z: 2 }[u], { x: 0, y: 1, z: 2 }[v]];
  const out: Pt[] = [];
  for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
    const pu = mesh.positions[i + iu] + (mesh.origin?.[iu] ?? 0);
    out.push({ x: flipped ? -pu : pu, y: mesh.positions[i + iv] + (mesh.origin?.[iv] ?? 0) });
  }
  return out;
}

/** The walls, doors and windows the plan cuts, ordered by element id so the same drawing gives the same parts; a door or window carries its whole body when `meshes` are given. */
export function planParts(drawing: Pick<Drawing2D, 'cutPolygons' | 'config'> | null | undefined, meshes: readonly MeshData[] = []): PlanPart[] {
  const byId = new Map<number, PlanPart>();
  for (const p of drawing?.cutPolygons ?? []) {
    const kind = kindOfClass(p.ifcType);
    if (!kind || p.polygon.outer.length < 3) continue;
    const part = byId.get(p.entityId) ?? { id: p.entityId, kind, rings: [] };
    part.rings.push(p.polygon.outer.map((q) => ({ x: q.x, y: q.y })));
    byId.set(p.entityId, part);
  }
  const plane = drawing?.config?.plane;
  if (plane) {
    for (const mesh of meshes) {
      const part = byId.get(mesh.expressId);
      if (!part || part.kind === 'wall' || (mesh.geometryClass ?? 0) === 2) continue;
      (part.body ??= []).push(...bodyOf(mesh, plane.axis, plane.flipped));
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
