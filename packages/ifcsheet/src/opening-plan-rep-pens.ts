/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pens of a door's own plan representation (#831), as the generated door symbol uses them (`doorSymbol`): the leaf heavy, the
 * swing thin. Decided per segment from its shape, since the file says nothing of a line's weight we read, and one stroke can hold both
 * (Bonsai writes a leaf's line and its swing as one composite curve):
 * - a segment is part of an arc when a vertex at either end turns like a chord of an arc (a few degrees), else it is straight;
 * - a straight segment on a closed loop of the representation's straight segments (a leaf's rectangle or a frame's outline, whether one
 *   closed polyline as Bonsai writes it or four lines as Revit does) is the leaf or the frame: heavy;
 * - a straight segment from an arc's end to the arc's centre (the leaf's line from the hinge to the swing's end) is the leaf: heavy;
 * - every other segment stays thin: a swing, an open line (a glass line across a leaf).
 * A window's representation stays thin throughout, as the generated window symbol is drawn.
 */

import type { Pt } from './draft-types.js';

/** A vertex turning by more than this and less than `CORNER` is a chord of an arc, in degrees. */
const CHORD = 0.5;
const CORNER = 20;
/** Ends closer than this are one corner, in metres. */
const JOIN = 0.0005;
/** A hinge lies this close, as a share of the leaf's length, to the same distance from every point of its swing. */
const HINGE = 0.1;

const turn = (a: Pt, b: Pt, c: Pt): number => {
  const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x);
  const d = Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  return (d * 180) / Math.PI;
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** For each segment of `line` (from point k to k + 1), whether it is part of an arc: a vertex at either end turns like a chord. */
function arcSegments(line: readonly Pt[]): boolean[] {
  const chord = line.map((p, i) => {
    if (i === 0 || i + 1 >= line.length) return false;
    const t = turn(line[i - 1], p, line[i + 1]);
    return t > CHORD && t < CORNER;
  });
  return line.slice(1).map((_, k) => chord[k] || chord[k + 1]);
}

/** The runs of consecutive segments of `line` alike in `pen`, as polylines, with their pen. */
function runs<T>(line: readonly Pt[], pen: readonly T[]): { pen: T; pts: Pt[] }[] {
  const out: { pen: T; pts: Pt[] }[] = [];
  pen.forEach((p, k) => {
    const last = out[out.length - 1];
    if (last && last.pen === p) last.pts.push(line[k + 1]);
    else out.push({ pen: p, pts: [line[k], line[k + 1]] });
  });
  return out;
}

/**
 * `lines` split into the door's heavy strokes (its leaf and frame) and its thin ones (its swing and the rest), per segment. A stroke
 * whose segments all take one pen is kept whole. Straight segments on loops: what is left after repeatedly dropping each straight
 * segment with a loose end (an end no other straight segment shares); a glass line meeting its frame mid-side keeps its loose ends.
 */
export function doorStrokePens(lines: readonly Pt[][]): { heavy: Pt[][]; thin: Pt[][] } {
  const nodes: Pt[] = [];
  const node = (p: Pt): number => {
    const at = nodes.findIndex((q) => dist(p, q) <= JOIN);
    if (at >= 0) return at;
    nodes.push(p);
    return nodes.length - 1;
  };
  const arcs = lines.map(arcSegments);
  const segments: { line: number; k: number; a: number; b: number; live: boolean }[] = [];
  lines.forEach((line, i) => arcs[i].forEach((arc, k) => {
    if (arc) return;
    const a = node(line[k]), b = node(line[k + 1]);
    if (a !== b) segments.push({ line: i, k, a, b, live: true });
  }));
  const degree = new Map<number, number>();
  for (const s of segments) for (const n of [s.a, s.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
  for (let dropped = true; dropped;) {
    dropped = false;
    for (const s of segments) {
      if (!s.live || ((degree.get(s.a) ?? 0) > 1 && (degree.get(s.b) ?? 0) > 1)) continue;
      s.live = false;
      dropped = true;
      for (const n of [s.a, s.b]) degree.set(n, (degree.get(n) ?? 0) - 1);
    }
  }
  // Each swing's points: a run of arc segments.
  const swings = lines.flatMap((line, i) => runs(line, arcs[i]).filter((r) => r.pen).map((r) => r.pts));
  const hinged = (p: Pt, q: Pt): boolean => {
    const leaf = dist(p, q);
    return swings.some((s) => [s[0], s[s.length - 1]].some((end) => dist(end, p) <= JOIN || dist(end, q) <= JOIN)
      && [p, q].some((h) => s.every((x) => Math.abs(dist(x, h) - leaf) <= HINGE * leaf)));
  };
  const heavy = new Set(segments.filter((s) => s.live || hinged(lines[s.line][s.k], lines[s.line][s.k + 1])).map((s) => `${s.line}:${s.k}`));
  const out = { heavy: [] as Pt[][], thin: [] as Pt[][] };
  lines.forEach((line, i) => {
    for (const r of runs(line, arcs[i].map((_, k) => heavy.has(`${i}:${k}`)))) (r.pen ? out.heavy : out.thin).push(r.pts);
  });
  return out;
}
