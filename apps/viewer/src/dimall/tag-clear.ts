/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A tag standing out on its leader in front of a facade (a window tag below the wall) lies between the facade and the
 * strings, so the extension lines of the strings run through it (#638). The tag slides along its facade, the shortest way
 * that clears every extension line, and keeps its leader's tip where it is (a tag with no leader gets one, to where it stood):
 * no figure changes and the tag still points at its element. A tag that cannot be cleared within `REACH` is left where it is. A line breaking around a tag would need
 * the dimension to carry gaps, a change to every renderer; a slide is the smaller change.
 */

import { textBox } from '@/drafting/annotation';
import type { DraftEntity, EntityShape, Pt } from '@/drafting/types';
import type { Rect } from '@/labels/label-geometry';
import { sectionLink } from '@/drafting/section-symbol';
import type { DimensionPlan } from './types';

/** How far a tag may slide (metres). */
const REACH = 3;
const STEP = 0.05;

type Seg = { a: Pt; b: Pt };

/** The extension lines of the plan's strings: from each measured point out past the string's line. */
export function extensionLines(plan: DimensionPlan): Seg[] {
  return plan.strings.flatMap((s) => s.points.map((p): Seg => ({ a: p, b: { x: p.x + s.outward.x * s.offset, y: p.y + s.outward.y * s.offset } })));
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Whether the segment touches the box (inflated by `m`). */
export function segmentHitsRect(s: Seg, r: Rect, m: number): boolean {
  const box = { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m };
  const inside = (p: Pt) => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1;
  if (inside(s.a) || inside(s.b)) return true;
  const c: Pt[] = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
  return c.some((p, i) => {
    const q = c[(i + 1) % 4];
    return cross(s.a, s.b, p) * cross(s.a, s.b, q) < 0 && cross(p, q, s.a) * cross(p, q, s.b) < 0;
  });
}

const rectOf = (pts: readonly Pt[]): Rect => ({ x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) });
const overlap = (a: Rect, b: Rect, m: number) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;

/**
 * The tags among `drafts` (texts, with or without a leader) that an extension line of `plan` runs through, each with the shape it
 * slides to. `blocked` is what a tag may not move onto (other annotations, symbols), without the tags themselves.
 */
export function clearTags(plan: DimensionPlan, drafts: readonly DraftEntity[], blocked: readonly Rect[], height: number): Map<string, EntityShape> {
  const out = new Map<string, EntityShape>();
  const lines = extensionLines(plan);
  const m = 0.15 * height;
  const tags = drafts.filter((d) => d.shape.type === 'text' && sectionLink(d) === null);
  const boxOf = (d: DraftEntity, dx: number, dy: number): Rect => {
    const s = d.shape as Extract<EntityShape, { type: 'text' }>;
    return rectOf(textBox({ x: s.p.x + dx, y: s.p.y + dy }, s.text, s.height, s.rotation, s.frame));
  };
  // Tags already moved count as obstacles for the ones after them.
  const placed: Rect[] = tags.map((d) => boxOf(d, 0, 0));
  tags.forEach((d, i) => {
    const s = d.shape as Extract<EntityShape, { type: 'text' }>;
    const here = placed[i];
    const crossing = plan.strings.filter((str) => str.points.some((p) => segmentHitsRect({ a: p, b: { x: p.x + str.outward.x * str.offset, y: p.y + str.outward.y * str.offset } }, here, m)));
    if (crossing.length === 0) return;
    // Along the facade the tag is in front of.
    const along = crossing[0].along;
    const others = [...blocked, ...placed.filter((_, k) => k !== i)];
    const free = (r: Rect) => !lines.some((l) => segmentHitsRect(l, r, m)) && !others.some((o) => overlap(r, o, m));
    const steps = Math.round(REACH / STEP);
    for (let k = 1; k <= steps; k++) {
      for (const sign of [1, -1]) {
        const [dx, dy] = [along.x * sign * k * STEP, along.y * sign * k * STEP];
        const r = boxOf(d, dx, dy);
        if (!free(r)) continue;
        // A tag with no leader stood at its element: it gets one, from its new place to where it stood.
        out.set(d.id, { ...s, p: { x: s.p.x + dx, y: s.p.y + dy }, leader: s.leader ?? { x: (here.x0 + here.x1) / 2, y: (here.y0 + here.y1) / 2 } });
        placed[i] = r;
        return;
      }
    }
  });
  return out;
}
