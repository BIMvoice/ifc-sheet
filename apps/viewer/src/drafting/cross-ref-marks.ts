/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The marks that name the drawing they point at, "1 / A-301": the reference
 * under a section symbol's letter, and the elevation marks round the ground
 * plan. Both are made fresh from the project every time a sheet is drawn and
 * are never stored, so the plan's own drafts are not touched when a drawing
 * moves to another sheet or is renumbered. A mark whose target is on no sheet
 * prints nothing more: a section keeps its letter, an elevation has no mark.
 * Pure.
 */

import type { MarkStyle } from '@bimvoice/ifcsheet';
import type { ElevationDirection, ProjectView } from '@/project/types';
import type { PlanOverlay } from '@/project/plan-overlays';
import { groundPlan } from '@/project/drawing-set';
import { axisLayout, textBox } from './annotation';
import { referenceLabel, viewReference } from './cross-ref';
import { placementOf, symbolParts } from './section-link';
import { markHeadReach, sectionLink, sectionNormal, withoutSectionLink } from './section-symbol';
import type { AnnotationShape, DraftEntity, DraftShape, Pt } from './types';

/** Text of a reference, as a share of the letter it stands beside. */
const REF_TEXT_SHARE = 0.8;
/** Id suffix of a derived draft, so it never collides with a stored one. */
const XREF = '~xref';
/** Paper millimetres: the elevation mark's text height, its arrow, and the gap to the building. */
export const ELEVATION_TEXT_MM = 2.5;
const ARROW_MM = 3.5;
const GAP_MM = 1;
/** Paper millimetres between an arrow's base and its label: text prints a little above its box, so a smaller gap lets the arrow strike the label on a south facade. */
const LABEL_GAP_MM = 2.5;
/** Paper millimetres of padding between a flag-headed elevation mark's border and its label. */
const FLAG_PAD_MM = 1;

const centreOf = (box: Pt[]): Pt => ({ x: (box[0].x + box[2].x) / 2, y: (box[0].y + box[2].y) / 2 });

/** The anchor that puts the middle of `text` (at `height`, turned `rotation`) on `c`. */
function anchorFor(c: Pt, text: string, height: number, rotation: number): Pt {
  const mid = centreOf(textBox({ x: 0, y: 0 }, text, height, rotation));
  return { x: c.x - mid.x, y: c.y - mid.y };
}

/** Half the extent of a box along the unit direction `n`. */
function halfAlong(box: Pt[], n: Pt): number {
  const w = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
  const h = Math.hypot(box[3].x - box[0].x, box[3].y - box[0].y);
  const u = { x: (box[1].x - box[0].x) / (w || 1), y: (box[1].y - box[0].y) / (w || 1) };
  const v = { x: (box[3].x - box[0].x) / (h || 1), y: (box[3].y - box[0].y) / (h || 1) };
  return (Math.abs(n.x * u.x + n.y * u.y) * w + Math.abs(n.x * v.x + n.y * v.y) * h) / 2;
}

/** The section a drafted shape names with a reference beside it: a letter of a section symbol linked to a section view. */
function namedSection(d: DraftEntity, views: readonly ProjectView[]): string | null {
  const id = sectionLink(d);
  return id && d.shape.type === 'text' && views.find((v) => v.id === id)?.kind === 'section' ? id : null;
}

/** An elevation the ground plan carries a mark for: every one but a detail. */
const markedElevation = (v: ProjectView): v is Extract<ProjectView, { kind: 'elevation' }> => v.kind === 'elevation' && !v.detail;

/** The plan that carries the elevation marks: the ground plan (`groundPlan`) among the views that are not a detail. */
export function elevationMarkPlan(views: readonly ProjectView[]): ProjectView | null {
  return groundPlan(views.filter((v) => !v.detail));
}

/**
 * The views whose "n / sheet" the marks on plan `planViewId` print: the sections
 * its section letters name ({@link sectionReferenceDrafts}) and, on the plan
 * that carries them, every marked elevation ({@link elevationMarkDrafts}).
 * What a sheet holding the plan changes with when another sheet is renumbered.
 */
export function viewsNamedOnPlan(planViewId: string, planDrafts: readonly DraftEntity[], views: readonly ProjectView[]): string[] {
  const ids = new Set<string>();
  for (const d of planDrafts) {
    const id = namedSection(d, views);
    if (id) ids.add(id);
  }
  if (elevationMarkPlan(views)?.id === planViewId) for (const v of views) if (markedElevation(v)) ids.add(v.id);
  return [...ids].sort();
}

/** Clear space kept round a section reference, as a share of its text height. */
const REF_MARGIN_SHARE = 0.4;
/** How far a section reference may slide off its place, in its text heights, and the step it slides by. */
const REF_SLIDE_REACH = 14;
const REF_SLIDE_STEP = 0.5;

export interface SectionReferenceOptions {
  /** What the reference keeps clear of besides the references placed before it: the plan's door and window symbols (`overlayObstacleBoxes`). */
  obstacles?: readonly Box[];
  /** Model metres per paper millimetre in the viewport, and the viewport's scale over the plan's own: the text prints at `height * factor`. */
  paperUnit?: number;
  factor?: number;
  /** How the section symbols are headed (the project's graphic standard); absent: the arrow. */
  markStyle?: MarkStyle;
}

/**
 * For each letter of a section symbol whose section is on a sheet, a text just
 * beyond it reading where the section is drawn ("1 / A-301"). Nothing for a
 * section on no sheet, which keeps its letter alone. A reference whose box
 * meets an obstacle or a reference placed before it slides sideways along the
 * section's end (then a step further out) to the nearest place that is clear.
 */
export function sectionReferenceDrafts(
  drafts: readonly DraftEntity[], views: readonly ProjectView[], sheets: Parameters<typeof viewReference>[2], options: SectionReferenceOptions = {},
): DraftEntity[] {
  const viewIds = new Set(views.map((v) => v.id));
  const out: DraftEntity[] = [];
  const normals = new Map<string, Pt | null>();
  const factor = options.factor ?? 1;
  const taken: Box[] = [...(options.obstacles ?? [])];
  // The box every text on the plan prints in, read once for all its letters (#154).
  let letterBoxes: (Box | null)[] | null = null;
  for (const d of drafts) {
    const id = namedSection(d, views);
    const ref = id ? viewReference(id, viewIds, sheets) : null;
    if (!id || !ref || d.shape.type !== 'text') continue;
    if (!normals.has(id)) {
      const place = placementOf(symbolParts(drafts, id));
      normals.set(id, place ? sectionNormal(place.a, place.b, place.side) : null);
    }
    const n = normals.get(id);
    if (!n) continue;
    letterBoxes ??= drafts.map((o) => (o.shape.type === 'text' ? boxOf(textBox(o.shape.p, o.shape.text, o.shape.height * factor, o.shape.rotation)) : null));
    const letter = d.shape;
    const label = referenceLabel(ref);
    const height = letter.height * REF_TEXT_SHARE;
    const letterBox = textBox(letter.p, letter.text, letter.height, letter.rotation);
    const c0 = centreOf(letterBox);
    // The reference starts past the letter and past the head round it: a circle and its triangle, a flag and its point (#447).
    const reach = Math.max(halfAlong(letterBox, n), markHeadReach(options.markStyle ?? 'arrow', letter.height, halfAlong(letterBox, n))) + halfAlong(textBox({ x: 0, y: 0 }, label, height, 0), n) + height * 0.3;
    const home = anchorFor({ x: c0.x + n.x * reach, y: c0.y + n.y * reach }, label, height, 0);
    // The box it prints in: the text is drawn at `height * factor` about its anchor.
    const boxAt = (p: Pt): Box => boxOf(textBox(p, label, height * factor, 0));
    const margin = REF_MARGIN_SHARE * height * factor;
    const step = REF_SLIDE_STEP * height * factor;
    const along = { x: -n.y, y: n.x };
    const spots: { p: Pt; cost: number }[] = [];
    for (let outward = 0; outward <= 3; outward++) {
      for (let k = -REF_SLIDE_REACH * 2; k <= REF_SLIDE_REACH * 2; k++) {
        const s = k * step, o = outward * step * 2;
        spots.push({ p: { x: home.x + along.x * s + n.x * o, y: home.y + along.y * s + n.y * o }, cost: Math.hypot(s, o) });
      }
    }
    // The other letters on the plan are in the way too, the next section's among them.
    const blocked = [...taken, ...letterBoxes.filter((b, i): b is Box => b !== null && drafts[i] !== d)];
    // Each spot's box once, not once per box it is tested against (#154).
    const best = spots.sort((a, b) => a.cost - b.cost).find(({ p }) => {
      const box = boxAt(p);
      return blocked.every((t) => !overlaps(box, t, margin));
    });
    const p = best?.p ?? home;
    taken.push(boxAt(p));
    out.push({ ...d, id: `${d.id}${XREF}`, params: withoutSectionLink(d.params), shape: { type: 'text', p, text: label, height, rotation: 0 } });
  }
  return out;
}

/** The elevation direction → the side of the plan it is on, and the way its arrow points (drawing coordinates: a plan's y runs down the screen, north is up). */
const SIDES: Record<ElevationDirection, { out: Pt }> = {
  north: { out: { x: 0, y: -1 } },
  south: { out: { x: 0, y: 1 } },
  east: { out: { x: 1, y: 0 } },
  west: { out: { x: -1, y: 0 } },
};

/** An axis-aligned box in drawing metres. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Part of a dashed overlay line (a roof edge, a grid line): drawn over, not part of the plan's cut, so a line may run across it. */
  dashed?: boolean;
}

/** The box round `pts`. One pass, no spread: it runs for every obstacle segment and every spot a mark tries (#154). */
export function boxOf(pts: readonly Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}
export const overlaps = (a: Box, b: Box, m: number): boolean => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.y0 - m < b.y1 && a.y1 + m > b.y0;

/** The boxes of what an elevation mark must keep clear of on a plan: section lines and their labels, grid axes and their bubbles, any other line or text. */
export function obstacleBoxes(drafts: readonly DraftEntity[]): Box[] {
  const out: Box[] = [];
  for (const d of drafts) {
    const sh = d.shape;
    if (sh.type === 'line') out.push(boxOf([sh.a, sh.b]));
    else if (sh.type === 'text') out.push(boxOf(textBox(sh.p, sh.text, sh.height, sh.rotation)));
    else if (sh.type === 'axis') {
      const { bubbles, r } = axisLayout(sh);
      out.push(boxOf([sh.a, sh.b, ...bubbles.flatMap((c) => [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }])]));
    } else if (sectionLink(d)) {
      // The head of a section symbol (a circle, a flag, a triangle): its pole and letter are lines and text, the rest is here.
      if (sh.type === 'circle') out.push({ x0: sh.c.x - sh.r, y0: sh.c.y - sh.r, x1: sh.c.x + sh.r, y1: sh.c.y + sh.r });
      else if (sh.type === 'polyline') out.push(boxOf(sh.pts));
      else if (sh.type === 'hatch') out.push(boxOf(sh.loops.flat()));
    }
  }
  return out;
}

/** The longest stretch of a line one obstacle box stands for, drawing metres: a long slanting line is many boxes, so its corner is not an obstacle. */
const OBSTACLE_PITCH = 0.2;

/** The boxes along a segment, each at most {@link OBSTACLE_PITCH} long, so a slanting line is not taken for the corner of its bounding box. */
function segmentBoxes(a: Pt, b: Pt, out: Box[]): void {
  const n = Math.min(64, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / OBSTACLE_PITCH)));
  for (let i = 0; i < n; i++) {
    out.push(boxOf([{ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, { x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n }]));
  }
}

function shapeBoxes(sh: DraftShape, out: Box[]): void {
  if (sh.type === 'line') segmentBoxes(sh.a, sh.b, out);
  else if (sh.type === 'polyline') {
    for (let i = 0; i + 1 < sh.pts.length; i++) segmentBoxes(sh.pts[i], sh.pts[i + 1], out);
    if (sh.closed && sh.pts.length > 2) segmentBoxes(sh.pts[sh.pts.length - 1], sh.pts[0], out);
  } else if (sh.type === 'circle') out.push({ x0: sh.c.x - sh.r, y0: sh.c.y - sh.r, x1: sh.c.x + sh.r, y1: sh.c.y + sh.r });
  else {
    // An arc runs counter-clockwise from `start` to `end`; its swept chords, not the square round it, are what it occupies.
    const sweep = (((sh.end - sh.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
    const steps = Math.max(2, Math.min(64, Math.ceil((sweep * sh.r) / OBSTACLE_PITCH)));
    const at = (i: number): Pt => ({ x: sh.c.x + sh.r * Math.cos(sh.start + (sweep * i) / steps), y: sh.c.y + sh.r * Math.sin(sh.start + (sweep * i) / steps) });
    for (let i = 0; i < steps; i++) out.push(boxOf([at(i), at(i + 1)]));
  }
}

/**
 * The boxes of what a plan draws over its cut, the door leaves and swings, window frames, roof
 * lines and grid, that a cross-reference mark must keep clear of. They are not drafts, so
 * `obstacleBoxes` does not see them, and a swing opens past the wall into the margin the marks stand in.
 */
export function overlayObstacleBoxes(overlays: readonly PlanOverlay[]): Box[] {
  const out: Box[] = [];
  for (const o of overlays) {
    const from = out.length;
    for (const sh of o.shapes) shapeBoxes(sh, out);
    if (o.dashed || o.lineType) for (let i = from; i < out.length; i++) out[i] = { ...out[i], dashed: true };
  }
  return out;
}

export interface ElevationMarkInput {
  planViewId: string;
  layerId: string;
  views: readonly ProjectView[];
  sheets: Parameters<typeof viewReference>[2];
  /** The plan's drawing extent, drawing metres. */
  bounds: { min: Pt; max: Pt };
  /** Model metres per paper millimetre in the viewport that shows the plan (its scale over 1000). */
  paperUnit: number;
  /** The viewport's scale over the plan's own: annotation text is multiplied by it when drawn. */
  factor: number;
  /** What is already on the plan (`obstacleBoxes`): a mark slides along its side until it is clear of these. */
  obstacles?: readonly Box[];
  /** How the mark is headed (the project's graphic standard); absent: the arrow. */
  markStyle?: MarkStyle;
}

/** Clear space kept round an elevation mark, paper millimetres. */
export const MARK_MARGIN_MM = 3;
/** How many margins further out a mark may stand when no place along its side is clear. */
const LIFT_STEPS = 6;

/**
 * An elevation mark on each side of the building that has an elevation on a
 * sheet: an arrowhead outside the extent pointing at the building, and the
 * target "n / sheet" beyond it (turned along the facade on east and west, where
 * there is no room beside it). North is the top of the plan. A mark starts at
 * the middle of its side and, when its box meets an obstacle or a mark placed
 * before it, slides along the side to the nearest place that is clear.
 */
export function elevationMarkDrafts(input: ElevationMarkInput): DraftEntity[] {
  const { planViewId, layerId, views, sheets, bounds, paperUnit, factor } = input;
  const viewIds = new Set(views.map((v) => v.id));
  const mid = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 };
  const textH = ELEVATION_TEXT_MM * paperUnit;
  const margin = MARK_MARGIN_MM * paperUnit;
  const taken: Box[] = [...(input.obstacles ?? [])];
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
    const labelBox = textBox({ x: 0, y: 0 }, label, textH, rotation);
    const at = (along: number, across: number): Pt => (o.x !== 0 ? { x: along, y: across } : { x: across, y: along });
    const centre = horizontal ? mid.x : mid.y;
    // `lift` moves the whole mark further out from the building, drawing metres.
    const build = (shift: number, lift: number): { drafts: DraftEntity[]; box: Box } => {
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
      const p = anchorFor(at(head.labelMid, c), label, textH, rotation);
      const id = `${planViewId}:elevation:${view.id}${XREF}`;
      const drafts: DraftEntity[] = head.shapes.map((shape, i) => ({ id: `${id}:${i}`, viewId: planViewId, layerId, shape, params: {} }));
      drafts.push({ id: `${id}:label`, viewId: planViewId, layerId, shape: { type: 'text', p, text: label, height: textH / factor, rotation }, params: {} });
      const box = boxOf([...head.pts, ...textBox(p, label, textH, rotation)]);
      return { drafts, box };
    };
    // The nearest place along the side that is clear; if the whole side is taken, one step further out, up to LIFT_STEPS times.
    const nearestClear = (lift: number): { shift: number; placed: { drafts: DraftEntity[]; box: Box } } | null => {
      const start = build(0, lift);
      const lo = horizontal ? start.box.x0 : start.box.y0;
      const hi = horizontal ? start.box.x1 : start.box.y1;
      // A mark slides along its own facade, not past the building's corners.
      const sideLo = horizontal ? bounds.min.x : bounds.min.y;
      const sideHi = horizontal ? bounds.max.x : bounds.max.y;
      const clear = (shift: number): boolean => {
        if (shift !== 0 && (lo + shift < sideLo || hi + shift > sideHi)) return false;
        const b = horizontal ? { ...start.box, x0: start.box.x0 + shift, x1: start.box.x1 + shift } : { ...start.box, y0: start.box.y0 + shift, y1: start.box.y1 + shift };
        return taken.every((t) => !overlaps(b, t, margin));
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
