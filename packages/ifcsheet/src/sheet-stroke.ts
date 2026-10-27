/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the drafts of a viewport are drawn from on the paper (#479): the runs a pen draws, the text a label sets, and the helpers
 * the kinds of draft share (`sheet-annotations.ts`, `sheet-marks.ts`).
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import { arrowMark } from './dimension-layout.js';
import { readableDeg } from './draft-look.js';
import type { ArrowKind } from './draft-styles.js';
import type { SheetText } from './sheet-graphic.js';

/** Runs drawn with one pen on the paper: a drafted line's layer pen, a dimension's lines or its filled ticks. */
export interface SheetStroke {
  colour: string;
  /** Paper mm. */
  width: number;
  /** Paper mm; absent: solid. */
  dash?: readonly number[];
  runs: readonly (readonly Point2D[])[];
  /** Filled instead of stroked (an arrow head); each run is closed. */
  fill?: boolean;
  /** With `fill`: the runs are the loops of one region, filled even-odd, so an island stays open. */
  region?: boolean;
  /** 0 to 1; absent: opaque. */
  opacity?: number;
  /** Ends and dots drawn round: a hatch dot is a run of no length. */
  round?: boolean;
}

/** The way a drawing's axes run on the paper (`paperSigns`): what a drawing angle reads as there. */
export interface Frame {
  kx: 1 | -1;
  ky: 1 | -1;
}

/** A drawing-space angle (radians) as the sheet's text angle: screen degrees, y down, folded to read (`readableDeg`). */
export const readableAngle = (angle: number, { kx, ky }: Frame): number => readableDeg((Math.atan2(Math.sin(angle) * ky, Math.cos(angle) * kx) * 180) / Math.PI);

/** A text on the paper as the sheet's label draws it: at `p`, turned `deg` (screen, clockwise), its baseline moved `shift` in its own frame. */
export function label(p: Point2D, text: string, size: number, deg: number, shift: number, align: SheetText['align']): SheetText {
  const r = (deg * Math.PI) / 180;
  return { at: { x: p.x - shift * Math.sin(r), y: p.y + shift * Math.cos(r) }, text, size, align, ...(deg ? { angle: -deg } : {}) };
}

/** A dot as a closed ring of points, for writers that fill paths. */
export function dotRing(c: Point2D, r: number): Point2D[] {
  const n = 12;
  return Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
}

/**
 * The strokes of the ticks of a dimension, a leader's head among them, at `tips` (paper points with the paper direction each
 * points along): open marks in `width`, filled ones as fills.
 */
export function tickStrokes(kind: ArrowKind, tips: readonly { p: Point2D; dir: Point2D }[], size: number, colour: string, width: number): SheetStroke[] {
  const marks = tips.map((t) => arrowMark(kind, t.p, t.dir, size));
  const open = marks.flatMap((m) => (m?.kind === 'run' && !m.fill ? [m.pts] : []));
  const filled = marks.flatMap((m) => (m?.kind === 'run' && m.fill ? [[...m.pts, m.pts[0]]] : m?.kind === 'dot' ? [dotRing(m.c, m.r)] : []));
  const out: SheetStroke[] = [];
  if (open.length) out.push({ colour, width, runs: open });
  if (filled.length) out.push({ colour, width: 0, runs: filled, fill: true });
  return out;
}
