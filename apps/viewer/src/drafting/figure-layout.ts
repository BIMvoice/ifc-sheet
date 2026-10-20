/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the figures of dimension strings go. A figure that does not fit its
 * span, or would sit on an extension line or on another figure, is moved the
 * way a draughtsman moves it: above or below the line in turn, or out past the
 * end of the string, each with a short leader. Pure and deterministic: the
 * same strings give the same places, and a figure is never put where it would
 * touch another figure, a line of any string of the facade, or a given obstacle.
 *
 * The frame is the facade's: `u` runs along the strings, `v` outward from the
 * face of the building. A figure sits above its dimension line in the text's
 * own reading frame, which is outward or inward depending on the facade;
 * `sigma` says which (+1 outward). Lifts are in text heights, positive toward
 * the side the figure reads on ("up").
 */

import { readableDeg } from './styles';
import type { Pt } from './types';

/** An axis-aligned obstacle in the facade frame. */
export interface FigureBox { u0: number; u1: number; v0: number; v1: number }

/** One string of a facade: where its points are, how far out its line is, and how wide each span's figure is. */
export interface FacadeString {
  /** Positions along the string, ascending. */
  points: readonly number[];
  /** Distance of the dimension line from the face of the building. */
  offset: number;
  /** Width of the figure of each span (`points.length - 1` of them). */
  widths: readonly number[];
}

export interface FigurePlace {
  /** Text heights across the line, toward the reading side (0: on the line). */
  lift: number;
  /** Shift along the string. */
  du: number;
  /** Whether the figure is clear of everything; false only when no place was free. */
  clear: boolean;
}

export interface FigureOptions {
  /** Text height. */
  height: number;
  /** +1 when the figure's reading side is the outward one. */
  sigma: 1 | -1;
  /** How far the extension lines run past the dimension line. */
  over: number;
  /** Other things the figures must keep clear of (section lines and marks, other annotation). */
  obstacles?: readonly FigureBox[];
}

/** Lift above and below the line, in text heights: past the extension lines' overshoot on the outward side, short of the next string. */
export const LIFT_UP = 1.3;
export const LIFT_DOWN = -1.9;
/** Gap between the line and the figure's baseline, and the height of the figure's glyphs, in text heights. */
const GAP = 0.3;
const ASCENT = 0.72;
/** Clearance kept round a figure, along and across, in text heights. */
const PAD_U = 0.25;
const PAD_V = 0.15;
/** Half-thickness given to a line, in text heights. */
const THIN = 0.04;
/** How many figure widths past the end of a string a narrow span may send its figure. */
const REACH = 3;
const SHIFTS = 16;

const hits = (a: FigureBox, b: FigureBox) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;

/** The reading side ("up") of text along `along`, in drawing space, for a view whose screen has these signs. */
export function figureUp(along: Pt, screenUp: 1 | -1, screenRight: 1 | -1): Pt {
  const turn = readableDeg((Math.atan2(-screenUp * along.y, screenRight * along.x) * 180) / Math.PI);
  const phi = (turn * Math.PI) / 180;
  return { x: Math.sin(phi) * screenRight, y: -Math.cos(phi) * -screenUp };
}

/** Where along the line, and how far across it, a figure at `lift` sits: its glyph box, in the facade frame. */
function band(line: number, lift: number, o: FigureOptions): [number, number] {
  const h = o.height;
  const a = lift * h + GAP * h, b = a + ASCENT * h;
  const [p, q] = [line + o.sigma * a, line + o.sigma * b];
  return p < q ? [p, q] : [q, p];
}

/** The lines of a facade's strings: each dimension line and every extension line from the face to past its line. */
function lineBoxes(strings: readonly FacadeString[], o: FigureOptions): FigureBox[] {
  const t = THIN * o.height;
  return strings.flatMap((s) => {
    if (s.points.length < 2) return [];
    const far = s.offset + o.over;
    return [
      { u0: s.points[0], u1: s.points[s.points.length - 1], v0: s.offset - t, v1: s.offset + t },
      ...s.points.map((u) => ({ u0: u - t, u1: u + t, v0: Math.min(0, far), v1: Math.max(0, far) })),
    ];
  });
}

/**
 * The places of every figure of a facade's strings, string by string from the
 * innermost, span by span. One entry per string, one per span.
 */
export function layoutFacade(strings: readonly FacadeString[], o: FigureOptions): FigurePlace[][] {
  const h = o.height;
  const fixed = [...lineBoxes(strings, o), ...(o.obstacles ?? [])];
  const placed: FigureBox[] = [];
  return strings.map((s) => {
    let lifted = 0;
    return s.widths.map((w, i) => {
      const from = s.points[i], to = s.points[i + 1];
      const mid = (from + to) / 2;
      const first = s.points[0], last = s.points[s.points.length - 1];
      const box = (lift: number, du: number): FigureBox => {
        const [v0, v1] = band(s.offset, lift, o);
        return { u0: mid + du - w / 2 - PAD_U * h, u1: mid + du + w / 2 + PAD_U * h, v0: v0 - PAD_V * h, v1: v1 + PAD_V * h };
      };
      const free = (b: FigureBox) => !fixed.some((q) => hits(b, q)) && !placed.some((q) => hits(b, q));
      const sides = lifted % 2 === 0 ? [LIFT_UP, LIFT_DOWN] : [LIFT_DOWN, LIFT_UP];
      const step = w / 2 + PAD_U * h;
      // Out past an end of the string, on the line, one figure's width further for each slot; nearer end first,
      // and only for a span close to that end (further in, the leader would run over other spans).
      const slotW = w + 2 * PAD_U * h;
      const ends = mid - first <= last - mid ? ['start', 'end'] : ['end', 'start'];
      const endCandidates: [number, number][] = [];
      for (let slot = 0; slot < 3; slot++) {
        for (const end of ends) {
          const reach = end === 'start' ? mid - first : last - mid;
          if (reach > REACH * slotW) continue;
          const at = end === 'start' ? first - w / 2 - 2 * PAD_U * h - slot * slotW : last + w / 2 + 2 * PAD_U * h + slot * slotW;
          endCandidates.push([0, at - mid]);
        }
      }
      const candidates: [number, number][] = [[0, 0], ...sides.map((l): [number, number] => [l, 0]), ...endCandidates];
      for (let k = 1; k <= SHIFTS; k++) for (const sign of [1, -1]) for (const l of sides) candidates.push([l, (sign * k * step) / 2]);
      // On the line when it is free; otherwise the free place whose leader is shortest (earlier candidates win a tie).
      const cost = ([lift, du]: [number, number]) => (lift === 0 && du === 0 ? -1 : Math.hypot(du, lift * h));
      const pick = candidates.filter(([lift, du]) => free(box(lift, du))).reduce<[number, number] | undefined>((best, c) => (best === undefined || cost(c) < cost(best) - 1e-9 ? c : best), undefined);
      const [lift, du] = pick ?? [sides[0], 0];
      if (lift !== 0 || du !== 0) lifted++;
      placed.push(box(lift, du));
      return { lift, du, clear: pick !== undefined };
    });
  });
}

/**
 * The leader of a figure moved off its line: from `from` (the middle of the dimension line) to the near edge of the
 * figure, whose anchor is `textAt` and whose width is `width` along `along`. It ends at the top of the glyphs when the
 * figure sits on the far side of the line from its reading side, so it never crosses the figure. `null` when the
 * figure is within half a height of where it started.
 */
export function leaderOf(from: Pt, textAt: Pt, height: number, up: Pt, along: Pt, width: number): { a: Pt; b: Pt } | null {
  const dx = textAt.x - from.x, dy = textAt.y - from.y;
  if (Math.hypot(dx, dy) < 0.5 * height) return null;
  const across = dx * up.x + dy * up.y;
  const reach = across < 0 ? (GAP + ASCENT) * height : 0;
  const slide = Math.max(-width / 2, Math.min(width / 2, -(dx * along.x + dy * along.y)));
  return { a: from, b: { x: textAt.x + up.x * reach + along.x * slide, y: textAt.y + up.y * reach + along.y * slide } };
}
