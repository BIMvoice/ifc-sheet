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

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { PartKind, PlanPart } from './types';

const KIND: [RegExp, PartKind][] = [[/^IFC(WALL|CURTAINWALL)/i, 'wall'], [/^IFCDOOR/i, 'door'], [/^IFCWINDOW/i, 'window']];

export function kindOfClass(ifcType: string): PartKind | null {
  return KIND.find(([re]) => re.test(ifcType))?.[1] ?? null;
}

/** The walls, doors and windows the plan cuts, ordered by element id so the same drawing gives the same parts. */
export function planParts(drawing: Pick<Drawing2D, 'cutPolygons'> | null | undefined): PlanPart[] {
  const byId = new Map<number, PlanPart>();
  for (const p of drawing?.cutPolygons ?? []) {
    const kind = kindOfClass(p.ifcType);
    if (!kind || p.polygon.outer.length < 3) continue;
    const part = byId.get(p.entityId) ?? { id: p.entityId, kind, rings: [] };
    part.rings.push(p.polygon.outer.map((q) => ({ x: q.x, y: q.y })));
    byId.set(p.entityId, part);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
