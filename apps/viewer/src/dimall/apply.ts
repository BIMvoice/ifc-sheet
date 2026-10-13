/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Turning a dimension plan into ordinary dimensions on the view: each string
 * becomes a chain of aligned dimensions on one line, each stamped
 * (`params.dimAll`) with its place so a second run adds only what is missing,
 * and the "what is missing" check can tell the view has been dimensioned.
 */

import { dimensionLayout } from '@/drafting/annotation';
import { newDraft } from '@/drafting/draft-store';
import type { AnnotationShape, DraftEntity, Pt } from '@/drafting/types';
import { textBlock } from '@/drafting/text-block';
import { readableDeg } from '@/drafting/styles';
import { styledParams } from '@/project/drafting-standards';
import type { DimensionPlan, PlannedString } from './types';

export interface DimensionTarget {
  viewId: string;
  layerId: string;
  textHeight: number;
  textStyle: string;
  dimStyle: string;
}

/** The stamp of one dimension of a string: the string's place and where it starts and ends, to the centimetre. */
export function stampOf(s: PlannedString, a: Pt, b: Pt): string {
  const cm = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  return `${s.key}|${cm(a)}|${cm(b)}`;
}

export const isDimAll = (d: DraftEntity): boolean => typeof d.params.dimAll === 'string';

type DimShape = Extract<AnnotationShape, { type: 'dimension' }>;

/** How far across the line a figure moves, in text heights, per place: on the line, above it, below it. */
const LIFTS = [0, 1.3, -1.5];

/**
 * The side of a dimension line its figures sit on is the screen-up (horizontal line) or screen-left
 * (vertical line) one, whichever way the line was drawn. Plans draw with screen = drawing axes.
 */
function textUp(along: Pt): Pt {
  const turn = readableDeg((Math.atan2(along.y, along.x) * 180) / Math.PI);
  const phi = (turn * Math.PI) / 180;
  return { x: Math.sin(phi), y: -Math.cos(phi) };
}

/**
 * Where each span's figure goes: on the line when it fits in its span, otherwise lifted beside the
 * line (first up, then down) to the first place where it does not run into another figure there.
 * Returns the lift per span in multiples of the text height (0: on the line).
 */
export function figureLifts(spans: readonly { start: number; end: number; width: number }[], height: number): number[] {
  const placed: { from: number; to: number }[][] = LIFTS.map(() => []);
  const pad = height * 0.3;
  return spans.map((sp) => {
    const mid = (sp.start + sp.end) / 2;
    const from = mid - sp.width / 2 - pad, to = mid + sp.width / 2 + pad;
    const free = (level: number) => !placed[level].some((q) => from < q.to && q.from < to);
    const fits = sp.width * 1.15 <= sp.end - sp.start;
    const level = LIFTS.findIndex((_, i) => (i > 0 || fits) && free(i));
    const at = level < 0 ? 1 : level;
    placed[at].push({ from, to });
    return LIFTS[at];
  });
}

/** The dimensions of a string, one per span, each with its figure placed. */
function stringShapes(s: PlannedString, height: number): DimShape[] {
  const up = textUp(s.along);
  const base = s.points.slice(1).map((b, i): DimShape => {
    const a = s.points[i];
    const mid = { x: (a.x + b.x) / 2 + s.outward.x * s.offset, y: (a.y + b.y) / 2 + s.outward.y * s.offset };
    return { type: 'dimension', variant: 'aligned', a, b, at: mid, height };
  });
  const origin = s.points[0];
  const pos = (p: Pt) => (p.x - origin.x) * s.along.x + (p.y - origin.y) * s.along.y;
  const spans = base.map((d) => ({ start: Math.min(pos(d.a), pos(d.b)), end: Math.max(pos(d.a), pos(d.b)), width: ((r) => r.x1 - r.x0)(textBlock(dimensionLayout(d).label, height).outer) }));
  const lifts = figureLifts(spans, height);
  return base.map((d, i) => (lifts[i] === 0 ? d : { ...d, textAt: { x: d.at.x + up.x * lifts[i] * height, y: d.at.y + up.y * lifts[i] * height } }));
}

/** The dimensions of `plan` that the view does not carry yet. */
export function dimensionDrafts(plan: DimensionPlan, target: DimensionTarget, existing: readonly DraftEntity[]): DraftEntity[] {
  const done = new Set(existing.flatMap((d) => (typeof d.params.dimAll === 'string' ? [d.params.dimAll] : [])));
  const out: DraftEntity[] = [];
  for (const s of plan.strings) {
    stringShapes(s, target.textHeight).forEach((shape) => {
      const stamp = stampOf(s, shape.a, shape.b);
      if (done.has(stamp)) return;
      done.add(stamp);
      const styled = styledParams(target.viewId, shape, { textStyle: target.textStyle, dimStyle: target.dimStyle });
      out.push(newDraft(target.viewId, target.layerId, shape, { ...styled, dimAll: stamp }));
    });
  }
  return out;
}
