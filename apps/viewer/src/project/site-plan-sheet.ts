/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The site plan's own sheet (`drawing-set.ts` hangs a site plan view here). Split out of `drawing-set.ts` to keep it under the module size rule. */

import { drawingArea, fitsScale, SET_PAPERS, viewExtent, type ModelExtent } from './drawing-set';
import { SHEET_SCALES } from './sheets';
import { freshProjectId } from './view-defaults';
import type { ProjectSheet, ProjectView } from './types';

/** Room around the building a site plan's sheet leaves for the plot, as a share of the building's extent. */
const SITE_ROOM = 1;

/**
 * The site plan hangs on a sheet of its own, first of the set (A-001…), at
 * its own scale (1:200) on the smallest set paper that holds the building
 * with room around it for the plot, else at the scale that fits.
 */
export function withSitePlanHung(sheets: readonly ProjectSheet[], view: ProjectView, extent: ModelExtent, now: number): { sheets: ProjectSheet[]; sheetId: string } {
  const own = viewExtent(view, extent);
  const sizes = [{ w: own.w * (1 + SITE_ROOM), h: own.h * (1 + SITE_ROOM) }];
  const scale = view.scale ?? 200;
  const paper = SET_PAPERS.find((p) => fitsScale(sizes, drawingArea(p), scale)) ?? SET_PAPERS[SET_PAPERS.length - 1];
  const taken = new Set(sheets.map((s) => s.number));
  const numberOf = (k: number) => `A-${String(k).padStart(3, '0')}`;
  let n = 1;
  while (taken.has(numberOf(n))) n++;
  const area = drawingArea(paper);
  const fitting = fitsScale(sizes, area, scale) ? scale : SHEET_SCALES.find((s) => fitsScale(sizes, area, s)) ?? scale;
  // A little above the middle: the site balance goes under it.
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: numberOf(n), name: view.name, createdAt: now, paper, orientation: 'landscape',
    viewports: [{ id: freshProjectId('viewport'), viewId: view.id, x: area.x + area.w / 2, y: area.y + area.h / 2 - 15, scale: fitting, width: 0, height: 0, center: null }],
  };
  return { sheets: [...sheets, sheet], sheetId: sheet.id };
}
