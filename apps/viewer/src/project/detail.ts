/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A detail of an area: a view that shows a rectangle of another view at a
 * larger scale. It is a copy of its source (same cut plane or level, same
 * depth, same graphics), so it draws exactly what the source draws there;
 * what differs is the scale and the crop. Pure; the commands that put it in
 * the project are in `drafting/commands/detail.ts`.
 */

import { resolve } from '@/i18n/registry';
import type { NewProjectView, ProjectView, ViewDetail } from './types';

/** How much larger than its source a detail is drawn, before snapping to an offered scale. */
export const DETAIL_ENLARGEMENT = 4;
/** The smallest side of a detail's rectangle, metres. */
export const MIN_DETAIL_SIDE_M = 0.05;

type Pt = { x: number; y: number };

/** The rectangle between two corners, in either order; `null` when it is too small to be an area. */
export function detailRect(a: Pt, b: Pt): Pick<ViewDetail, 'min' | 'max'> | null {
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  return max.x - min.x < MIN_DETAIL_SIDE_M || max.y - min.y < MIN_DETAIL_SIDE_M ? null : { min, max };
}

/** The offered scale nearest (by ratio) to `DETAIL_ENLARGEMENT` times the source's; the larger one when two are as near. */
export function detailScale(sourceScale: number, offered: readonly number[]): number {
  const target = sourceScale / DETAIL_ENLARGEMENT;
  const sorted = [...offered].sort((a, b) => a - b);
  return sorted.reduce((best, s) => {
    const d = Math.abs(Math.log(s / target));
    const bd = Math.abs(Math.log(best / target));
    return d < bd - 1e-9 ? s : best;
  }, sorted[0]);
}

/** The number a detail mark shows for a view: a detail's own, or a drafting view's once a mark was made for it. */
export function detailNumberOf(view: ProjectView | undefined): number | undefined {
  if (!view) return undefined;
  return view.kind === 'drafting' ? view.number : view.detail?.number;
}

/** The next free detail number (shared by details of areas and drafting views, so no two marks read alike). */
export function nextDetailNumber(views: readonly ProjectView[]): number {
  return Math.max(0, ...views.map((v) => detailNumberOf(v) ?? 0)) + 1;
}

export const detailViewName = (number: number, sourceName: string): string => resolve('names.view.detail', { number, source: sourceName });

/**
 * The view for a detail of `rect` on `source`: the source's settings, its own
 * identity, the larger scale and the area. Not a copy of the source's own
 * drawing (drafted annotation stays on the source; a detail gets its own).
 */
export function detailOf(
  source: ProjectView, rect: Pick<ViewDetail, 'min' | 'max'>, views: readonly ProjectView[], offeredScales: readonly number[],
): NewProjectView {
  const number = nextDetailNumber(views);
  const { id: _id, createdAt: _created, ...rest } = structuredClone(source);
  return { ...rest, name: detailViewName(number, source.name), auto: false, scale: detailScale(source.scale ?? 100, offeredScales), detail: { of: source.id, min: rect.min, max: rect.max, number } } as NewProjectView;
}
