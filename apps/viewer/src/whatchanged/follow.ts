/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An annotation follows its element when a new version moves it: a tag (`tagOf`) or a label (`labelOf`)
 * of an element that moved is carried by what the element's box moved in the label's own view, so it
 * stands beside the element where it is now, at the offset the person gave it. Its leader goes with it
 * (the label's own, and the outline it points to, `labelRef`).
 *
 * It is done once per place: the draft keeps where the element stood when it last followed (`followedAt`,
 * drawing units), and the next run moves it only from there. Running the comparison again, or comparing a
 * later version with the reference that was never accepted, therefore does not carry it twice. Pure.
 */

import type { DraftEntity, Pt } from '@/drafting/types';
import { refToRing, ringToRef } from '@/labels/label-leader';
import type { ModelChange } from './compare';
import { drawingRect, type ViewBand } from './visibility';

const FOLLOWED = 'followedAt';
const centre = (r: { x0: number; y0: number; x1: number; y1: number }): Pt => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const EPS = 1e-9;

function parsePoint(v: unknown): Pt | null {
  if (typeof v !== 'string') return null;
  const [x, y] = v.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function shifted(d: DraftEntity, by: Pt): DraftEntity['shape'] {
  const move = (p: Pt): Pt => ({ x: p.x + by.x, y: p.y + by.y });
  const s = d.shape;
  if (s.type === 'text') return { ...s, p: move(s.p), ...(s.leader ? { leader: move(s.leader) } : {}) };
  if (s.type === 'leader') return { ...s, pts: s.pts.map(move) };
  return s;
}

/** `drafts` with the tags and labels of the elements that moved carried along; the same array when none is. */
export function followMovedElements(drafts: readonly DraftEntity[], changes: readonly ModelChange[], bandOf: (viewId: string) => ViewBand | undefined): readonly DraftEntity[] {
  const moved = new Map(changes.filter((c) => c.before && c.after && c.kinds.includes('moved') && !c.kinds.includes('removed')).map((c) => [c.guid, c]));
  if (moved.size === 0) return drafts;
  let any = false;
  const next = drafts.map((d) => {
    const guid = [d.params.labelOf, d.params.tagOf].find((g): g is string => typeof g === 'string');
    const change = guid ? moved.get(guid) : undefined;
    const plane = bandOf(d.viewId)?.plane;
    if (!change?.before || !change.after || !plane) return d;
    const to = centre(drawingRect(change.after, plane));
    const from = parsePoint(d.params[FOLLOWED]) ?? centre(drawingRect(change.before, plane));
    const by = { x: to.x - from.x, y: to.y - from.y };
    if (Math.abs(by.x) < EPS && Math.abs(by.y) < EPS) return d;
    any = true;
    const ring = refToRing(d.params.labelRef);
    const params = { ...d.params, [FOLLOWED]: `${to.x},${to.y}`, ...(ring ? { labelRef: ringToRef(ring.map((p) => ({ x: p.x + by.x, y: p.y + by.y }))) } : {}) };
    return { ...d, shape: shifted(d, by), params };
  });
  return any ? next : drafts;
}
