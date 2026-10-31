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
import { contentOf, facadeEnds, facadesOf, inFacade, type Facade } from './facades';
import { wallGaps } from './layers';
import { boxOf, outlinesOf, pointInRing, ringOfBox, rotate, type Box } from './outline';
import { readPlan } from './read';
import type { DimensionPlan, DimensionSettings, PlannedString, PlanPart, StringKind } from './types';

/** Paper mm from the facade to the first string when the dimension style has no setting (the style default, `DEFAULT_DIM_STYLE.allOffset`): clear of a row of tags. */
export const FIRST_MM = 20;
export const STEP_MM = 8;
/** Points closer than this along a string are one point (metres). */
const SAME = 0.005;
/** How far short of its ends (metres) a string is tested for running through the building. */
const CORNER = 0.01;
/** A separate mass shorter than this (metres) is a post, not a wall to dimension. */
const MIN_MASS = 2;
/** A mass thicker than this (metres) is more than one wall. */
const BARE_WALL = 1;

/** The values ascending, those within SAME of the one before merged into it; the last value stays the end of the string. */
function distinct(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > SAME) out.push(v);
  if (out.length > 1) out[out.length - 1] = sorted[sorted.length - 1];
  return out;
}

const key = (f: Facade, kind: StringKind) => `${kind}:${Math.round(f.n.x)},${Math.round(f.n.y)}@${(f.D).toFixed(2)}`;

export function planDimensions(parts: readonly PlanPart[], settings: DimensionSettings): DimensionPlan {
  const empty: DimensionPlan = { strings: [], skippedFacades: 0, droppedStrings: 0, droppedOpenings: 0, angle: 0, outline: [] };
  const { angle, walls, wholeWalls, wallBoxes, offAxis, bridged } = readPlan(parts);
  const inexact = bridged.filter((o) => !o.exact);
  const leftOut = new Set<number>();
  // A plan that cuts only bare walls: two gable walls under a roof, with nothing cut between them. Each wall gets its own facades, and a face turned towards another wall is an inner face, not a facade. A plan with an enclosed mass is that mass; what stands apart from it (a boundary wall) is not the building.
  const masses = outlinesOf([...walls, ...wholeWalls.flatMap(wallGaps).map(ringOfBox), ...bridged.map((o) => ringOfBox(o.box))]);
  if (masses.length === 0) return empty;
  const loop = masses[0];
  const loops = isBareWall(loop) ? masses.filter((m) => isBareWall(m)) : [loop];
  const back = (p: Pt) => rotate(p, angle);
  const first = (settings.firstMm ?? FIRST_MM) * settings.paperUnit, step = (settings.stepMm ?? STEP_MM) * settings.paperUnit;
  // What the view carries, in the frame of the walls: a string never stands over a tag or a note.
  const clear = (settings.clear ?? []).map((r) => boxOf([{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }].map((p) => rotate(p, -angle))));
  const strings: PlannedString[] = [];
  let skipped = 0, dropped = 0;
  for (const run of loops.flatMap((m) => facadesOf(m).map((f) => ({ ...f, mass: m })))) {
    if (loops.length > 1 && facesAnotherMass(run, run.mass, loops)) {
      skipped++;
      continue;
    }
    const ends = facadeEnds(run, wallBoxes);
    if (!ends) {
      // A run with no wall's outer face on it: round a wall at an angle it is a facade the plan cannot measure, and is reported. Otherwise it is the far side of a wall seen through a gap in the outline, not a facade at all.
      if (offAxis.some((ring) => ring.some((p) => touchesRun(run, p)))) dropped++;
      else skipped++;
      continue;
    }
    const f: Facade = { ...run, ...ends };
    const c = contentOf(f, wallBoxes, bridged);
    for (const o of inexact) if (Math.abs(inFacade(f, o.box).d1 - f.D) <= 0.03 && contentOf(f, wallBoxes, [{ ...o, exact: true }]).openings.length > 0) leftOut.add(o.part.id);
    if (c.openings.length === 0 && c.crossFaces.length === 0) {
      skipped++;
      continue;
    }
    const base = Math.max(first, clearanceOf(f, clear) > 0 ? clearanceOf(f, clear) + settings.textHeight * 1.5 : 0);
    const at = (s: number): Pt => back({ x: f.u.x * s + f.n.x * f.D, y: f.u.y * s + f.n.y * f.D });
    const sets: [StringKind, number[]][] = [['inner', [f.s0, f.s1, ...c.endFaces, ...c.crossFaces, ...c.openings]]];
    if (c.crossAxes.length) sets.push(['middle', [f.s0, f.s1, ...c.crossAxes]]);
    sets.push(['overall', [f.s0, f.s1]]);
    sets.forEach(([kind, values], i) => {
      const along = distinct(values);
      if (along.length < 2) return;
      // A string stands outside the building: on a facade of a notch or a courtyard its line would run through the building, over its rooms and labels, so it is left out and counted.
      const offset = base + step * i;
      if (loops.some((m) => runsThrough(m, f, along[0], along[along.length - 1], offset))) {
        dropped++;
        return;
      }
      // A span between the two edges of a door or window measures that element.
      const measures = along.slice(1).map((s1, k) => (kind === 'inner' ? c.openingParts.find((o) => Math.abs(o.s0 - along[k]) <= SAME && Math.abs(o.s1 - s1) <= SAME)?.id ?? null : null));
      strings.push({ key: key(f, kind), kind, along: back(f.u), outward: back(f.n), points: along.map(at), offset, measures });
    });
  }
  return { strings, skippedFacades: skipped, droppedStrings: dropped, droppedOpenings: leftOut.size, angle, outline: loop.map(back) };
}

/** Whether a mass is one wall on its own, of some length: no thicker than a wall, and not a post. */
function isBareWall(mass: readonly Pt[]): boolean {
  const b = boxOf(mass);
  return Math.min(b.x1 - b.x0, b.y1 - b.y0) <= BARE_WALL && Math.max(b.x1 - b.x0, b.y1 - b.y0) >= MIN_MASS;
}

/** Whether another mass stands straight in front of the facade, looking out from the middle of its run. */
function facesAnotherMass(f: Facade, own: readonly Pt[], masses: readonly (readonly Pt[])[]): boolean {
  const s = (f.s0 + f.s1) / 2;
  return masses.some((m) => {
    if (m === own) return false;
    const r = inFacade(f, boxOf(m));
    return r.d0 >= f.D && r.s0 <= s && r.s1 >= s;
  });
}

/** Whether a point lies on the facade's line, within its run. */
function touchesRun(f: Facade, p: Pt): boolean {
  const s = p.x * f.u.x + p.y * f.u.y, d = p.x * f.n.x + p.y * f.n.y;
  return Math.abs(d - f.D) <= 0.05 && s >= f.s0 - 0.05 && s <= f.s1 + 0.05;
}

/** How far beyond the facade's outer face the boxes in front of it reach (zero when none): a box in front is one that overlaps the facade's run and reaches outside its face. */
function clearanceOf(f: Facade, boxes: readonly Box[]): number {
  let far = 0;
  for (const b of boxes) {
    const r = inFacade(f, b);
    if (r.s1 > f.s0 && r.s0 < f.s1 && r.d1 > f.D + SAME) far = Math.max(far, r.d1 - f.D);
  }
  return far;
}

/** Whether the string's line, or the way to it from the facade, passes through the building `loop` (the facade frame `f`, from `s0` to `s1`, `offset` out). */
function runsThrough(loop: readonly Pt[], f: Facade, s0: number, s1: number, offset: number): boolean {
  // Its ends stay clear of the walls it ends at: at an inner corner the end of the line lies on the wall of the other wing, which is neither inside nor through it.
  const [a, b] = [s0 + CORNER, s1 - CORNER];
  const steps = Math.max(1, Math.ceil((b - a) / 0.25));
  for (let k = 0; k <= steps; k++) {
    const s = a + ((b - a) * k) / steps;
    for (const d of [0.5, 1]) {
      const out = f.D + offset * d;
      if (pointInRing({ x: f.u.x * s + f.n.x * out, y: f.u.y * s + f.n.y * out }, loop)) return true;
    }
  }
  return false;
}

/** The line a string runs on: from its first to its last point, moved out by its offset. */
export function stringLine(s: PlannedString): { a: Pt; b: Pt } {
  const move = (p: Pt): Pt => ({ x: p.x + s.outward.x * s.offset, y: p.y + s.outward.y * s.offset });
  return { a: move(s.points[0]), b: move(s.points[s.points.length - 1]) };
}
