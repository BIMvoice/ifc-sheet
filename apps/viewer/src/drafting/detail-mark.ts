/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The mark a detail leaves on its source view: a dashed rectangle with
 * rounded corners and a label: the detail's own number until the detail is on
 * a sheet, then its drawing number on that sheet and the sheet's number
 * (`1/A-901`), read from `viewReference` like every other cross-reference. Plain drafted shapes locked to
 * their detail like a section's symbol is to its section; the rectangle also
 * has grips that change the detail's crop. Pure.
 */

import { detailRect } from '@/project/detail';
import type { ProjectSheet, ProjectView, ViewDetail } from '@/project/types';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from './frame';
import type { Grip } from './grips';
import type { DraftEntity, EntityShape, Pt } from './types';
import { viewReference, type ViewReference } from './cross-ref';

type Rect = Pick<ViewDetail, 'min' | 'max'>;

/** Corner radius and label height on paper, millimetres. */
export const MARK_CORNER_MM = 3;
export const MARK_TEXT_MM = 3.5;

/** The parameter that ties a drafted shape to the detail view whose mark it belongs to. */
const LINK = 'detailOf';
/** The parameter that says which part of the mark a shape is (its order in `detailMarkShapes`). */
export const PART = 'detailPart';

export const detailLink = (e: Pick<DraftEntity, 'params'>): string | null => {
  const id = e.params[LINK];
  return typeof id === 'string' ? id : null;
};
export const DETAIL_LINK = LINK;

/** The detail's own number (`2`) on no sheet; on a sheet, the drawing number the sheet's title prints and the sheet's number (`1/A-901`). */
export const detailLabel = (number: number, ref?: ViewReference | null): string => (ref ? `${ref.drawing}/${ref.sheet}` : String(number));

/** The label of the mark of detail view `detailViewId`, numbered `number`, with the views and sheets as they are now. */
export function detailMarkLabel(
  detailViewId: string, number: number, views: readonly { id: string }[], sheets: readonly Pick<ProjectSheet, 'number' | 'viewports'>[],
): string {
  return detailLabel(number, viewReference(detailViewId, new Set(views.map((v) => v.id)), sheets));
}

/**
 * The mark's shapes, in a fixed order: four sides, four corner arcs, the
 * label. `paperM` is how many model metres one paper metre stands for (the
 * source's scale over 1000 per millimetre), so the corners and the text keep
 * their paper size at any scale. `upIsMinY` is true on a plan, where the top of the screen is the small y.
 */
export function detailMarkShapes(rect: Rect, label: string, paperM: number, upIsMinY = false): EntityShape[] {
  const { min, max } = rect;
  const r = Math.min(MARK_CORNER_MM * paperM, (max.x - min.x) / 2.5, (max.y - min.y) / 2.5);
  const h = MARK_TEXT_MM * paperM;
  const half = Math.PI / 2;
  const arc = (cx: number, cy: number, k: number): EntityShape => ({ type: 'arc', c: { x: cx, y: cy }, r, start: k * half, end: (k + 1) * half });
  return [
    { type: 'line', a: { x: min.x + r, y: min.y }, b: { x: max.x - r, y: min.y } },
    { type: 'line', a: { x: max.x, y: min.y + r }, b: { x: max.x, y: max.y - r } },
    { type: 'line', a: { x: max.x - r, y: max.y }, b: { x: min.x + r, y: max.y } },
    { type: 'line', a: { x: min.x, y: max.y - r }, b: { x: min.x, y: min.y + r } },
    arc(min.x + r, min.y + r, 2),
    arc(max.x - r, min.y + r, 3),
    arc(max.x - r, max.y - r, 0),
    arc(min.x + r, max.y - r, 1),
    // The label stands on the top edge as the person sees it: a plan is drawn with y running down the screen, every other view with y up.
    { type: 'text', p: { x: min.x, y: upIsMinY ? min.y - h * 0.4 : max.y + h * 0.4 }, text: label, height: h, rotation: 0 },
  ];
}

/** The mark's parts on `viewId`, in part order. */
export function markParts(drafts: readonly DraftEntity[], detailViewId: string): DraftEntity[] {
  return drafts.filter((d) => detailLink(d) === detailViewId).sort((a, b) => Number(a.params[PART] ?? 0) - Number(b.params[PART] ?? 0));
}

/** The drafts with every detail mark's label showing where its detail is drawn (`detailMarkLabel`). The same array when nothing changes. */
export function settleDetailMarks(drafts: DraftEntity[], views: readonly ProjectView[], sheets: readonly Pick<ProjectSheet, 'number' | 'viewports'>[]): DraftEntity[] {
  let changed = false;
  const next = drafts.map((d) => {
    const id = detailLink(d);
    if (!id || d.shape.type !== 'text') return d;
    const detail = views.find((v) => v.id === id)?.detail;
    if (!detail) return d;
    const text = detailMarkLabel(id, detail.number, views, sheets);
    if (d.shape.text === text) return d;
    changed = true;
    return { ...d, shape: { ...d.shape, text } };
  });
  return changed ? next : drafts;
}

/** Whether `e` is part of the mark of a detail view that still exists. */
export const isDetailMark = (e: Pick<DraftEntity, 'params'>, views: readonly { id: string }[]): boolean => {
  const id = detailLink(e);
  return id !== null && views.some((v) => v.id === id);
};

/** The crop grips of a selected mark: its four corners and the middles of its sides. */
export function detailGrips(rect: Rect): { key: string; at: Pt }[] {
  const { min, max } = rect;
  const mx = (min.x + max.x) / 2;
  const my = (min.y + max.y) / 2;
  return [
    { key: 'x0y0', at: { x: min.x, y: min.y } }, { key: 'x1y0', at: { x: max.x, y: min.y } },
    { key: 'x1y1', at: { x: max.x, y: max.y } }, { key: 'x0y1', at: { x: min.x, y: max.y } },
    { key: 'x0', at: { x: min.x, y: my } }, { key: 'x1', at: { x: max.x, y: my } },
    { key: 'y0', at: { x: mx, y: min.y } }, { key: 'y1', at: { x: mx, y: max.y } },
  ];
}

/** The rectangle with grip `key` dragged to `p`; `null` when that leaves no area. */
export function moveDetailGrip(rect: Rect, key: string, p: Pt): Rect | null {
  const corner = { ...rect.min };
  const other = { ...rect.max };
  const m = /^(x[01])?(y[01])?$/.exec(key);
  if (!m) return null;
  const set = (axis: 'x' | 'y', which: string) => {
    if (which.endsWith('0')) corner[axis] = p[axis]; else other[axis] = p[axis];
  };
  if (m[1]) set('x', m[1]);
  if (m[2]) set('y', m[2]);
  return detailRect(corner, other);
}

/** The crop grips of the one detail whose mark is selected, with the detail's area; `null` for any other selection. */
export function selectedDetailGrips(
  selection: ReadonlySet<string>, entities: readonly DraftEntity[], views: readonly ProjectView[],
): { viewId: string; rect: Rect; grips: Grip[] } | null {
  const touched = new Set(entities.filter((e) => selection.has(e.id)).map((e) => detailLink(e)));
  if (touched.size !== 1) return null;
  const [viewId] = touched;
  const detail = viewId ? views.find((v) => v.id === viewId)?.detail : undefined;
  const anchor = viewId ? markParts(entities, viewId)[0] : undefined;
  if (!viewId || !detail || !anchor) return null;
  const rect = { min: detail.min, max: detail.max };
  return { viewId, rect, grips: detailGrips(rect).map((g) => ({ id: anchor.id, key: g.key, at: g.at, detail: { viewId, rect } })) };
}

/** A CSS `clip-path` showing only the area `rect` of a view drawn with `transform`: what a detail shows of the model-derived layers. */
export function cropClipPath(rect: Rect, t: ViewTransform, axis: SectionAxisName): string {
  const corners = [rect.min, { x: rect.max.x, y: rect.min.y }, rect.max, { x: rect.min.x, y: rect.max.y }].map((p) => drawingToScreen(p, t, axis));
  return `polygon(${corners.map((c) => `${c.x.toFixed(1)}px ${c.y.toFixed(1)}px`).join(', ')})`;
}
