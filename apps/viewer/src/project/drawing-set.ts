/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing set a model starts with: its views put on sheets, grouped by
 * kind, each sheet at the largest scale its views fit at. Plans two to a
 * sheet (A-101…), elevations south and north then east and west (A-201,
 * A-202), sections two to a sheet (A-301…). The person starts by taking away
 * what they do not need, not by building it.
 *
 * Pure: views and the model's extent in, sheets out. A view's size on paper
 * is estimated from the model's extent, so the set is laid out before any
 * drawing is generated; a viewport fits its drawing once that exists.
 */

import { FRAME_MARGIN_MM, PAPER_MM, TITLE_BLOCK_MM } from './sheets';
import { freshProjectId } from './view-defaults';
import type { ElevationDirection, PaperSize, ProjectSheet, ProjectView, SheetViewport } from './types';

/** The scales a set chooses among, most detailed first. */
export const SET_SCALES = [50, 100, 200] as const;
export const SET_PAPER: PaperSize = 'A2';
/** Space between two drawings on a sheet, paper mm. */
const GAP_MM = 25;
/** Room under a drawing for its title, paper mm. */
const TITLE_ROOM_MM = 12;

/** The model's extent in the viewer frame, metres (X east, Y up, Z south). */
export interface ModelExtent {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export type SetGroup = 'plans' | 'elevations' | 'sections';

/** Width and height a view's drawing takes, metres, estimated from the model's extent. */
export function viewExtent(view: ProjectView, extent: ModelExtent): { w: number; h: number } {
  const dx = extent.max.x - extent.min.x;
  const dy = extent.max.y - extent.min.y;
  const dz = extent.max.z - extent.min.z;
  switch (view.kind) {
    case 'plan':
      return { w: dx, h: dz };
    case 'elevation':
      return view.direction === 'north' || view.direction === 'south' ? { w: dx, h: dy } : { w: dz, h: dy };
    case 'section': {
      // A cut runs across the plan; its drawing is as wide as the plan is along the cut.
      const n = view.plane.custom?.normal;
      const across = n ? Math.abs(n[0]) * dz + Math.abs(n[2]) * dx : Math.max(dx, dz);
      return { w: across, h: dy };
    }
    default:
      return { w: dx, h: dy };
  }
}

/** The drawing area of a sheet, paper mm: inside the frame, above the title block. */
export function drawingArea(paper: PaperSize = SET_PAPER): { x: number; y: number; w: number; h: number } {
  const { w, h } = PAPER_MM[paper];
  return { x: FRAME_MARGIN_MM, y: FRAME_MARGIN_MM, w: w - FRAME_MARGIN_MM * 2, h: h - FRAME_MARGIN_MM * 2 - TITLE_BLOCK_MM.h };
}

/** The most detailed set scale at which `sizes` (metres) fit side by side in `area`; the least detailed when none does. */
export function fittingScale(sizes: readonly { w: number; h: number }[], area: { w: number; h: number }): number {
  for (const scale of SET_SCALES) {
    const k = 1000 / scale;
    const width = sizes.reduce((sum, s) => sum + s.w * k, 0) + GAP_MM * (sizes.length + 1);
    const height = Math.max(0, ...sizes.map((s) => s.h * k)) + TITLE_ROOM_MM + GAP_MM * 2;
    if (width <= area.w && height <= area.h) return scale;
  }
  return SET_SCALES[SET_SCALES.length - 1];
}

/** Viewports for `views` in one row across the drawing area at `scale`, centred, each centred on its drawing. */
export function rowOfViewports(views: readonly ProjectView[], sizes: readonly { w: number; h: number }[], scale: number, paper: PaperSize = SET_PAPER): SheetViewport[] {
  const area = drawingArea(paper);
  const k = 1000 / scale;
  const widths = sizes.map((s) => s.w * k);
  const total = widths.reduce((a, b) => a + b, 0) + GAP_MM * Math.max(0, views.length - 1);
  let x = area.x + (area.w - total) / 2;
  const y = area.y + area.h / 2;
  return views.map((view, i) => {
    const vp: SheetViewport = { id: freshProjectId('viewport'), viewId: view.id, x: x + widths[i] / 2, y, scale, width: 0, height: 0, center: null };
    x += widths[i] + GAP_MM;
    return vp;
  });
}

const ELEVATION_PAIRS: { directions: ElevationDirection[]; name: string }[] = [
  { directions: ['south', 'north'], name: 'Elevations, south and north' },
  { directions: ['east', 'west'], name: 'Elevations, east and west' },
];

function pairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

export interface SetInput {
  views: readonly ProjectView[];
  extent: ModelExtent;
  /** Title block fields every sheet starts with (from the model). */
  titleBlock: Record<string, string>;
  now?: number;
}

/**
 * The sheets of the starting set. Plans go bottom storey first, as a set is
 * read; a group with nothing to show makes no sheet. The group a sheet
 * belongs to is read back from its number (`sheetGroup`).
 */
export function buildDrawingSet({ views, extent, titleBlock, now = Date.now() }: SetInput): ProjectSheet[] {
  const sheets: ProjectSheet[] = [];
  const area = drawingArea();
  const sheet = (number: string, name: string, members: readonly ProjectView[]): void => {
    if (members.length === 0) return;
    const sizes = members.map((v) => viewExtent(v, extent));
    const scale = fittingScale(sizes, area);
    sheets.push({
      id: freshProjectId('sheet'), number, name, createdAt: now, paper: SET_PAPER, orientation: 'landscape',
      viewports: rowOfViewports(members, sizes, scale), titleBlock: { ...titleBlock },
    });
  };
  const plans = views.filter((v) => v.kind === 'plan').sort((a, b) => (a.kind === 'plan' && b.kind === 'plan' ? a.level.elevation - b.level.elevation : 0));
  pairs(plans).forEach((pair, i) => sheet(`A-${101 + i}`, plans.length > 2 ? `Floor plans ${i + 1}` : 'Floor plans', pair));
  ELEVATION_PAIRS.forEach(({ directions, name }, i) => {
    const members = directions.flatMap((d) => views.filter((v) => v.kind === 'elevation' && v.direction === d));
    sheet(`A-${201 + i}`, name, members);
  });
  const sections = views.filter((v) => v.kind === 'section');
  pairs(sections).forEach((pair, i) => sheet(`A-${301 + i}`, sections.length > 2 ? `Sections ${i + 1}` : 'Sections', pair));
  return sheets;
}

/** Which group a sheet of the set belongs to, by its number series (A-1xx plans, A-2xx elevations, A-3xx sections). */
export function sheetGroup(sheet: Pick<ProjectSheet, 'number'>): SetGroup | null {
  const m = /^A-(\d)\d\d$/.exec(sheet.number);
  return m ? ({ '1': 'plans', '2': 'elevations', '3': 'sections' } as Record<string, SetGroup>)[m[1]] ?? null : null;
}
