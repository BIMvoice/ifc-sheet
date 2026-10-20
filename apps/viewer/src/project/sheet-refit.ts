/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Fitting a sheet's drawings to a changed paper, orientation or frame: laid
 * out again only when the paper changed or a drawing no longer fits, else
 * kept as set by hand; either way every viewport's whole box is brought
 * inside the drawing area.
 */

import { drawingArea, placeViewports, scaleOn, viewExtent, type ModelExtent } from './drawing-set';
import { paperMm } from './paper';
import type { Rect } from './sheet-frame';
import { fitViewportBox, viewportBox } from './sheets';
import type { ProjectSheet, ProjectView, SheetViewport } from './types';

/**
 * `sheet` with its drawings laid out again for its (new) paper, orientation
 * and frame: the drawings the model has go to the scale that fits
 * (`scaleOn`) and are placed afresh, fitted to the drawing (a hand-set crop is
 * dropped); a viewport keeps its id and what else is set on it. A schedule or
 * legend is left where it is (`refittedOnPaper` brings it inside).
 */
export function relaidOnPaper(sheet: ProjectSheet, views: readonly ProjectView[], extent: ModelExtent): ProjectSheet {
  const vps = sheet.viewports ?? [];
  const drawn = vps.flatMap((vp) => { const view = views.find((v) => v.id === vp.viewId); return view ? [{ vp, view }] : []; });
  const sizes = drawn.map(({ view }) => viewExtent(view, extent));
  const first = drawn[0]?.view;
  const scale = scaleOn(sizes, sheet, drawn.length === 1 && first?.detail ? first.scale : undefined);
  const placed = new Map(placeViewports(drawn.map((d) => d.view), sizes, scale, sheet).map((p, i) => [drawn[i].vp.id, p] as const));
  return {
    ...sheet,
    viewports: vps.map((vp) => {
      const p = placed.get(vp.id);
      return p ? { ...vp, x: p.x, y: p.y, scale, width: 0, height: 0 } : vp;
    }),
  };
}

/** A viewport's box on the paper, mm: what the sheet draws for it. */
export type BoxOf = (vp: SheetViewport) => { width: number; height: number };

/**
 * The box `vp` takes on the paper, worked out without the drawn sheet: its
 * own crop when it has one, else its drawing's estimated extent at its scale
 * (`fitViewportBox`), else the box a viewport with nothing to fit gets.
 */
export function estimatedBox(vp: SheetViewport, views: readonly ProjectView[], extent: ModelExtent | null): { width: number; height: number } {
  const view = views.find((v) => v.id === vp.viewId);
  if (vp.width > 0 && vp.height > 0) return { width: vp.width, height: vp.height };
  if (!view || !extent) return viewportBox(vp, null);
  const size = viewExtent(view, extent);
  return fitViewportBox({ min: { x: 0, y: 0 }, max: { x: size.w, y: size.h } }, vp.scale);
}

/** `vp` moved the least that puts its whole `box` inside `area`; a box wider (or taller) than the area is centred on it that way. */
export function clampedInto(vp: SheetViewport, box: { width: number; height: number }, area: Rect): SheetViewport {
  const along = (c: number, size: number, min: number, length: number): number =>
    size >= length ? min + length / 2 : Math.min(Math.max(c, min + size / 2), min + length - size / 2);
  const x = along(vp.x, box.width, area.x, area.w);
  const y = along(vp.y, box.height, area.y, area.h);
  return x === vp.x && y === vp.y ? vp : { ...vp, x, y };
}

/** Whether the paper on the sheet changed: its size, or which way round it is. */
function paperChanged(a: Pick<ProjectSheet, 'paper' | 'orientation'>, b: Pick<ProjectSheet, 'paper' | 'orientation'>): boolean {
  const pa = paperMm(a.paper ?? 'A1', a.orientation);
  const pb = paperMm(b.paper ?? 'A1', b.orientation);
  return pa.w !== pb.w || pa.h !== pb.h;
}

/**
 * `after` (a sheet whose paper, orientation or frame was just changed from
 * `before`) with its drawings fitted to it. The drawings are laid out again
 * (`relaidOnPaper`) only when the paper or its orientation changed, or a
 * viewport's box no longer fits the drawing area; any other change (a
 * margin, the title block's position) keeps each viewport's position, box
 * and scale. Without the model's `extent` nothing can be laid out again.
 * Either way every viewport, a schedule or legend too, is then moved just
 * enough for its whole box (`boxOf`, what the sheet draws for it) to sit
 * inside the drawing area. `relaid` says whether the sheet was laid out
 * again: only then may a scale have changed.
 */
export function refittedOnPaper(
  before: ProjectSheet, after: ProjectSheet, views: readonly ProjectView[], extent: ModelExtent | null,
  boxOf: BoxOf = (vp) => estimatedBox(vp, views, extent),
): { sheet: ProjectSheet; relaid: boolean } {
  const area = drawingArea(after);
  const vps = after.viewports ?? [];
  const tooBig = vps.some((vp) => { const box = boxOf(vp); return box.width > area.w || box.height > area.h; });
  const relaid = extent !== null && (paperChanged(before, after) || tooBig);
  const laid = relaid ? relaidOnPaper(after, views, extent) : after;
  const moved = new Set((laid.viewports ?? []).filter((vp, i) => vp !== vps[i]).map((vp) => vp.id));
  // A viewport laid out again is fitted to its drawing at its new scale; any other keeps the box it is drawn with.
  const box = (vp: SheetViewport) => (moved.has(vp.id) ? estimatedBox(vp, views, extent) : boxOf(vp));
  return { sheet: { ...laid, viewports: (laid.viewports ?? []).map((vp) => clampedInto(vp, box(vp), area)) }, relaid };
}
