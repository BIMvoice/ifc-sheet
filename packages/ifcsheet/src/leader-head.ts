/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The end a leader carries at its tip (#842): an arrow, as every leader had before, a dot, as signage drawings use, or
 * nothing. A text's leader and a leader are both drawn from here: the app's drawing and sheet (`AnnotationGraphics.tsx`),
 * and the engine's sheet (`sheet-marks.ts`, `sheet-text-frame.ts`), which the PDF, the SVG and the DXF are written from.
 * The head is a filled loop, so the DXF writes it as a solid hatch.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { LeaderEnd } from './draft-types.js';
import { tickStrokes } from './sheet-stroke.js';

export { LEADER_ENDS, asLeaderEnd, type LeaderEnd } from './draft-types.js';

/** What a shape keeps of a leader end: nothing for the arrow, so a drawing made before the choice existed is the same. */
export const storedLeaderEnd = (end: LeaderEnd | undefined): { leaderEnd?: Exclude<LeaderEnd, 'arrow'> } => (end && end !== 'arrow' ? { leaderEnd: end } : {});

/** `shape` with the leader end `end`: the field set, or left out for the arrow. The same object when nothing changes. */
export function withLeaderEnd<S extends { leaderEnd?: LeaderEnd }>(shape: S, end: LeaderEnd | undefined): S {
  const want = storedLeaderEnd(end).leaderEnd;
  if (want === shape.leaderEnd || (want === undefined && shape.leaderEnd === 'arrow')) return shape;
  const { leaderEnd: _old, ...rest } = shape;
  return (want ? { ...rest, leaderEnd: want } : rest) as S;
}

/** The size of a leader's head, paper units: 1.2 arrow sizes of the dimension style, and never under `least` (four pen widths). */
export const leaderHeadSize = (arrowSize: number, least: number): number => Math.max(arrowSize * 1.2, least);

/**
 * The loops a leader's head is filled as, at `tip` pointing along `dir`, `size` long: the arrow's triangle, or the dot as a
 * ring 0.6 of the size across (`arrowMark`, `dotRing`); none for `none`. Each loop ends where it starts.
 */
export function leaderHeadLoops(end: LeaderEnd | undefined, tip: Point2D, dir: Point2D, size: number): Point2D[][] {
  return tickStrokes(end ?? 'arrow', [{ p: tip, dir }], size, '', 0).flatMap((s) => (s.fill ? s.runs.map((run) => [...run]) : []));
}
