/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lining drawings up with each other on a sheet (#168, arranging views by direct manipulation). Pure functions on the
 * drawings' boxes on the paper (centre and size, as the sheet stores them), and one function that writes the result.
 *
 * Align: the FIRST drawing of the list is the anchor and stays where it is; every other one moves so that its left
 * (right, top, bottom) edge, or its horizontal (vertical) centre, lies on the anchor's. Distribute (three or more):
 * the two outermost drawings stay, and the ones between are spaced so the gaps between neighbouring edges are equal.
 * Neither changes a drawing's size or moves one along the axis it was not asked to. A whole action is ONE undo step.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { updateViewport } from './sheets';
import type { SnapBox } from './viewport-snap';

/** A drawing's box on the paper: its id, centre and size (mm). */
export interface AlignBox extends SnapBox { id: string }

export const ALIGN_MODES = ['left', 'right', 'top', 'bottom', 'centreH', 'centreV'] as const;
export type AlignMode = (typeof ALIGN_MODES)[number];

export const DISTRIBUTE_AXES = ['across', 'down'] as const;
export type DistributeAxis = (typeof DISTRIBUTE_AXES)[number];

/** A shift smaller than this (mm) is rounding noise, not a move. */
const EPS = 1e-9;

/** Where a drawing moves to: its new centre. */
export interface Move { id: string; x: number; y: number }

/** Drawings that need two (align) or three (distribute) boxes to do anything. */
export const MIN_TO_ALIGN = 2;
export const MIN_TO_DISTRIBUTE = 3;

const changed = (boxes: readonly AlignBox[], moved: readonly Move[]): Move[] => moved.filter((m) => {
  const was = boxes.find((b) => b.id === m.id);
  return !was || Math.abs(was.x - m.x) > EPS || Math.abs(was.y - m.y) > EPS;
});

/**
 * The moves that line `boxes` up with the first of them. The anchor never moves; a drawing already in line is not listed.
 * Fewer than two boxes: nothing.
 */
export function alignMoves(boxes: readonly AlignBox[], mode: AlignMode): Move[] {
  if (boxes.length < MIN_TO_ALIGN) return [];
  const [anchor, ...rest] = boxes;
  const moved = rest.map((b): Move => {
    switch (mode) {
      case 'left': return { id: b.id, x: anchor.x - anchor.width / 2 + b.width / 2, y: b.y };
      case 'right': return { id: b.id, x: anchor.x + anchor.width / 2 - b.width / 2, y: b.y };
      case 'top': return { id: b.id, x: b.x, y: anchor.y - anchor.height / 2 + b.height / 2 };
      case 'bottom': return { id: b.id, x: b.x, y: anchor.y + anchor.height / 2 - b.height / 2 };
      case 'centreH': return { id: b.id, x: b.x, y: anchor.y };
      case 'centreV': return { id: b.id, x: anchor.x, y: b.y };
    }
  });
  return changed(boxes, moved);
}

/**
 * The moves that space `boxes` evenly `across` (left to right) or `down` (top to bottom): the outermost two stay, and the
 * gap between each drawing's edge and the next one's is the same. Drawings are taken in the order they lie along the
 * axis, whatever order they were chosen in. Fewer than three boxes: nothing.
 */
export function distributeMoves(boxes: readonly AlignBox[], axis: DistributeAxis): Move[] {
  if (boxes.length < MIN_TO_DISTRIBUTE) return [];
  const across = axis === 'across';
  const centre = (b: AlignBox): number => (across ? b.x : b.y);
  const size = (b: AlignBox): number => (across ? b.width : b.height);
  const ordered = boxes.map((b, i) => ({ b, i })).sort((p, q) => centre(p.b) - centre(q.b) || p.i - q.i).map((p) => p.b);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const start = centre(first) - size(first) / 2;
  const end = centre(last) + size(last) / 2;
  const gap = (end - start - ordered.reduce((sum, b) => sum + size(b), 0)) / (ordered.length - 1);
  let edge = start;
  const moved = ordered.map((b): Move => {
    const at = edge + size(b) / 2;
    edge += size(b) + gap;
    return across ? { id: b.id, x: at, y: b.y } : { id: b.id, x: b.x, y: at };
  });
  return changed(boxes, moved);
}

/** Write `moves` to the sheet as ONE undo step. */
function apply(sheetId: string, moves: readonly Move[]): boolean {
  if (moves.length === 0) return false;
  runAsOneUndoStep(() => {
    for (const m of moves) updateViewport(sheetId, m.id, { x: m.x, y: m.y });
  });
  return true;
}

/** Line the drawings up with the first of `boxes` on `sheetId`: ONE undo step. False when nothing needed to move. */
export const alignViewports = (sheetId: string, boxes: readonly AlignBox[], mode: AlignMode): boolean => apply(sheetId, alignMoves(boxes, mode));

/** Space the drawings evenly on `sheetId`: ONE undo step. False when nothing needed to move. */
export const distributeViewports = (sheetId: string, boxes: readonly AlignBox[], axis: DistributeAxis): boolean => apply(sheetId, distributeMoves(boxes, axis));
