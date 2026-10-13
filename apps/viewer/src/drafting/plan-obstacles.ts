/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one list of things a plan draws that annotation keeps clear of, for
 * label placement (TAGALL) and the figures of DIMALL alike: the symbols of
 * the sections cut through the plan, and everything the plan draws over its
 * cut that is not part of the generated drawing or the drafted entities (door
 * swings, window glazing, roof lines, their pitch figures: `PlanOverlay`).
 * Everything comes out as pieces (short runs of a line, boxes round a text),
 * which both consumers already know how to avoid.
 */

import { textBox } from '@/drafting/annotation';
import { shapePrims } from '@/drafting/curves';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { PlanOverlay } from '@/project/plan-overlays';
import type { SymbolPiece } from '@/dimall/avoid';
import type { DraftShape, Pt } from './types';

/** An arc or circle is read as a run of chords this long at most (radians). */
const CHORD = Math.PI / 12;

function chords(shape: DraftShape): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (const p of shapePrims(shape)) {
    if (p.kind === 'seg') { out.push([p.a, p.b]); continue; }
    const sweep = p.full ? 2 * Math.PI : ((p.end - p.start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    const n = Math.max(1, Math.ceil(sweep / CHORD));
    const at = (i: number): Pt => ({ x: p.c.x + p.r * Math.cos(p.start + (sweep * i) / n), y: p.c.y + p.r * Math.sin(p.start + (sweep * i) / n) });
    for (let i = 0; i < n; i++) out.push([at(i), at(i + 1)]);
  }
  return out;
}

/**
 * What annotation of a plan keeps clear of: `drawn` is what the plan draws over its cut (door swings, glazing,
 * roofs); `linework` is the generated drawing's own lines, which a label in the middle of a room keeps clear of
 * (a stair, furniture) but a mark beside its element need not (the element's own faces are lines too).
 */
export interface PlanObstacles {
  drawn: SymbolPiece[];
  linework: SymbolPiece[];
}

/** The visible lines of a generated drawing as pieces: whatever the model draws inside a room (stairs, furniture, fittings) is an obstacle for a label. */
export function drawingPieces(drawing: Pick<Drawing2D, 'lines'> | null | undefined): SymbolPiece[] {
  return (drawing?.lines ?? []).filter((l) => l.visibility !== 'hidden').map((l): SymbolPiece => ({ kind: 'cut', a: { x: l.line.start.x, y: l.line.start.y }, b: { x: l.line.end.x, y: l.line.end.y } }));
}

/** The overlays of a plan as pieces; `textHeight` sizes the boxes of their texts (drawing units). */
export function overlayPieces(overlays: readonly PlanOverlay[], textHeight: number): SymbolPiece[] {
  const out: SymbolPiece[] = [];
  for (const o of overlays) {
    for (const s of o.shapes) for (const [a, b] of chords(s)) out.push({ kind: 'cut', a, b });
    for (const t of o.texts ?? []) {
      const box = textBox(t.at, t.text, textHeight, 0);
      out.push({ kind: 'head', a: box[0], b: box[2], box });
    }
  }
  return out;
}
