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
import { figureUp, layoutFacade } from '@/drafting/figure-layout';
import { styledParams } from '@/project/drafting-standards';
import { avoidBoxes, frameOf, symbolPieces, type SymbolPiece } from './avoid';
import type { DimensionPlan, PlannedString } from './types';

export interface DimensionTarget {
  viewId: string;
  layerId: string;
  textHeight: number;
  textStyle: string;
  dimStyle: string;
  /** The GlobalId of a plan part (a door or window), to stamp on the dimension that measures it. */
  guidOf?: (partId: number) => string | null;
}

/** The stamp of one dimension of a string: the string's place and where it starts and ends, to the centimetre. */
export function stampOf(s: PlannedString, a: Pt, b: Pt): string {
  const cm = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  return `${s.key}|${cm(a)}|${cm(b)}`;
}

export const isDimAll = (d: DraftEntity): boolean => typeof d.params.dimAll === 'string';

type DimShape = Extract<AnnotationShape, { type: 'dimension' }>;

type Fig = { lift: number; du: number };

/** The facade a string belongs to: every string of a facade shares what follows the kind in its key. */
const facadeOf = (s: PlannedString) => s.key.slice(s.key.indexOf(':') + 1);

/**
 * The dimensions of every string, one per span, each with its figure placed (`drafting/figure-layout.ts`):
 * the strings of a facade are laid out together, so a figure keeps clear of the lines of all of them.
 */
function stringShapes(plan: DimensionPlan, height: number, avoid: readonly SymbolPiece[]): Map<PlannedString, DimShape[]> {
  const out = new Map<PlannedString, DimShape[]>();
  const groups = new Map<string, PlannedString[]>();
  for (const s of plan.strings) groups.set(facadeOf(s), [...(groups.get(facadeOf(s)) ?? []), s]);
  for (const group of groups.values()) {
    group.sort((x, y) => x.offset - y.offset);
    const frame = frameOf(group[0]);
    // A plan draws with screen = drawing axes; extension lines run 1.5 mm past the line, 0.6 of a 2.5 mm text.
    const up = figureUp(group[0].along, -1, 1);
    const spans = group.map((s) => s.points.slice(1).map((b, i): DimShape => {
      const a = s.points[i];
      const mid = { x: (a.x + b.x) / 2 + s.outward.x * s.offset, y: (a.y + b.y) / 2 + s.outward.y * s.offset };
      return { type: 'dimension', variant: 'aligned', a, b, at: mid, height };
    }));
    const u = (p: Pt) => p.x * frame.along.x + p.y * frame.along.y;
    const places = layoutFacade(
      group.map((s, i) => ({ points: s.points.map(u), offset: s.offset, widths: spans[i].map((d) => textBlock(dimensionLayout(d).label, height).outer.x1) })),
      { height, sigma: up.x * frame.outward.x + up.y * frame.outward.y > 0 ? 1 : -1, over: height * 0.6, obstacles: avoidBoxes(avoid, frame, height) },
    );
    group.forEach((s, i) => out.set(s, spans[i].map((d, k): DimShape => {
      const p: Fig = places[i][k];
      if (p.lift === 0 && p.du === 0) return d;
      return { ...d, textAt: { x: d.at.x + frame.along.x * p.du + up.x * p.lift * height, y: d.at.y + frame.along.y * p.du + up.y * p.lift * height } };
    })));
  }
  return out;
}

/** The dimensions of `plan` that the view does not carry yet; figures keep clear of the section symbols among `viewDrafts` and of `drawn` (what the plan draws over its cut). */
export function dimensionDrafts(plan: DimensionPlan, target: DimensionTarget, existing: readonly DraftEntity[], viewDrafts: readonly DraftEntity[] = [], drawn: readonly SymbolPiece[] = []): DraftEntity[] {
  const done = new Set(existing.flatMap((d) => (typeof d.params.dimAll === 'string' ? [d.params.dimAll] : [])));
  const out: DraftEntity[] = [];
  const shapes = stringShapes(plan, target.textHeight, [...symbolPieces(viewDrafts), ...drawn]);
  for (const s of plan.strings) {
    (shapes.get(s) ?? []).forEach((shape, k) => {
      const stamp = stampOf(s, shape.a, shape.b);
      const part = s.measures[k];
      const measures = part !== null && part !== undefined ? target.guidOf?.(part) : null;
      if (done.has(stamp)) return;
      done.add(stamp);
      const styled = styledParams(target.viewId, shape, { textStyle: target.textStyle, dimStyle: target.dimStyle });
      out.push(newDraft(target.viewId, target.layerId, shape, { ...styled, dimAll: stamp, ...(measures ? { measures } : {}) }));
    });
  }
  return out;
}
