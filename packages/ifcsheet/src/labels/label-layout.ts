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

import type { Pt } from '../draft-types.js';
import { candidateCentres, orientedBox } from './label-candidates.js';
import { RectIndex } from './rect-index.js';
import { growRect, rectAround, rectHitsRing, ringBounds, unionRect, type Rect } from './label-geometry.js';
import type { ViewElement } from './view-elements.js';

/** Clear space between a label and its element, paper millimetres. */
export const LABEL_GAP_MM = 1.5;
/** Labels, and labels and annotations, keep at least this far apart, paper millimetres. */
export const LABEL_CLEAR_MM = 0.75;
/** The largest gap a label type may ask for, paper millimetres (#842). */
export const LABEL_GAP_MAX_MM = 20;

/** A label type's stored gap (#842): a number of paper millimetres from 0 to `LABEL_GAP_MAX_MM`, else none. */
export const asLabelGap = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= LABEL_GAP_MAX_MM ? v : undefined);

/**
 * The clear space a label type's labels keep, paper millimetres (#842). Without a gap of its own (or with the standard
 * one) a label stands `LABEL_GAP_MM` from its element and `LABEL_CLEAR_MM` from the other labels, the annotations and
 * the other elements, as it always has; with one it keeps that gap from all of them.
 */
export function labelSpacing(gap?: number): { gap: number; clear: number } {
  return gap === undefined || gap === LABEL_GAP_MM ? { gap: LABEL_GAP_MM, clear: LABEL_CLEAR_MM } : { gap, clear: gap };
}

export interface LayoutElement {
  id: string;
  ring: readonly Pt[];
  /** Every cut piece of the element, `ring` itself (the same array) among them (`ViewElement.pieces`): a label keeps off each one. Absent: `ring` alone. */
  pieces?: readonly (readonly Pt[])[];
}

/** A view's element as a label keeps clear of it: its outline and every cut piece of it. */
export const layoutElementOf = (e: ViewElement): LayoutElement => ({ id: String(e.renderId), ring: e.ring, ...(e.pieces ? { pieces: e.pieces } : {}) });

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
  /** Boxes of annotations already on the view: a list, or a grid (`rect-index.ts`) the caller keeps for a view with many; the labels placed are added to a grid. */
  annotations: readonly Rect[] | RectIndex;
  /** Drawing units per paper millimetre. */
  paperUnit: number;
  /** The label type's gap, paper millimetres (`LabelSpec.gap`, #842); absent: the standard spacing (`labelSpacing`). */
  gapMm?: number;
}

export interface Placed {
  centre: Pt;
  /** False when every place was taken and this is the least bad. */
  free: boolean;
}

/** The elements whose bounds cover more than this share of the view's are a backdrop (a floor slab): a label may lie over them. */
const BACKDROP_SHARE = 0.3;

/** One outline a label keeps clear of: an element's outline (`piece` false) or another of its cut pieces (`piece` true). */
export interface SolidPiece {
  id: string;
  ring: readonly Pt[];
  b: Rect;
  piece: boolean;
}

/**
 * What a label keeps clear of among a view's elements: every cut piece of each (`LayoutElement.pieces`), its outline among them,
 * leaving out a backdrop (an element whose bounds cover more than `BACKDROP_SHARE` of all of theirs: a floor slab seen below the
 * cut), which a label may lie over. Door and window marks (`layoutLabels`) and room tags (`tagall/plan.ts`) both read it.
 */
export function solidPieces(elements: readonly LayoutElement[]): SolidPiece[] {
  const bounds = elements.map((e) => ({ e, b: ringBounds(e.ring) }));
  const all = unionRect(bounds.map((x) => x.b));
  const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
  return bounds.filter((x) => !all || area(x.b) <= BACKDROP_SHARE * area(all))
    .flatMap(({ e }) => (e.pieces ?? [e.ring]).map((ring) => ({ id: e.id, ring, b: ringBounds(ring), piece: ring !== e.ring })));
}

export function layoutLabels(items: readonly LayoutItem[], scene: LayoutScene): Map<string, Placed> {
  const spacing = labelSpacing(scene.gapMm);
  const gap = spacing.gap * scene.paperUnit, clear = spacing.clear * scene.paperUnit;
  const all = unionRect(scene.elements.map((e) => ringBounds(e.ring)));
  const away = (c: Pt): Pt => {
    if (!all) return { x: 0, y: 0 };
    const d = { x: c.x - (all.x0 + all.x1) / 2, y: c.y - (all.y0 + all.y1) / 2 };
    const l = Math.hypot(d.x, d.y);
    return l < 1e-9 ? { x: 0, y: 0 } : { x: d.x / l, y: d.y / l };
  };
  // An element's outline is kept its clear space from; its other cut pieces (a wall its openings cut in four, a window's frame beside its glass) are
  // kept off: a label never lies over one. Measured on FZK at a 6 mm gap: two window marks sat on the wall piece beside their window, the biggest
  // piece being the only one looked at. Off, not the clear space from them, so a label that already lay clear of the cut stays where it was.
  const solid = solidPieces(scene.elements);
  // What a place is tested against sits on a grid as coarse as the biggest label: a place meets the few boxes near it, not all of them.
  const cell = Math.max(1e-6, ...items.map((i) => Math.max(i.w, i.h)));
  const taken = scene.annotations instanceof RectIndex ? scene.annotations : new RectIndex(cell);
  if (!(scene.annotations instanceof RectIndex)) for (const a of scene.annotations) taken.add(a);
  const solidIndex = new RectIndex<(typeof solid)[number]>(cell);
  for (const o of solid) solidIndex.add(o.b, o);
  const out = new Map<string, Placed>();
  for (const item of items) {
    const box = orientedBox(item.ring);
    const centres = [...(item.preferred ?? []), ...candidateCentres({ box, w: item.w, h: item.h, gap, away: away(box.c) }), ...(item.fallback ?? [])];
    // How many things the place comes nearer than the clear space, and whether the label would lie over a cut piece (`over`).
    const hits = (c: Pt): { n: number; over: boolean } => {
      const bare = rectAround(c, item.w, item.h);
      const r = growRect(bare, clear);
      let n = taken.count(r), over = false;
      solidIndex.query(r, (_, o) => {
        // A piece, its own element's included: kept off. Its own outline: the label stands its gap from it already.
        if (o.piece) {
          if (rectHitsRing(bare, o.ring)) { n++; over = true; }
        } else if (o.id !== item.id && rectHitsRing(r, o.ring)) n++;
      });
      return { n, over };
    };
    let pick: Placed | null = null;
    // With no free place, the least bad: one off every cut piece before one over it, then the fewest things too near.
    let least = { c: centres[0] ?? box.c, over: true, n: Infinity };
    for (const c of centres) {
      const { n, over } = hits(c);
      if (n === 0) { pick = { centre: c, free: true }; break; }
      if ((least.over && !over) || (least.over === over && n < least.n)) least = { c, over, n };
    }
    const placed = pick ?? { centre: least.c, free: false };
    out.set(item.id, placed);
    taken.add(growRect(rectAround(placed.centre, item.w, item.h), 0));
  }
  return out;
}
