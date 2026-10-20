/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Placing a run of labels: each takes the first free place among those its
 * element offers (`label-candidates.ts`), where free means clear of the
 * labels already placed, of the boxes of existing annotations and of the
 * outlines of the view's elements. Labels go in the order given, so the
 * same view gives the same result.
 */

import type { Pt } from '@/drafting/types';
import { candidateCentres, orientedBox } from './label-candidates';
import { growRect, rectAround, rectHitsRing, rectsOverlap, ringBounds, type Rect } from './label-geometry';

/** Clear space between a label and its element, paper millimetres. */
export const LABEL_GAP_MM = 1.5;
/** Labels, and labels and annotations, keep at least this far apart, paper millimetres. */
export const LABEL_CLEAR_MM = 0.75;

export interface LayoutElement {
  id: string;
  ring: readonly Pt[];
}

export interface LayoutItem {
  id: string;
  ring: readonly Pt[];
  /** The label's outer size. */
  w: number;
  h: number;
  /** Places to try before the ones beside the element, in this order (a door tag clear of the door's swing). */
  preferred?: readonly Pt[];
  /** Places to try after all the others, in this order, before settling for the least bad. */
  fallback?: readonly Pt[];
}

export interface LayoutScene {
  /** Every element the view draws, the labelled ones included. */
  elements: readonly LayoutElement[];
  /** Boxes of annotations already on the view. */
  annotations: readonly Rect[];
  /** Drawing units per paper millimetre. */
  paperUnit: number;
}

export interface Placed {
  centre: Pt;
  /** False when every place was taken and this is the least bad. */
  free: boolean;
}

/** The elements whose bounds cover more than this share of the view's are a backdrop (a floor slab): a label may lie over them. */
const BACKDROP_SHARE = 0.3;

export function layoutLabels(items: readonly LayoutItem[], scene: LayoutScene): Map<string, Placed> {
  const gap = LABEL_GAP_MM * scene.paperUnit, clear = LABEL_CLEAR_MM * scene.paperUnit;
  const bounds = scene.elements.map((e) => ({ e, b: ringBounds(e.ring) }));
  const all = bounds.length ? { x0: Math.min(...bounds.map((x) => x.b.x0)), y0: Math.min(...bounds.map((x) => x.b.y0)), x1: Math.max(...bounds.map((x) => x.b.x1)), y1: Math.max(...bounds.map((x) => x.b.y1)) } : null;
  const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
  const away = (c: Pt): Pt => {
    if (!all) return { x: 0, y: 0 };
    const d = { x: c.x - (all.x0 + all.x1) / 2, y: c.y - (all.y0 + all.y1) / 2 };
    const l = Math.hypot(d.x, d.y);
    return l < 1e-9 ? { x: 0, y: 0 } : { x: d.x / l, y: d.y / l };
  };
  const solid = bounds.filter((x) => !all || area(x.b) <= BACKDROP_SHARE * area(all));
  const taken: Rect[] = [...scene.annotations];
  const out = new Map<string, Placed>();
  for (const item of items) {
    const box = orientedBox(item.ring);
    const centres = [...(item.preferred ?? []), ...candidateCentres({ box, w: item.w, h: item.h, gap, away: away(box.c) }), ...(item.fallback ?? [])];
    const hits = (c: Pt): number => {
      const r = growRect(rectAround(c, item.w, item.h), clear);
      let n = 0;
      for (const t of taken) if (rectsOverlap(r, t)) n++;
      for (const o of solid) if (o.e.id !== item.id && rectsOverlap(r, o.b) && rectHitsRing(r, o.e.ring)) n++;
      return n;
    };
    let pick: Placed | null = null;
    let least = { c: centres[0] ?? box.c, n: Infinity };
    for (const c of centres) {
      const n = hits(c);
      if (n === 0) { pick = { centre: c, free: true }; break; }
      if (n < least.n) least = { c, n };
    }
    const placed = pick ?? { centre: least.c, free: false };
    out.set(item.id, placed);
    taken.push(growRect(rectAround(placed.centre, item.w, item.h), 0));
  }
  return out;
}
