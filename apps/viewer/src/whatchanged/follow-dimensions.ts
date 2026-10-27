/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A dimension follows the model when a new version changes the elements it was snapped to (#459): each end that holds an anchor
 * (`drafting/dimension-anchor.ts`) goes to where that corner or edge of its element is now, so the figure the dimension reads is
 * measured on the new version, and the dimension line keeps its offset from what it measures. A dimension typed over by hand
 * (`text`) keeps its words. An end the person has moved since it was anchored is let go (its anchor is dropped): it is theirs now.
 * An element that is gone leaves the dimension where it was; WHAT IS MISSING lists it (`check/findings.ts`).
 *
 * It is done once per place, as for tags (`follow.ts`): the anchor keeps the element's box as it last followed, and the next run
 * moves only from there. A dimension with no anchor, a free one, is returned as it is. Pure.
 */

import { anchorsOf, encodeAnchor, shiftOf, type AnchorParam } from '@/drafting/dimension-anchor';
import type { DraftEntity, Pt } from '@/drafting/types';
import type { ModelChange } from './compare';
import { drawingRect, type ViewBand } from './visibility';

/** A point the person has not moved is where the anchor left it, within this, drawing units. */
const SAME = 1e-4;
const EPS = 1e-9;
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const plus = (p: Pt, by: Pt): Pt => ({ x: p.x + by.x, y: p.y + by.y });

/** The dimension line's place after its ends moved: an aligned one keeps its signed distance from the measured line, any other moves with its ends. */
function movedLine(d: Extract<DraftEntity['shape'], { type: 'dimension' }>, a: Pt, b: Pt): Pt {
  const along = { x: d.b.x - d.a.x, y: d.b.y - d.a.y };
  const length = Math.hypot(along.x, along.y);
  const now = { x: b.x - a.x, y: b.y - a.y };
  const lengthNow = Math.hypot(now.x, now.y);
  if (d.variant === 'aligned' && length > EPS && lengthNow > EPS) {
    const offset = ((d.at.x - mid(d.a, d.b).x) * -along.y + (d.at.y - mid(d.a, d.b).y) * along.x) / length;
    const m = mid(a, b);
    return { x: m.x + (-now.y / lengthNow) * offset, y: m.y + (now.x / lengthNow) * offset };
  }
  const m0 = mid(d.a, d.b);
  const m1 = mid(a, b);
  return plus(d.at, { x: m1.x - m0.x, y: m1.y - m0.y });
}

/** `drafts` with the dimensions anchored to elements that changed carried to the new version; the same array when none is. */
export function followDimensions(drafts: readonly DraftEntity[], changes: readonly ModelChange[], bandOf: (viewId: string) => ViewBand | undefined): readonly DraftEntity[] {
  const byGuid = new Map(changes.filter((c) => c.before && c.after && !c.kinds.includes('removed')).map((c) => [c.guid, c]));
  let any = false;
  const next = drafts.map((d) => {
    const shape = d.shape;
    const plane = bandOf(d.viewId)?.plane;
    if (shape.type !== 'dimension' || !plane) return d;
    const anchored = anchorsOf(d);
    if (anchored.length === 0) return d;
    const end: Record<AnchorParam, Pt> = { anchorA: shape.a, anchorB: shape.b };
    const params: Record<string, string | number | boolean> = { ...d.params };
    let changed = false;
    for (const { param, anchor } of anchored) {
      const change = byGuid.get(anchor.g);
      if (!change?.before || !change.after) continue;
      const here = end[param];
      if (Math.hypot(here.x - anchor.p[0], here.y - anchor.p[1]) > SAME) {
        delete params[param];
        changed = true;
        continue;
      }
      const after = drawingRect(change.after, plane);
      const before = anchor.r ? { x0: anchor.r[0], y0: anchor.r[1], x1: anchor.r[2], y1: anchor.r[3] } : drawingRect(change.before, plane);
      const by = shiftOf(anchor, before, after);
      if (anchor.r && Math.abs(by.x) < EPS && Math.abs(by.y) < EPS) continue;
      end[param] = plus(here, by);
      params[param] = encodeAnchor({ ...anchor, p: [end[param].x, end[param].y], r: [after.x0, after.y0, after.x1, after.y1] });
      changed = true;
    }
    if (!changed) return d;
    any = true;
    const a = end.anchorA, b = end.anchorB;
    const textAt = shape.textAt ? plus(shape.textAt, { x: (a.x - shape.a.x + b.x - shape.b.x) / 2, y: (a.y - shape.a.y + b.y - shape.b.y) / 2 }) : undefined;
    return { ...d, shape: { ...shape, a, b, at: movedLine(shape, a, b), ...(textAt ? { textAt } : {}) }, params };
  });
  return any ? next : drafts;
}
