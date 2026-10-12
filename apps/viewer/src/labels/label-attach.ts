/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A label stays attached to its element: it keeps the element's outline
 * (`params.labelRef`) and, by the label type's leader option, carries a
 * leader to that outline or not. Placing a label and dragging one by hand
 * both end here, so the rule is the same.
 */

import { textBox } from '@/drafting/annotation';
import type { AnnotationShape, DraftEntity, Pt } from '@/drafting/types';
import type { Rect } from './label-geometry';
import { DEFAULT_LEADER, DISPLACED_MM, leaderTip, refToRing, type LeaderMode } from './label-leader';

type TextShape = Extract<AnnotationShape, { type: 'text' }>;

/** The box a text and its frame fill, drawing coordinates. */
export function textRect(shape: TextShape): Rect {
  const pts = textBox(shape.p, shape.text, shape.height, shape.rotation, shape.frame);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** `shape` with the leader the mode gives it to the element outline `ring`; `paperUnit` is drawing units per paper millimetre. */
export function withLeader(shape: TextShape, ring: readonly Pt[] | null, mode: LeaderMode | undefined, paperUnit: number): TextShape {
  const { leader: _old, ...rest } = shape;
  const tip = ring ? leaderTip(mode ?? DEFAULT_LEADER, textRect(shape), ring, DISPLACED_MM * paperUnit) : undefined;
  return tip ? { ...rest, leader: tip } : rest;
}

const same = (a: Pt | undefined, b: Pt | undefined): boolean => (a === undefined ? b === undefined : b !== undefined && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);

/** The label `d` with its leader brought in line with where it is; the same entity when nothing changes. */
export function settleLeader(d: DraftEntity, mode: LeaderMode | undefined, paperUnit: number): DraftEntity {
  if (d.shape.type !== 'text') return d;
  const next = withLeader(d.shape, refToRing(d.params.labelRef), mode, paperUnit);
  return same(next.leader, d.shape.leader) ? d : { ...d, shape: next };
}
