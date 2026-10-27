/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A dimension point that was snapped to a model element stays on that element's edge when a new version of the model changes the
 * element (#459). The anchor names the element (its GlobalId) and says WHERE on the element's box in the view the point sits,
 * one reference per drawing axis: on the lower side (`min`), on the upper side (`max`) or in the middle (`mid`). That is the edge
 * as the element's geometry gives it, not as a mesh does: it does not change when the element is tessellated differently, and a
 * wall lengthened at one end keeps the dimension on that end's corner while the other end's stays put.
 *
 * Only a point that is on the box of an element, on at least one axis at a side and on the other at a side or the middle, is
 * anchored. A point inside an element, or one on the extreme vertex of a turned element (on its box in one axis only, at no
 * particular place on the other), is not: it stays where it was drawn, as a point drawn freely does. The anchor rides on the
 * dimension as two params (`anchorA`, `anchorB`: the end each describes), each one text so a project file keeps it as it is.
 * `p` is where the point was when the anchor last followed, so a point the person has moved since is let go instead of dragged back;
 * `r` is the element's box in the view when it last followed, so following twice is not following twice. Pure.
 */

import type { Rect } from '@/labels/label-geometry';
import type { DraftEntity, Pt } from './types';

export type Side = 'min' | 'max' | 'mid';
export interface DimensionAnchor {
  /** GlobalId of the element. */
  g: string;
  /** Where on the element's box the point sits along each drawing axis, with its distance from that side (metres, 0 on the side itself). */
  x: readonly [Side, number];
  y: readonly [Side, number];
  /** Where the point is (drawing units) as the anchor last followed. */
  p: readonly [number, number];
  /** The element's box in the view (x0, y0, x1, y1) as it last followed; absent until it has. */
  r?: readonly [number, number, number, number];
}

/** An element a point can be anchored to: its GlobalId and its box in the view's drawing. */
export interface ElementBox { guid: string; rect: Rect }

export const ANCHOR_PARAMS = ['anchorA', 'anchorB'] as const;
export type AnchorParam = (typeof ANCHOR_PARAMS)[number];

/** How near a side a point must be to sit on it, metres. */
const ON_SIDE = 0.005;
/** The middle of an edge, as a fraction of it. */
const MID_TOLERANCE = 0.01;

function axisOf(v: number, lo: number, hi: number): readonly [Side, number] | null {
  if (Math.abs(v - lo) <= ON_SIDE) return ['min', v - lo];
  if (Math.abs(v - hi) <= ON_SIDE) return ['max', v - hi];
  const span = hi - lo;
  return span > 0 && Math.abs((v - lo) / span - 0.5) <= MID_TOLERANCE ? ['mid', v - (lo + hi) / 2] : null;
}

/** The anchor of `p` on `element`, or null where `p` is not on the element's edge (see the module note). */
export function anchorOf(p: Pt, element: ElementBox): DimensionAnchor | null {
  const { rect } = element;
  const x = axisOf(p.x, rect.x0, rect.x1);
  const y = axisOf(p.y, rect.y0, rect.y1);
  if (!x || !y || (x[0] === 'mid' && y[0] === 'mid')) return null;
  return { g: element.guid, x, y, p: [p.x, p.y] };
}

const place = ([side, d]: readonly [Side, number], lo: number, hi: number): number => (side === 'min' ? lo : side === 'max' ? hi : (lo + hi) / 2) + d;

/** How far the anchored point moves when the element's box goes from `before` to `after`. */
export function shiftOf(anchor: DimensionAnchor, before: Rect, after: Rect): Pt {
  return {
    x: place(anchor.x, after.x0, after.x1) - place(anchor.x, before.x0, before.x1),
    y: place(anchor.y, after.y0, after.y1) - place(anchor.y, before.y0, before.y1),
  };
}

export function encodeAnchor(anchor: DimensionAnchor): string {
  return JSON.stringify(anchor);
}

const isAxis = (v: unknown): v is readonly [Side, number] => Array.isArray(v) && v.length === 2 && (v[0] === 'min' || v[0] === 'max' || v[0] === 'mid') && Number.isFinite(v[1]);
const isNumbers = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(x));

/** The anchor a param holds; null for anything that is not one (a project file from another version, or edited by hand). */
export function decodeAnchor(value: unknown): DimensionAnchor | null {
  if (typeof value !== 'string') return null;
  try {
    const a = JSON.parse(value) as Partial<DimensionAnchor>;
    if (typeof a.g !== 'string' || !a.g || !isAxis(a.x) || !isAxis(a.y) || !isNumbers(a.p, 2)) return null;
    return { g: a.g, x: a.x, y: a.y, p: [a.p[0], a.p[1]], ...(isNumbers(a.r, 4) ? { r: [a.r[0], a.r[1], a.r[2], a.r[3]] as const } : {}) };
  } catch {
    return null;
  }
}

/** The anchors a dimension carries, by the end each belongs to. */
export function anchorsOf(d: DraftEntity): { param: AnchorParam; anchor: DimensionAnchor }[] {
  if (d.shape.type !== 'dimension') return [];
  return ANCHOR_PARAMS.flatMap((param) => {
    const anchor = decodeAnchor(d.params[param]);
    return anchor ? [{ param, anchor }] : [];
  });
}
