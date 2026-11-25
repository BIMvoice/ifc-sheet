/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One wall gap, one door symbol, when no door in the gap is hosted (`door-pieces.ts` handles a hosted door and its pieces). Some models
 * carry a door as several IfcDoors hosted in nothing: on schependomlaan's ground floor the lift door in the hall wall is nine of them, all
 * named `liftdeur`, of one IfcDoorStyle, none stating OverallWidth or OverallHeight and none a part of another (a 1.54 m door leaf set in
 * the shaft, four 0.5 m panels, two jamb posts, a 0.15 m profile and a head piece). A plan drew a swing for each of the eight it cuts.
 *
 * The doors hosted in nothing whose footprints touch form one group. The door of the group is read from what the model states, in this
 * order, and the rule that decided is named:
 * 1. `part`: the one the others are parts of (IfcRelAggregates or IfcRelNests);
 * 2. `size`: the only one stating OverallWidth or OverallHeight;
 * 3. `span`: only then the geometry, the one as tall as a person can pass through (`PASSABLE`) whose width covers the group along it
 *    (`SPANS`), the widest when more than one does.
 * The others are its pieces when they lie mostly within its width. The two leaves of a double door each cover half the group, so neither
 * is the door and both are drawn; a narrow door beside a wide one is not within the wide one's width.
 */

import type { OpeningRect } from './opening-symbols.js';

/** What the model states of a door that tells it from its pieces. */
export interface DoorStated {
  /** The element this door is a part of (IfcRelAggregates, IfcRelNests), when there is one. */
  partOf?: number;
  /** Whether it states OverallWidth or OverallHeight. */
  statesSize: boolean;
}

export type DoorRule = 'part' | 'size' | 'span';

/** Footprints this close, in metres, touch: a jamb post set against the leaf it frames. */
const TOUCH = 0.05;
/** The least height of a door a person passes through, in metres: a panel, a post or a head piece is no door on its own. */
export const PASSABLE = 1.8;
/** The share of the group's extent along its width the door's own width covers. */
const SPANS = 0.9;

type Pt = { x: number; y: number };

const cornersOf = (r: OpeningRect): Pt[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
  x: r.c.x + (r.u.x * a * r.width) / 2 + (r.n.x * b * r.depth) / 2,
  y: r.c.y + (r.u.y * a * r.width) / 2 + (r.n.y * b * r.depth) / 2,
}));

/** The extent of `pts` along the unit `axis` from `origin`. */
function extentAlong(pts: readonly Pt[], origin: Pt, axis: Pt): [number, number] {
  const s = pts.map((p) => (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y);
  return [Math.min(...s), Math.max(...s)];
}

/** Whether two rectangles come within `TOUCH` of each other (overlapping ones do): separated by more than that along one of their axes, they do not. */
export function footprintsTouch(a: OpeningRect, b: OpeningRect): boolean {
  const ca = cornersOf(a), cb = cornersOf(b);
  for (const axis of [a.u, a.n, b.u, b.n]) {
    const [a0, a1] = extentAlong(ca, { x: 0, y: 0 }, axis), [b0, b1] = extentAlong(cb, { x: 0, y: 0 }, axis);
    if (b0 - a1 > TOUCH || a0 - b1 > TOUCH) return false;
  }
  return true;
}

/** The door of `group` (two or more ids) and the rule that decided, or null when what the model states and the geometry leave it open. */
export function doorOfGroup(
  group: readonly number[], readOf: (id: number) => OpeningRect | null, heightOf: (id: number) => number, stated: (id: number) => DoorStated,
): { door: number; rule: DoorRule } | null {
  const members = new Set(group);
  const parents = new Set(group.map((id) => stated(id).partOf).filter((p): p is number => p !== undefined && members.has(p)));
  if (parents.size === 1) return { door: [...parents][0], rule: 'part' };
  const sized = group.filter((id) => stated(id).statesSize);
  if (sized.length === 1) return { door: sized[0], rule: 'size' };
  const all = group.flatMap((id) => cornersOf(readOf(id)!));
  const spanning = group.filter((id) => {
    const r = readOf(id)!;
    const [s0, s1] = extentAlong(all, r.c, r.u);
    return heightOf(id) >= PASSABLE && r.width >= SPANS * (s1 - s0);
  });
  if (spanning.length === 0) return null;
  const door = spanning.reduce((best, id) => (readOf(id)!.width > readOf(best)!.width + 1e-6 ? id : best));
  return { door, rule: 'span' };
}

/** Whether `piece` lies mostly within the width of `door`: more than half its extent along the door's width falls inside it. */
function withinWidth(piece: OpeningRect, door: OpeningRect): boolean {
  const [p0, p1] = extentAlong(cornersOf(piece), door.c, door.u);
  const inside = Math.min(p1, door.width / 2) - Math.max(p0, -door.width / 2);
  return inside > (p1 - p0) / 2;
}

/**
 * The pieces among `loose` (doors hosted in nothing): in each group of touching footprints whose door `doorOfGroup` reads, every other
 * member within the door's width. `onDecided` hears each group's door and rule.
 */
export function loosePieces(
  loose: readonly number[], readOf: (id: number) => OpeningRect | null, heightOf: (id: number) => number, stated: (id: number) => DoorStated,
  onDecided?: (door: number, rule: DoorRule, pieces: readonly number[]) => void,
): Set<number> {
  const ids = loose.filter((id) => readOf(id) !== null);
  const root = new Map(ids.map((id) => [id, id]));
  const find = (id: number): number => { let r = id; while (root.get(r) !== r) r = root.get(r)!; return r; };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (footprintsTouch(readOf(ids[i])!, readOf(ids[j])!)) root.set(find(ids[i]), find(ids[j]));
    }
  }
  const groups = new Map<number, number[]>();
  for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  const pieces = new Set<number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const decided = doorOfGroup(group, readOf, heightOf, stated);
    if (!decided) continue;
    const door = readOf(decided.door)!;
    const own = group.filter((id) => id !== decided.door && withinWidth(readOf(id)!, door));
    for (const id of own) pieces.add(id);
    onDecided?.(decided.door, decided.rule, own);
  }
  return pieces;
}
