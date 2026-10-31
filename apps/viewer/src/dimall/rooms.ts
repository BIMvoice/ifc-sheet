/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL inside the rooms (#638): each room of the plan gets its clear width and its clear depth, one dimension per
 * direction, between the faces of the walls that bound it.
 *
 * The rooms come from the model's spaces and say only WHICH walls bound a room and where it is; the figure is read
 * off the walls, with the same readings as the outer chains (`read.ts`): the distance between the two wall faces that
 * face each other along a line through the room. A line counts only when both faces are where the room's outline says
 * its sides are (so a column or a partition in the way is not a side), the whole run lies inside the room's outline
 * (so a line that slipped through a door into the next room is not), and no wall off the plan's axes is near the room.
 * A non-rectangular room is measured along a line where its two extreme sides are both walls of the plan: the figure
 * is then the true clear distance between two parallel walls, and its overall size.
 *
 * The line is then placed where the dimension (line, ticks and figure) touches nothing: no wall, no tag or room label,
 * no symbol, no other dimension. Lines are tried from the walls inwards. A chain with no such place is left out and
 * counted; nothing is printed over anything.
 */

import { dimensionLayout } from '@/drafting/annotation';
import type { AnnotationShape, Pt } from '@/drafting/types';
import { textBlock } from '@/drafting/text-block';
import { boxOf, pointInRing, rotate, type Box } from './outline';
import { readPlan } from './read';
import { segmentHitsRect } from './tag-clear';
import type { PlanPart } from './types';

export interface RoomInput {
  /** Names the room, so a rerun finds its dimensions again (its GlobalId). */
  id: string;
  /** The room's outline on the plan, drawing space. */
  ring: Pt[];
}

export interface RoomChain {
  /** Names the room and the direction, without where the line stands. */
  key: string;
  room: string;
  dir: 'x' | 'y';
  /** The two wall faces, drawing space, on the line the dimension stands on. */
  a: Pt;
  b: Pt;
  /** The clear distance between them, metres. */
  length: number;
  /** The wall faces' positions along the direction, in the plan's frame: what a rerun's stamp is made of. */
  from: number;
  to: number;
}

export interface RoomPlan {
  chains: RoomChain[];
  /** Chains left out: no true figure, or no place clear of everything. */
  dropped: number;
  /** The model has no spaces on this plan. */
  noRooms: boolean;
  /** The dimension shape of each chain, in the order of `chains`, with its figure placed. */
  shapes: Extract<AnnotationShape, { type: 'dimension' }>[];
}

export interface RoomSettings {
  textHeight: number;
  /** What the view already carries (tags, room labels, symbols, dimensions), drawing space. A figure keeps clear of all of it; a dimension line may run across what is `crossable` (a section's cut line, a dashed roof or grid line). */
  obstacles: readonly (Box & { crossable?: boolean })[];
  /** Every line the drawing carries (hidden ones too), drawing space: a figure keeps clear of all of them, and a dimension line never runs along one. */
  lines?: readonly { a: Pt; b: Pt }[];
}

/** A side of the room's outline and the wall face found for it may differ by this (metres): spaces are drawn to the finish or to the axis. */
const SIDE_TOL = 0.25;
/** The room's outline is sampled this far inside the faces (metres): a space a skirting smaller than the walls is still the room. */
const INSET = 0.15;
const STEP = 0.05;
/** A figure slides along its line in steps of this (metres). */
const SLIDE = 0.1;
/** A room smaller than this either way (metres) has no room for a figure. */
const MIN_SIDE = 0.8;
/** A wall at an angle within this of a room (metres) means its sides are not walls on the axes. */
const NEAR_OFF_AXIS = 0.3;
/** A wall face shorter than this along the room (metres) is a post or a jamb, not a wall that bounds it. */
const MIN_FACE = 0.4;
/** How far either side of its line a figure reaches, in text heights (glyphs 0.3 to 1.02 above the line; the placement style may put them on either side). */
const FIGURE_BAND = 1.05;

const T = (p: Pt): Pt => ({ x: p.y, y: p.x });
const tBox = (b: Box): Box => ({ x0: b.y0, y0: b.x0, x1: b.y1, y1: b.x1 });
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The free stretches of the line `y` between the solids, each as [from, to]. */
function freeRuns(solids: readonly Box[], y: number, within: readonly [number, number]): [number, number][] {
  const hit = solids.filter((s) => s.y0 < y - 0.002 && s.y1 > y + 0.002).sort((a, b) => a.x0 - b.x0);
  const runs: [number, number][] = [];
  let at = -Infinity;
  for (const s of hit) {
    if (s.x0 > at && Number.isFinite(at)) runs.push([at, s.x0]);
    at = Math.max(at, s.x1);
  }
  return runs.filter(([a, b]) => b > within[0] - SIDE_TOL && a < within[1] + SIDE_TOL);
}

interface Line { cross: number; lo: number; hi: number }

/** The lines through a room, in the frame where the chain runs along x: where both faces are the room's sides, nearest the walls first. */
function linesOf(ring: readonly Pt[], solids: readonly Box[]): Line[] {
  const b = boxOf(ring);
  const out: Line[] = [];
  for (let y = b.y0 + INSET; y <= b.y1 - INSET + 1e-9; y += STEP) {
    for (const [lo, hi] of freeRuns(solids, y, [b.x0, b.x1])) {
      if (Math.abs(lo - b.x0) > SIDE_TOL || Math.abs(hi - b.x1) > SIDE_TOL) continue;
      // Both faces are walls with some length along the room, not a jamb or a post.
      const long = (s: Box) => s.y0 < y && s.y1 > y && s.y1 - s.y0 >= MIN_FACE;
      if (!solids.some((s) => s.x1 === lo && long(s)) || !solids.some((s) => s.x0 === hi && long(s))) continue;
      let inside = true;
      for (let x = lo + INSET; x <= hi - INSET && inside; x += 0.1) inside = pointInRing({ x, y }, ring);
      if (inside) out.push({ cross: y, lo, hi });
    }
  }
  return out.sort((p, q) => Math.min(p.cross - b.y0, b.y1 - p.cross) - Math.min(q.cross - b.y0, b.y1 - q.cross));
}

/** How close (metres) a drawing line must lie to a dimension line, and how little of it must overlap, for the dimension to be drawn along it. */
const ALONG_TOL = 0.04;
const ALONG_MIN = 0.05;

/** Whether the dimension line from `a` to `b` runs along one of `lines`: parallel to it, within `ALONG_TOL`, over more than `ALONG_MIN` of its length. */
function runsAlong(a: Pt, b: Pt, lines: readonly { a: Pt; b: Pt }[]): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  return lines.some((l) => {
    const [da, db] = [l.a, l.b].map((p) => (p.x - a.x) * -u.y + (p.y - a.y) * u.x);
    if (Math.abs(da) > ALONG_TOL || Math.abs(db) > ALONG_TOL) return false;
    const [sa, sb] = [l.a, l.b].map((p) => (p.x - a.x) * u.x + (p.y - a.y) * u.y);
    return Math.min(len, Math.max(sa, sb)) - Math.max(0, Math.min(sa, sb)) > ALONG_MIN;
  });
}

/** Whether a dimension line may run over `t`: it is a thing that crosses the line (longer across it than along it), not one that runs with it, which would draw the line on top of another. */
function crosses(t: Box & { crossable?: boolean }, flip: boolean): boolean {
  if (!t.crossable) return false;
  const [w, d] = [t.x1 - t.x0, t.y1 - t.y0];
  return (flip ? w : d) > (flip ? d : w);
}

type DimShape = Extract<AnnotationShape, { type: 'dimension' }>;

/** The dimension of a line (in the frame where the chain runs along x, or along y when `flip`), its figure `du` along it from the middle. */
function chainShape(l: Line, flip: boolean, back: (p: Pt) => Pt, height: number, du: number): DimShape {
  const at = (u: number): Pt => back(flip ? { x: l.cross, y: u } : { x: u, y: l.cross });
  const mid = (l.lo + l.hi) / 2;
  return { type: 'dimension', variant: 'aligned', a: at(l.lo), b: at(l.hi), at: at(mid), height, ...(du === 0 ? {} : { textAt: at(mid + du) }) };
}

export function planRoomChains(parts: readonly PlanPart[], rooms: readonly RoomInput[], settings: RoomSettings): RoomPlan {
  const out: RoomPlan = { chains: [], dropped: 0, noRooms: rooms.length === 0, shapes: [] };
  if (rooms.length === 0) return out;
  const { angle, wallBoxes, bridged, offAxis } = readPlan(parts);
  const solids = [...wallBoxes, ...bridged.filter((o) => o.exact !== false).map((o) => o.box)];
  const solidsT = solids.map(tBox);
  const h = settings.textHeight, pad = 0.3 * h;
  const back = (p: Pt) => rotate(p, angle);
  // Everything already on the view, in the frame of the walls; what this run places joins it.
  const taken: (Box & { crossable?: boolean })[] = settings.obstacles.map((r) => ({ ...boxOf([{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }].map((p) => rotate(p, -angle))), ...(r.crossable ? { crossable: true } : {}) }));
  const drawn = (settings.lines ?? []).map((l) => ({ a: rotate(l.a, -angle), b: rotate(l.b, -angle) }));
  for (const room of [...rooms].sort((a, b) => a.id.localeCompare(b.id))) {
    const ring = room.ring.map((p) => rotate(p, -angle));
    const box = boxOf(ring);
    const turned = offAxis.some((r) => r.some((p) => p.x > box.x0 - NEAR_OFF_AXIS && p.x < box.x1 + NEAR_OFF_AXIS && p.y > box.y0 - NEAR_OFF_AXIS && p.y < box.y1 + NEAR_OFF_AXIS));
    if (ring.length < 3 || box.x1 - box.x0 < MIN_SIDE || box.y1 - box.y0 < MIN_SIDE || turned) {
      out.dropped += 2;
      continue;
    }
    // The drawing's lines in and round this room.
    const near = drawn.filter((l) => Math.max(l.a.x, l.b.x) > box.x0 - 0.3 && Math.min(l.a.x, l.b.x) < box.x1 + 0.3 && Math.max(l.a.y, l.b.y) > box.y0 - 0.3 && Math.min(l.a.y, l.b.y) < box.y1 + 0.3);
    for (const dir of ['x', 'y'] as const) {
      const flip = dir === 'y';
      const lines = flip ? linesOf(ring.map(T), solidsT) : linesOf(ring, solids);
      let placed = false;
      const frameBox = flip ? tBox : (b: Box) => b;
      // A figure stands at the middle of its line; where something stands there (a section's cut line through the room, say), it slides along its line, the nearest free place first, with the leader a moved figure carries.
      const widths = new Map<number, number>();
      const widthOf = (l: Line) => {
        const k = Math.round((l.hi - l.lo) * 1000);
        if (!widths.has(k)) widths.set(k, textBlock(dimensionLayout(chainShape(l, flip, back, h, 0)).label, h).outer.x1);
        return widths.get(k) as number;
      };
      const reach = Math.max(0, ...lines.map((l) => (l.hi - l.lo) / 2 - widthOf(l) / 2 - h));
      const tryPlace = (l: Line, du: number): boolean => {
        const width = widthOf(l);
        // The figure must sit between the faces, with a text height to spare each side for the ticks.
        if (width + 2 * h > l.hi - l.lo) return false;
        // In the frame where the chain runs along x: the figure reads on one side of its line, whichever the placement style puts it on, so both are kept free; the line itself is thin.
        const mid = (l.lo + l.hi) / 2 + du;
        const figure: Box = { x0: mid - width / 2 - pad, x1: mid + width / 2 + pad, y0: l.cross - FIGURE_BAND * h - pad, y1: l.cross + FIGURE_BAND * h + pad };
        const line: Box = { x0: l.lo, x1: l.hi, y0: l.cross - 0.15 * h, y1: l.cross + 0.15 * h };
        // The line ends on the faces it measures: only the figure is tested against the walls.
        const [figureAt, lineAt] = [frameBox(figure), frameBox(line)];
        const [pa, pb] = [l.lo, l.hi].map((u) => (flip ? { x: l.cross, y: u } : { x: u, y: l.cross }));
        if (near.some((ln) => segmentHitsRect(ln, figureAt, 0)) || runsAlong(pa, pb, near)) return false;
        if (solids.some((s) => overlaps(figureAt, s)) || taken.some((t) => overlaps(figureAt, t) || (overlaps(lineAt, t) && !crosses(t, flip)))) return false;
        // A line may cross the other line of its room (the two cross, or meet at a corner); no line runs through a figure.
        taken.push({ ...lineAt, crossable: true }, figureAt);
        const [a, b] = [l.lo, l.hi].map((u) => back(flip ? { x: l.cross, y: u } : { x: u, y: l.cross }));
        out.chains.push({ key: `room:${room.id}:${dir}`, room: room.id, dir, a, b, length: l.hi - l.lo, from: l.lo, to: l.hi });
        out.shapes.push(chainShape(l, flip, back, h, du));
        return true;
      };
      for (let k = 0; k <= Math.floor(reach / SLIDE + 1e-9) && !placed; k++) {
        for (const sign of k === 0 ? [1] : [1, -1]) {
          placed = lines.some((l) => tryPlace(l, sign * k * SLIDE));
          if (placed) break;
        }
      }
      if (!placed) out.dropped++;
    }
  }
  return out;
}
