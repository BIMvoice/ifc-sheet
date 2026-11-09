/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The elevation marks round the ground plan: an arrowhead outside the building on each side that has an elevation on a sheet,
 * pointing at it, and the target "n / sheet" beyond it. Made fresh from the project every time a sheet is drawn and never
 * stored. Pure. The app's sheet and the engine's (`sheetGraphic`, so the PDF, the DXF and `ifcsheet build`) both place the marks here (#619).
 */

import type { MarkStyle } from '../graphic-standard.js';
import type { DimAllMeasure } from '../dimall/measure.js';
import { textBoxIn } from '../dimall/measure.js';
import type { AnnotationShape, DraftEntity, DraftShape, Pt } from '../draft-types.js';
import type { ElevationDirection, ProjectSheet, ProjectView } from '../document.js';
import { groundPlan } from '../ground-plan.js';
import { anchorFor, boxesOverlap, boxOfPoints, halfAlong, type CrossRefBox } from './boxes.js';
import { referenceLabel, viewReference } from './reference.js';
import { XREF } from './section-marks.js';

/** Paper millimetres: the elevation mark's text height, its arrow, and the gap to the building. */
export const ELEVATION_TEXT_MM = 2.5;
const ARROW_MM = 3.5;
const GAP_MM = 1;
/** Paper millimetres between an arrow's base and its label: text prints a little above its box, so a smaller gap lets the arrow strike the label on a south facade. */
const LABEL_GAP_MM = 2.5;
/** Paper millimetres of padding between a flag-headed elevation mark's border and its label. */
const FLAG_PAD_MM = 1;

/** An elevation the ground plan carries a mark for: every one but a detail. */
export const markedElevation = (v: ProjectView): v is Extract<ProjectView, { kind: 'elevation' }> => v.kind === 'elevation' && !v.detail;

/** The plan that carries the elevation marks: the ground plan (`groundPlan`) among the views that are not a detail. */
export function elevationMarkPlan(views: readonly ProjectView[]): ProjectView | null {
  return groundPlan(views.filter((v) => !v.detail));
}

/** The elevation direction → the side of the plan it is on, and the way its arrow points (drawing coordinates: a plan's y runs down the screen, north is up). */
const SIDES: Record<ElevationDirection, { out: Pt }> = {
  north: { out: { x: 0, y: -1 } },
  south: { out: { x: 0, y: 1 } },
  east: { out: { x: 1, y: 0 } },
  west: { out: { x: -1, y: 0 } },
};

/** Clear space kept round an elevation mark, paper millimetres. */
export const MARK_MARGIN_MM = 3;
/** How many margins further out a mark may stand when no place along its side is clear. */
const LIFT_STEPS = 6;

export interface ElevationMarkInput {
  /** How a text is measured and which way the plan's screen runs (`DimAllMeasure`). */
  measure: DimAllMeasure;
  planViewId: string;
  layerId: string;
  views: readonly ProjectView[];
  sheets: readonly Pick<ProjectSheet, 'number' | 'viewports'>[];
  /** The plan's drawing extent, drawing metres. */
  bounds: { min: Pt; max: Pt };
  /** Model metres per paper millimetre in the viewport that shows the plan (its scale over 1000). */
  paperUnit: number;
  /** The viewport's scale over the plan's own: annotation text is multiplied by it when drawn. */
  factor: number;
  /** What is already on the plan (`obstacleBoxes`): a mark slides along its side until it is clear of these. */
  obstacles?: readonly CrossRefBox[];
  /** How the mark is headed (the project's graphic standard); absent: the arrow. */
  markStyle?: MarkStyle;
}

/**
 * An elevation mark on each side of the building that has an elevation on a
 * sheet: an arrowhead outside the extent pointing at the building, and the
 * target "n / sheet" beyond it (turned along the facade on east and west, where
 * there is no room beside it). North is the top of the plan. A mark starts at
 * the middle of its side and, when its box meets an obstacle or a mark placed
 * before it, slides along the side to the nearest place that is clear.
 */
export function elevationMarkDrafts(input: ElevationMarkInput): DraftEntity[] {
  const { planViewId, layerId, views, sheets, bounds, paperUnit, factor, measure } = input;
  const viewIds = new Set(views.map((v) => v.id));
  const mid = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 };
  const textH = ELEVATION_TEXT_MM * paperUnit;
  const margin = MARK_MARGIN_MM * paperUnit;
  const taken: CrossRefBox[] = [...(input.obstacles ?? [])];
  const out: DraftEntity[] = [];
  const style = input.markStyle ?? 'arrow';
  for (const view of views) {
    if (!markedElevation(view)) continue;
    const ref = viewReference(view.id, viewIds, sheets);
    if (!ref) continue;
    const { out: o } = SIDES[view.direction];
    const horizontal = o.y !== 0; // north / south: the side runs along x
    const edge = o.x !== 0 ? (o.x > 0 ? bounds.max.x : bounds.min.x) : o.y > 0 ? bounds.max.y : bounds.min.y;
    // Along the outward axis: the arrow's tip, its base, then the label's middle. Across it: the middle of the facade, plus `shift`.
    const half = (ARROW_MM / 2) * paperUnit;
    const label = referenceLabel(ref);
    // Bottom to top, the way a plan draws it: a quarter turn the other way is folded about its anchor by `readableDeg`, so it prints a label length from its box (#245).
    const rotation = o.x !== 0 ? -Math.PI / 2 : 0;
    const labelBox = textBoxIn(measure, { x: 0, y: 0 }, label, textH, rotation);
    const at = (along: number, across: number): Pt => (o.x !== 0 ? { x: along, y: across } : { x: across, y: along });
    const centre = horizontal ? mid.x : mid.y;
    // `lift` moves the whole mark further out from the building, drawing metres.
    const build = (shift: number, lift: number): { drafts: DraftEntity[]; box: CrossRefBox } => {
      const sign = o.x + o.y;
      const tip = edge + sign * (GAP_MM * paperUnit + lift);
      const base = tip + sign * ARROW_MM * paperUnit;
      const c = centre + shift;
      // The head: the shapes that point at the building, the points they occupy, and where the label's middle goes along the outward axis.
      const head = ((): { shapes: (DraftShape | AnnotationShape)[]; pts: Pt[]; labelMid: number } => {
        if (style === 'circle') {
          // A filled triangle pointing at the building, and a circle behind it; the label stands beyond the circle.
          const r = (ARROW_MM / 2) * paperUnit;
          const centreAt = at(base + sign * r, c);
          const triangle = [at(tip, c), at(base, c - half), at(base, c + half)];
          return {
            shapes: [{ type: 'hatch', loops: [triangle], pattern: 'SOLID', scale: 1, angle: 0 }, { type: 'circle', c: centreAt, r }],
            pts: [...triangle, { x: centreAt.x - r, y: centreAt.y - r }, { x: centreAt.x + r, y: centreAt.y + r }],
            labelMid: base + sign * (2 * r + LABEL_GAP_MM * paperUnit + halfAlong(labelBox, o)),
          };
        }
        if (style === 'flag') {
          // A flag whose point is at the building and whose body holds the label.
          const pad = FLAG_PAD_MM * paperUnit;
          const depth = 2 * halfAlong(labelBox, o) + 2 * pad;
          const across = { x: Math.abs(o.y), y: Math.abs(o.x) };
          const w = Math.max(half, halfAlong(labelBox, across) + pad);
          const pts = [at(tip, c), at(base, c - w), at(base + sign * depth, c - w), at(base + sign * depth, c + w), at(base, c + w)];
          return { shapes: [{ type: 'polyline', pts, closed: true }], pts, labelMid: base + sign * (depth / 2) };
        }
        const lines: [Pt, Pt][] = [[at(tip, c), at(base, c - half)], [at(tip, c), at(base, c + half)], [at(base, c - half), at(base, c + half)]];
        return { shapes: lines.map(([a, b]): DraftShape => ({ type: 'line', a, b })), pts: lines.flat(), labelMid: base + sign * (LABEL_GAP_MM * paperUnit + halfAlong(labelBox, o)) };
      })();
      const p = anchorFor(measure, at(head.labelMid, c), label, textH, rotation);
      const id = `${planViewId}:elevation:${view.id}${XREF}`;
      const drafts: DraftEntity[] = head.shapes.map((shape, i) => ({ id: `${id}:${i}`, viewId: planViewId, layerId, shape, params: {} }));
      drafts.push({ id: `${id}:label`, viewId: planViewId, layerId, shape: { type: 'text', p, text: label, height: textH / factor, rotation }, params: {} });
      const box = boxOfPoints([...head.pts, ...textBoxIn(measure, p, label, textH, rotation)]);
      return { drafts, box };
    };
    // The nearest place along the side that is clear; if the whole side is taken, one step further out, up to LIFT_STEPS times.
    const nearestClear = (lift: number): { shift: number; placed: { drafts: DraftEntity[]; box: CrossRefBox } } | null => {
      const start = build(0, lift);
      const lo = horizontal ? start.box.x0 : start.box.y0;
      const hi = horizontal ? start.box.x1 : start.box.y1;
      // A mark slides along its own facade, not past the building's corners.
      const sideLo = horizontal ? bounds.min.x : bounds.min.y;
      const sideHi = horizontal ? bounds.max.x : bounds.max.y;
      const clear = (shift: number): boolean => {
        if (shift !== 0 && (lo + shift < sideLo || hi + shift > sideHi)) return false;
        const b = horizontal ? { ...start.box, x0: start.box.x0 + shift, x1: start.box.x1 + shift } : { ...start.box, y0: start.box.y0 + shift, y1: start.box.y1 + shift };
        return taken.every((t) => !boxesOverlap(b, t, margin));
      };
      // Just past one of their edges, either side.
      const candidates = taken.flatMap((t) => (horizontal ? [t.x0 - margin - hi, t.x1 + margin - lo] : [t.y0 - margin - hi, t.y1 + margin - lo]));
      // Nearest first (a stable sort, so of two as near the earlier wins), then the first that is clear: testing every candidate against every box was quadratic in the obstacles (#154).
      const shift = [0, ...candidates].sort((a, b) => Math.abs(a) - Math.abs(b)).find(clear);
      return shift === undefined ? null : { shift, placed: shift === 0 ? start : build(shift, lift) };
    };
    let found: ReturnType<typeof nearestClear> = null;
    for (let step = 0; step <= LIFT_STEPS && !found; step++) found = nearestClear(step * margin);
    const placed = found?.placed ?? build(0, 0);
    taken.push(placed.box);
    out.push(...placed.drafts);
  }
  return out;
}
