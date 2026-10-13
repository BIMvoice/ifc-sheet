/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What DIMALL's figures keep clear of besides each other: the symbols of the
 * sections cut through the plan (the cut line, the arrows at its ends and the
 * letters beside them), seen from one facade. The strings themselves stay where
 * the planner puts them: a string that runs across a cut line is normal; a
 * figure sitting on the cut line is not.
 */

import { textBox } from '@/drafting/annotation';
import type { FigureBox } from '@/drafting/figure-layout';
import { sectionLink } from '@/drafting/section-symbol';
import type { Rect } from '@/labels/label-geometry';
import type { DraftEntity, Pt } from '@/drafting/types';
import type { PlannedString } from './types';

/** The facade a string belongs to: its direction and outward normal, and where its face is across. */
export interface FacadeFrame { along: Pt; outward: Pt; face: number }

export function frameOf(s: PlannedString): FacadeFrame {
  return { along: s.along, outward: s.outward, face: s.points[0].x * s.outward.x + s.points[0].y * s.outward.y };
}

const toFrame = (f: FacadeFrame, p: Pt): Pt => ({ x: p.x * f.along.x + p.y * f.along.y, y: p.x * f.outward.x + p.y * f.outward.y - f.face });

/** The pieces of a section symbol: the cut line is long, the stems and barbs are short, the letters are texts. */
export interface SymbolPiece { kind: 'cut' | 'head'; a: Pt; b: Pt; box?: Pt[] }

export function symbolPieces(drafts: readonly DraftEntity[]): SymbolPiece[] {
  const out: SymbolPiece[] = [];
  const length = (d: DraftEntity): number => (d.shape.type === 'line' ? Math.hypot(d.shape.b.x - d.shape.a.x, d.shape.b.y - d.shape.a.y) : 0);
  // The longest line of each symbol, found once: asking per line was every line against every line.
  const longest = new Map<string, number>();
  for (const d of drafts) {
    const link = sectionLink(d);
    if (link !== null && d.shape.type === 'line') longest.set(link, Math.max(longest.get(link) ?? 0, length(d)));
  }
  for (const d of drafts) {
    const link = sectionLink(d);
    if (link === null) continue;
    const s = d.shape;
    if (s.type === 'line') {
      // A stem is four text heights; the cut line is the one piece longer than any stem or barb of its symbol.
      out.push({ kind: length(d) >= longest.get(link)! ? 'cut' : 'head', a: s.a, b: s.b });
    } else if (s.type === 'text') {
      const box = textBox(s.p, s.text, s.height, s.rotation);
      out.push({ kind: 'head', a: box[0], b: box[2], box });
    }
  }
  return out;
}

/** The obstacles of `pieces` in the frame of one facade: boxes along every line, boxes round every letter. */
export function avoidBoxes(pieces: readonly SymbolPiece[], frame: FacadeFrame, height: number): FigureBox[] {
  const out: FigureBox[] = [];
  const t = 0.04 * height;
  for (const p of pieces) {
    if (p.box) {
      const c = p.box.map((q) => toFrame(frame, q));
      out.push({ u0: Math.min(...c.map((q) => q.x)), u1: Math.max(...c.map((q) => q.x)), v0: Math.min(...c.map((q) => q.y)), v1: Math.max(...c.map((q) => q.y)) });
      continue;
    }
    const a = toFrame(frame, p.a), b = toFrame(frame, p.b);
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (0.2 * height)));
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
      out.push({ u0: x - t, u1: x + t, v0: y - t, v1: y + t });
    }
  }
  return out;
}

/** How many strings run through the head (arrow or letter) of a section symbol: a string cannot move out of its way, so the summary says so. */
export function stringsThroughHeads(strings: readonly PlannedString[], pieces: readonly SymbolPiece[], height: number): number {
  const heads = pieces.filter((p) => p.kind === 'head');
  return strings.filter((s) => {
    const f = frameOf(s);
    const u0 = s.points[0].x * f.along.x + s.points[0].y * f.along.y;
    const last = s.points[s.points.length - 1];
    const u1 = last.x * f.along.x + last.y * f.along.y;
    return avoidBoxes(heads, f, height).some((b) => b.u1 > Math.min(u0, u1) && b.u0 < Math.max(u0, u1) && b.v0 <= s.offset + height && b.v1 >= s.offset - height);
  }).length;
}

/** The pieces as boxes small enough to test a label against: a line as a run of boxes along it, a letter as its box. */
export function pieceRects(pieces: readonly SymbolPiece[], step: number): Rect[] {
  const half = step / 2;
  return pieces.flatMap((p): Rect[] => {
    if (p.box) {
      const xs = p.box.map((q) => q.x), ys = p.box.map((q) => q.y);
      return [{ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }];
    }
    const n = Math.max(1, Math.ceil(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) / step));
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = p.a.x + ((p.b.x - p.a.x) * i) / n, y = p.a.y + ((p.b.y - p.a.y) * i) / n;
      return { x0: x - half, y0: y - half, x1: x + half, y1: y + half };
    });
  });
}
