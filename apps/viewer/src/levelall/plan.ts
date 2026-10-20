/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LEVELALL's planner: the level marks a section or elevation still needs, one
 * at each storey level the view shows and one at the top of the building, all
 * on one vertical line outside the building, on the side with more room. Each
 * mark references the point on the building's outline at its height, so its
 * number is the model's and follows it; the symbol stays on the line. Pure and
 * deterministic.
 */

import type { LevelShape } from '@/drafting/level-mark';
import type { Pt } from '@/drafting/types';

export interface LevelsInput {
  /** The storeys of the project: name and elevation (metres). */
  levels: readonly { name: string; elevation: number }[];
  /** The building's extent in the view, drawing coordinates (y is the height). */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** Level marks the view already has (symbol and the height each reads). */
  existing: readonly LevelShape[];
  /** Boxes of the other annotation on the view, which a side's room is measured against. */
  taken: readonly { x0: number; y0: number; x1: number; y1: number }[];
  textHeight: number;
  /** Drawing units per paper millimetre. */
  paperUnit: number;
}

export interface PlannedLevel {
  key: string;
  shape: LevelShape;
}

export interface LevelsPlan {
  marks: PlannedLevel[];
  side: 'left' | 'right';
  /** Marks the view already had at those heights. */
  already: number;
}

/** Paper millimetres between the building and the line of marks. */
export const LEVEL_OFFSET_MM = 12;
/** Heights closer than this are the same level (metres). */
const SAME_HEIGHT = 0.01;

/** The symbol reaches one text height left of its point and five right (`annotation.ts`). */
const REACH_LEFT = 1, REACH_RIGHT = 5;

/** How far a side of the building is free of other annotation, over the height of the building. */
function room(side: 'left' | 'right', input: LevelsInput): number {
  const { bounds: b, taken } = input;
  const beside = taken.filter((r) => r.y0 < b.y1 && r.y1 > b.y0 && (side === 'left' ? r.x1 <= b.x0 + 1e-9 : r.x0 >= b.x1 - 1e-9));
  if (beside.length === 0) return Infinity;
  return side === 'left' ? b.x0 - Math.max(...beside.map((r) => r.x1)) : Math.min(...beside.map((r) => r.x0)) - b.x1;
}

export function planLevels(input: LevelsInput): LevelsPlan {
  const { bounds: b, textHeight: h } = input;
  const side = room('left', input) > room('right', input) ? 'left' : 'right';
  const gap = LEVEL_OFFSET_MM * input.paperUnit;
  const x = side === 'right' ? b.x1 + gap + REACH_LEFT * h : b.x0 - gap - REACH_RIGHT * h;
  const edge = side === 'right' ? b.x1 : b.x0;
  const heights: { key: string; y: number }[] = [
    ...input.levels.filter((l) => l.elevation >= b.y0 - SAME_HEIGHT && l.elevation <= b.y1 + SAME_HEIGHT).map((l) => ({ key: `level:${Math.round(l.elevation * 100)}`, y: l.elevation })),
    { key: 'top', y: b.y1 },
  ].sort((p, q) => p.y - q.y);
  const out: PlannedLevel[] = [];
  let already = 0;
  for (const level of heights) {
    // A level that is the same height as one already planned (the top of the building at a storey) is one mark.
    if (out.some((m) => Math.abs(m.shape.value - level.y) < SAME_HEIGHT)) continue;
    if (input.existing.some((m) => Math.abs((m.ref?.at.y ?? m.p.y) - level.y) < SAME_HEIGHT)) { already++; continue; }
    const at: Pt = { x: edge, y: level.y };
    out.push({ key: level.key, shape: { type: 'level', p: { x, y: level.y }, value: level.y, height: h, ref: { at } } });
  }
  return { marks: out, side, already };
}
