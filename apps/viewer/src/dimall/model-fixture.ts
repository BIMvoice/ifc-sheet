/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A building for the DIMALL figure tests, written as a surveyor would list it: each wall by where it starts, which way it
 * runs, its length and thickness, and each opening by its distance along the wall and its width. The cut outlines are
 * generated from that list, and the true figures read straight off it, so a test compares what DIMALL prints with what
 * the list says and never with the code under test.
 */

import type { Pt } from '@/drafting/types';
import type { PlanPart } from './types';

export interface SurveyOpening {
  id: number;
  kind: 'door' | 'window';
  /** Distance of the near jamb from the wall's start, and the width of the gap. */
  at: number;
  width: number;
  /** How far the frame reaches past each jamb, along the wall; negative when it stops short of them. */
  stops?: readonly [number, number];
  /** The width of the whole element when the plan cuts it short of that (a round window), centred on the gap. */
  bodyWidth?: number;
}

export interface SurveyWall {
  id: number;
  /** The wall's outer corner where it starts, and the way it runs, with the building on its left. */
  start: Pt;
  degrees: number;
  length: number;
  thickness: number;
  openings?: readonly SurveyOpening[];
  /** Mitre each end: the inner face is shorter than the outer by this, at the start and at the end. */
  mitre?: readonly [number, number];
  /** Material layers, outer first, each cut as its own outline; their sum is the thickness. */
  layers?: readonly number[];
}

const dir = (deg: number): Pt => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
/** A point of the wall: `s` along it from the start, `t` across it from the outer face into the building. */
const at = (w: SurveyWall, s: number, t: number): Pt => {
  const u = dir(w.degrees);
  return { x: w.start.x + u.x * s - u.y * t, y: w.start.y + u.y * s + u.x * t };
};

/** The outline of the wall from `s0` to `s1`, between `t0` and `t1` across it, mitred where it reaches the wall's ends. */
function piece(w: SurveyWall, s0: number, s1: number, t0: number, t1: number): Pt[] {
  const [m0, m1] = w.mitre ?? [0, 0];
  const slope0 = s0 <= 0 ? m0 / w.thickness : 0, slope1 = s1 >= w.length ? m1 / w.thickness : 0;
  const corners = [at(w, s0 + t0 * slope0, t0), at(w, s1 - t0 * slope1, t0), at(w, s1 - t1 * slope1, t1), at(w, s0 + t1 * slope0, t1)];
  // The section cutter leaves a vertex part way along each side: the outline's grid must not read them as steps.
  return corners.flatMap((p, i) => {
    const q = corners[(i + 1) % 4];
    return [p, { x: p.x + (q.x - p.x) * 0.45, y: p.y + (q.y - p.y) * 0.45 }];
  });
}

/** The outlines the plan cuts the building in. */
export function surveyParts(walls: readonly SurveyWall[]): PlanPart[] {
  const parts: PlanPart[] = [];
  for (const w of walls) {
    const ops = [...(w.openings ?? [])].sort((a, b) => a.at - b.at);
    const edges = [0, ...ops.flatMap((o) => [o.at, o.at + o.width]), w.length];
    const layers = w.layers ?? [w.thickness];
    const rings: Pt[][] = [];
    for (let i = 0; i + 1 < edges.length; i += 2) {
      let t = 0;
      for (const layer of layers) {
        rings.push(piece(w, edges[i], edges[i + 1], t, t + layer));
        t += layer;
      }
    }
    parts.push({ id: w.id, kind: 'wall', rings });
    for (const o of ops) {
      const [a, b] = o.stops ?? [0, 0];
      const third = w.thickness / 3;
      const frame = (s0: number, s1: number) => [at(w, s0, third), at(w, s1, third), at(w, s1, 2 * third), at(w, s0, 2 * third)];
      const part: PlanPart = { id: o.id, kind: o.kind, rings: [frame(o.at - a, o.at + 0.05), frame(o.at + 0.05, o.at + o.width - 0.05), frame(o.at + o.width - 0.05, o.at + o.width + b)] };
      if (o.bodyWidth !== undefined) {
        const extra = (o.bodyWidth - o.width) / 2;
        part.body = frame(o.at - extra, o.at + o.width + extra);
      }
      parts.push(part);
    }
  }
  return parts;
}

/** The width each opening has in the list, by part id. */
export function trueWidths(walls: readonly SurveyWall[]): Map<number, number> {
  return new Map(walls.flatMap((w) => (w.openings ?? []).map((o): [number, number] => [o.id, o.bodyWidth ?? o.width])));
}

/**
 * Every distance along a wall the list says is real: its ends, its jambs and where the walls meeting it stand. A printed
 * span is true when it is the difference of two of them on one wall line.
 */
export function trueStations(wall: SurveyWall, meeting: readonly number[] = []): number[] {
  return [0, wall.length, ...(wall.openings ?? []).flatMap((o) => { const e = ((o.bodyWidth ?? o.width) - o.width) / 2; return [o.at - e, o.at + o.width + e]; }), ...meeting];
}

/** A rectangle `w` by `h` of butt-jointed walls of `t`, its south-west corner at the origin; the south and east walls carry `south` and `east`, the east and west walls stop at the south and north walls. */
export function rectangle(w: number, h: number, t: number, south: readonly SurveyOpening[] = [], east: readonly SurveyOpening[] = [], first = 100): SurveyWall[] {
  return [
    { id: first, start: { x: 0, y: 0 }, degrees: 0, length: w, thickness: t, openings: south },
    { id: first + 1, start: { x: w, y: t }, degrees: 90, length: h - 2 * t, thickness: t, openings: east },
    { id: first + 2, start: { x: w, y: h }, degrees: 180, length: w, thickness: t },
    { id: first + 3, start: { x: 0, y: h - t }, degrees: 270, length: h - 2 * t, thickness: t },
  ];
}
