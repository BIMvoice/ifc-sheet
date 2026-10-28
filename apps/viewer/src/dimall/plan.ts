/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL's planner: from the cut outlines of a plan's walls, doors and
 * windows, the dimension strings an architect draws around the building.
 *
 * Each outer facade that has openings or cross walls gets, outward from the
 * building: an inner string (the corner walls, the cross walls and the door
 * and window edges), a middle string (corner to cross-wall axes to corner,
 * only when cross walls meet the facade) and an overall string. The first
 * string stands 20 mm (paper) from the facade by default (a dimension style
 * setting), the next ones 8 mm further.
 * Pure and deterministic: the same parts give the same strings.
 */

import type { Pt } from '@/drafting/types';
import { bridgedOpenings, contentOf, facadesOf, type Facade, type Opening } from './facades';
import { boxOf, mainDirection, outlineOf, rotate, unionBox } from './outline';
import type { DimensionPlan, DimensionSettings, PlannedString, PlanPart, StringKind } from './types';

/** Paper mm from the facade to the first string when the dimension style has no setting (the style default, `DEFAULT_DIM_STYLE.allOffset`): clear of a row of tags. */
export const FIRST_MM = 20;
export const STEP_MM = 8;
/** Points closer than this along a string are one point (metres). */
const SAME = 0.005;

function distinct(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > SAME) out.push(v);
  return out;
}

const key = (f: Facade, kind: StringKind) => `${kind}:${Math.round(f.n.x)},${Math.round(f.n.y)}@${(f.D).toFixed(2)}`;

export function planDimensions(parts: readonly PlanPart[], settings: DimensionSettings): DimensionPlan {
  const empty: DimensionPlan = { strings: [], skippedFacades: 0, angle: 0, outline: [] };
  const wallParts = parts.filter((p) => p.kind === 'wall');
  const angle = mainDirection(wallParts.flatMap((p) => p.rings));
  const turn = (ring: readonly Pt[]) => ring.map((p) => rotate(p, -angle));
  const walls = wallParts.flatMap((p) => p.rings.map(turn));
  const wallBoxes = walls.map(boxOf);
  const openings: Opening[] = parts.filter((p) => p.kind !== 'wall' && p.rings.length > 0).map((part) => ({ part, box: part.rings.map(turn).map(boxOf).reduce(unionBox) }));
  const bridged = bridgedOpenings(openings, wallBoxes);
  const loop = outlineOf([...walls, ...bridged.map((o) => [{ x: o.box.x0, y: o.box.y0 }, { x: o.box.x1, y: o.box.y0 }, { x: o.box.x1, y: o.box.y1 }, { x: o.box.x0, y: o.box.y1 }])]);
  if (!loop) return empty;
  const back = (p: Pt) => rotate(p, angle);
  const first = (settings.firstMm ?? FIRST_MM) * settings.paperUnit, step = (settings.stepMm ?? STEP_MM) * settings.paperUnit;
  const strings: PlannedString[] = [];
  let skipped = 0;
  for (const f of facadesOf(loop)) {
    const c = contentOf(f, wallBoxes, bridged);
    if (c.openings.length === 0 && c.crossFaces.length === 0) {
      skipped++;
      continue;
    }
    const at = (s: number): Pt => back({ x: f.u.x * s + f.n.x * f.D, y: f.u.y * s + f.n.y * f.D });
    const sets: [StringKind, number[]][] = [['inner', [f.s0, f.s1, ...c.endFaces, ...c.crossFaces, ...c.openings]]];
    if (c.crossAxes.length) sets.push(['middle', [f.s0, f.s1, ...c.crossAxes]]);
    sets.push(['overall', [f.s0, f.s1]]);
    sets.forEach(([kind, values], i) => {
      const along = distinct(values);
      if (along.length < 2) return;
      // A span between the two edges of a door or window measures that element.
      const measures = along.slice(1).map((s1, k) => (kind === 'inner' ? c.openingParts.find((o) => Math.abs(o.s0 - along[k]) <= SAME && Math.abs(o.s1 - s1) <= SAME)?.id ?? null : null));
      strings.push({ key: key(f, kind), kind, along: back(f.u), outward: back(f.n), points: along.map(at), offset: first + step * i, measures });
    });
  }
  return { strings, skippedFacades: skipped, angle, outline: loop.map(back) };
}

/** The line a string runs on: from its first to its last point, moved out by its offset. */
export function stringLine(s: PlannedString): { a: Pt; b: Pt } {
  const move = (p: Pt): Pt => ({ x: p.x + s.outward.x * s.offset, y: p.y + s.outward.y * s.offset });
  return { a: move(s.points[0]), b: move(s.points[s.points.length - 1]) };
}
