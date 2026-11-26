/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pens of a door's own plan representation (#831), as the generated door symbol uses them (`doorSymbol`): the leaf heavy, the
 * swing thin. Decided per stroke from its shape, since the file says nothing of a line's weight we read:
 * - a stroke of straight segments that each lie on a closed loop of the representation's straight segments (a leaf's rectangle or a
 *   frame's outline, whether one closed polyline as Bonsai writes it or four lines as Revit does) is the leaf or the frame: heavy;
 * - every other stroke stays thin: a swing (an arc or an ellipse's trim, read as chords turning a few degrees at each vertex), an open
 *   line (a glass line across a leaf), or a stroke mixing both (a composite curve of the leaf's line and its swing).
 * A window's representation stays thin throughout, as the generated window symbol is drawn.
 */

import type { Pt } from './draft-types.js';

/** A vertex turning by more than this and less than `CORNER` is a chord of an arc, in degrees. */
const CHORD = 0.5;
const CORNER = 20;
/** Ends closer than this are one corner, in metres. */
const JOIN = 0.0005;

const turn = (a: Pt, b: Pt, c: Pt): number => {
  const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x);
  const d = Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  return (d * 180) / Math.PI;
};

/** Whether `line` is straight segments only: no vertex turns like a chord of an arc. */
export function straightSegments(line: readonly Pt[]): boolean {
  for (let i = 1; i + 1 < line.length; i++) {
    const t = turn(line[i - 1], line[i], line[i + 1]);
    if (t > CHORD && t < CORNER) return false;
  }
  return line.length >= 2;
}

/**
 * The indices of `lines` that are the leaf or the frame: straight strokes whose every segment lies on a closed loop of the
 * representation's straight segments. What is left after repeatedly dropping each segment with a loose end (an end no other straight
 * segment shares) is the loops; a glass line meeting its frame mid-side keeps its loose ends and stays thin.
 */
export function leafStrokes(lines: readonly Pt[][]): Set<number> {
  const nodes: Pt[] = [];
  const node = (p: Pt): number => {
    const at = nodes.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= JOIN);
    if (at >= 0) return at;
    nodes.push(p);
    return nodes.length - 1;
  };
  const segments: { line: number; a: number; b: number; live: boolean }[] = [];
  lines.forEach((line, i) => {
    if (!straightSegments(line)) return;
    for (let k = 0; k + 1 < line.length; k++) {
      const a = node(line[k]), b = node(line[k + 1]);
      if (a !== b) segments.push({ line: i, a, b, live: true });
    }
  });
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
  const out = new Set<number>();
  lines.forEach((_, i) => {
    const own = segments.filter((s) => s.line === i);
    if (own.length > 0 && own.every((s) => s.live)) out.add(i);
  });
  return out;
}
