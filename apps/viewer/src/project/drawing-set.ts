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

import type { TranslationKey } from '@/i18n';
import { fitViewportBox, FRAME_MARGIN_MM, PAPER_MM, SHEET_SCALES, TITLE_BLOCK_MM } from './sheets';
import { freshProjectId } from './view-defaults';
import { DEFAULT_SCHEME, nextNumber, numberGroupOf, numberSheets } from './numbering';
import type { ElevationDirection, NumberingScheme, PaperSize, ProjectSheet, ProjectView, SheetViewport } from './types';

/** The scales a set chooses among, most detailed first. */
export const SET_SCALES = [50, 100, 200] as const;
/** The paper a sheet is read on when it names none. */
export const SET_PAPER: PaperSize = 'A2';
/** The papers a set is made on, smallest first (A4 is too small for a set). */
export const SET_PAPERS: readonly PaperSize[] = ['A3', 'A2', 'A1', 'A0'];
/** A paper is accepted when its drawings reach at least this scale (1:100). */
export const TARGET_SCALE = 100;
/** Space between two drawings on a sheet, paper mm. */
const GAP_MM = 25;
/** Room under a drawing for its title, paper mm. */
const TITLE_ROOM_MM = 12;

/** The model's extent in the viewer frame, metres (X east, Y up, Z south). */
export interface ModelExtent {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** `interiors`: a room's interior elevations (A-4xx), kept apart from the facade elevations so each group is scaled on its own. */
export type SetGroup = 'plans' | 'elevations' | 'sections' | 'interiors' | 'schedules';

/** Width and height a view's drawing takes, metres, estimated from the model's extent. */
export function viewExtent(view: ProjectView, extent: ModelExtent): { w: number; h: number } {
  // A detail shows its rectangle only, an interior elevation its wall.
  const crop = view.detail ?? (view.kind === 'elevation' ? view.interior?.crop : undefined);
  if (crop) return { w: crop.max.x - crop.min.x, h: crop.max.y - crop.min.y };
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
export function drawingArea(paper: PaperSize = SET_PAPER, orientation: 'landscape' | 'portrait' = 'landscape'): { x: number; y: number; w: number; h: number } {
  const base = PAPER_MM[paper];
  const { w, h } = orientation === 'landscape' ? base : { w: base.h, h: base.w };
  return { x: FRAME_MARGIN_MM, y: FRAME_MARGIN_MM, w: w - FRAME_MARGIN_MM * 2, h: h - FRAME_MARGIN_MM * 2 - TITLE_BLOCK_MM.h };
}

/** Whether `sizes` (metres) fit side by side in `area` at 1:`scale`. */
export function fitsScale(sizes: readonly { w: number; h: number }[], area: { w: number; h: number }, scale: number): boolean {
  const k = 1000 / scale;
  const width = sizes.reduce((sum, s) => sum + s.w * k, 0) + GAP_MM * (sizes.length + 1);
  const height = Math.max(0, ...sizes.map((s) => s.h * k)) + TITLE_ROOM_MM + GAP_MM * 2;
  return width <= area.w && height <= area.h;
}

type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };

/** The drawing area of `paper` (mm) when a viewport box is larger than it; null when the box fits. */
export function overrun(box: { width: number; height: number }, paper: PaperSize = SET_PAPER): { w: number; h: number } | null {
  const area = drawingArea(paper);
  return box.width > area.w || box.height > area.h ? { w: area.w, h: area.h } : null;
}

/** The most detailed offered scale (`SHEET_SCALES`) at which a drawing of `bounds` fits on `paper`; null when none does. */
export function detailedScaleThatFits(bounds: Bounds, paper: PaperSize = SET_PAPER): number | null {
  return SHEET_SCALES.find((scale) => !overrun(fitViewportBox(bounds, scale), paper)) ?? null;
}

/** The most detailed set scale at which `sizes` (metres) fit side by side in `area`; the least detailed when none does. */
export function fittingScale(sizes: readonly { w: number; h: number }[], area: { w: number; h: number }): number {
  return SET_SCALES.find((scale) => fitsScale(sizes, area, scale)) ?? SET_SCALES[SET_SCALES.length - 1];
}

/**
 * The paper a group of sheets is made on: the smallest of A3..A0 on which
 * every row of drawings reaches 1:100 or a more detailed scale. When none
 * does, the largest paper, and `fits` says whether the drawings are still
 * larger than it at the smallest scale.
 */
export function choosePaper(rows: readonly (readonly { w: number; h: number }[])[]): { paper: PaperSize; fits: boolean } {
  for (const paper of SET_PAPERS) {
    const area = drawingArea(paper);
    // fittingScale is the least detailed scale when none fits, so a result at 1:100 or better is a fit.
    if (rows.every((sizes) => fittingScale(sizes, area) <= TARGET_SCALE)) return { paper, fits: true };
  }
  const paper = SET_PAPERS[SET_PAPERS.length - 1];
  const area = drawingArea(paper);
  return { paper, fits: rows.every((sizes) => fitsScale(sizes, area, fittingScale(sizes, area))) };
}

/** Viewports for `views` in one row across the drawing area at `scale`, centred, each centred on its drawing. */
export function rowOfViewports(views: readonly Pick<ProjectView, 'id'>[], sizes: readonly { w: number; h: number }[], scale: number, paper: PaperSize = SET_PAPER): SheetViewport[] {
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
  now?: number;
  /** The project's numbering; today's A-101 style when absent. */
  scheme?: NumberingScheme;
}

/** One sheet of the set to be: its group, name and the drawings it holds. */
interface SetRow {
  group: SetGroup;
  name: string;
  members: ProjectView[];
}

/** The rows of the starting set, in reading order: plans bottom storey first, elevations in pairs, sections in pairs. A group with nothing to show has no row. */
function setRows(allViews: readonly ProjectView[]): SetRow[] {
  const rows: SetRow[] = [];
  // A detail, and the site plan, are hung where they are made, not by the starting set.
  const views = allViews.filter((v) => !v.detail && !(v.kind === 'plan' && v.site));
  const add = (group: SetGroup, name: string, members: ProjectView[]): void => {
    if (members.length > 0) rows.push({ group, name, members });
  };
  const plans = views.filter((v) => v.kind === 'plan').sort((a, b) => (a.kind === 'plan' && b.kind === 'plan' ? a.level.elevation - b.level.elevation : 0));
  pairs(plans).forEach((pair, i) => add('plans', plans.length > 2 ? `Floor plans ${i + 1}` : 'Floor plans', pair));
  ELEVATION_PAIRS.forEach(({ directions, name }) => {
    add('elevations', name, directions.flatMap((d) => views.filter((v) => v.kind === 'elevation' && v.direction === d && !v.interior)));
  });
  const sections = views.filter((v) => v.kind === 'section');
  pairs(sections).forEach((pair, i) => add('sections', sections.length > 2 ? `Sections ${i + 1}` : 'Sections', pair));
  return rows;
}

/** The paper each group of `rows` is made on, and whether its drawings fit it. */
function papersOf(rows: readonly SetRow[], extent: ModelExtent): Map<SetGroup, { paper: PaperSize; fits: boolean }> {
  const out = new Map<SetGroup, { paper: PaperSize; fits: boolean }>();
  for (const group of new Set(rows.map((r) => r.group))) {
    out.set(group, choosePaper(rows.filter((r) => r.group === group).map((r) => r.members.map((v) => viewExtent(v, extent)))));
  }
  return out;
}

/** The groups of the set whose drawings are still larger than their sheet at the smallest scale on the largest paper. */
export function groupsThatDoNotFit(views: readonly ProjectView[], extent: ModelExtent): SetGroup[] {
  return [...papersOf(setRows(views), extent)].filter(([, p]) => !p.fits).map(([group]) => group);
}

/**
 * The sheets of the starting set. Each group is made on the smallest paper
 * that gives its drawings 1:100 or better, each sheet at the most detailed
 * scale its drawings fit at on it. A group with nothing to show makes no
 * sheet. Each sheet records the group it belongs to (`series`) and is
 * numbered by the project's scheme.
 */
export function buildDrawingSet({ views, extent, now = Date.now(), scheme = DEFAULT_SCHEME }: SetInput): ProjectSheet[] {
  const rows = setRows(views);
  const papers = papersOf(rows, extent);
  const sheets = rows.map(({ group, name, members }) => {
    const paper = papers.get(group)?.paper ?? SET_PAPER;
    const sizes = members.map((v) => viewExtent(v, extent));
    return {
      id: freshProjectId('sheet'), number: '', series: group, name, createdAt: now, paper, orientation: 'landscape' as const,
      viewports: rowOfViewports(members, sizes, fittingScale(sizes, drawingArea(paper)), paper),
    };
  });
  const numbers = numberSheets(sheets, scheme);
  return sheets.map((s) => ({ ...s, number: numbers.get(s.id) ?? s.number }));
}

/** Which group a sheet of the set belongs to (`null`: details and other sheets). Sheets from older files are read from their A-1xx / A-2xx / A-3xx / A-4xx / A-6xx number. */
export function sheetGroup(sheet: Pick<ProjectSheet, 'number' | 'series'>): SetGroup | null {
  const group = numberGroupOf(sheet);
  return group === 'other' || group === 'details' || group === 'general' ? null : group;
}

/** Whether a sheet belongs to the drawing set the program lays out: every sheet but a room's interior elevations. */
export function isSetSheet(sheet: Pick<ProjectSheet, 'number' | 'series'>): boolean {
  return sheetGroup(sheet) !== 'interiors';
}

/** The group a view's sheet belongs to, and its number series' first number. */
export function groupOfView(view: ProjectView): SetGroup | null {
  if (view.kind === 'plan') return 'plans';
  if (view.kind === 'elevation') return view.interior ? 'interiors' : 'elevations';
  if (view.kind === 'section') return 'sections';
  return null;
}

const GROUP_NAMES: Record<SetGroup, string> = { plans: 'Floor plans', elevations: 'Elevations', sections: 'Sections', interiors: 'Interior elevations', schedules: 'Schedules' };
/** Drawings a set sheet holds before a new one is started. */
export const PER_SHEET = 2;

/**
 * `sheets` with `view` hung where it belongs: beside the others on the last
 * sheet of its group while that has room, else on a new sheet numbered next
 * in the group's series. The sheet it lands on is laid out again at the scale
 * that fits. `null` for a view that has no group (3D) or is already hung.
 */
export function withViewHung(sheets: readonly ProjectSheet[], views: readonly ProjectView[], view: ProjectView, extent: ModelExtent, now = Date.now(), scheme: NumberingScheme = DEFAULT_SCHEME): { sheets: ProjectSheet[]; sheetId: string } | null {
  if (sheets.some((s) => (s.viewports ?? []).some((vp) => vp.viewId === view.id))) return null;
  if (view.detail) return withDetailHung(sheets, view, extent, now, scheme);
  if (view.kind === 'plan' && view.site) return withSitePlanHung(sheets, view, extent, now, scheme);
  const group = groupOfView(view);
  if (!group) return null;
  const area = drawingArea();
  const layOut = (sheet: ProjectSheet, members: ProjectView[]): ProjectSheet => {
    const sizes = members.map((v) => viewExtent(v, extent));
    return { ...sheet, viewports: rowOfViewports(members, sizes, fittingScale(sizes, area), sheet.paper ?? SET_PAPER) };
  };
  const inGroup = sheets.filter((s) => sheetGroup(s) === group);
  const last = inGroup.at(-1);
  if (last && (last.viewports?.length ?? 0) < PER_SHEET) {
    const members = [...(last.viewports ?? []).flatMap((vp) => views.find((v) => v.id === vp.viewId) ?? []), view];
    return { sheets: sheets.map((s) => (s.id === last.id ? layOut(s, members) : s)), sheetId: last.id };
  }
  // The new sheet is made on the paper of its group, else on the smallest that suits it.
  const paper = last?.paper ?? choosePaper([[viewExtent(view, extent)]]).paper;
  const sheet = layOut({
    id: freshProjectId('sheet'), number: nextNumber(sheets, group, scheme), series: group, name: GROUP_NAMES[group], createdAt: now, paper, orientation: 'landscape',
  }, [view]);
  return { sheets: [...sheets, sheet], sheetId: sheet.id };
}

/** Room around the building a site plan's sheet leaves for the plot, as a share of the building's extent. */
const SITE_ROOM = 1;

/**
 * The site plan hangs on a sheet of its own, first of the set (A-001…), at
 * its own scale (1:200) on the smallest set paper that holds the building
 * with room around it for the plot, else at the scale that fits.
 */
function withSitePlanHung(sheets: readonly ProjectSheet[], view: ProjectView, extent: ModelExtent, now: number, scheme: NumberingScheme): { sheets: ProjectSheet[]; sheetId: string } {
  const own = viewExtent(view, extent);
  const sizes = [{ w: own.w * (1 + SITE_ROOM), h: own.h * (1 + SITE_ROOM) }];
  const scale = view.scale ?? 200;
  const paper = SET_PAPERS.find((p) => fitsScale(sizes, drawingArea(p), scale)) ?? SET_PAPERS[SET_PAPERS.length - 1];
  const area = drawingArea(paper);
  const fitting = fitsScale(sizes, area, scale) ? scale : SHEET_SCALES.find((s) => fitsScale(sizes, area, s)) ?? scale;
  // A little above the middle: the site balance goes under it.
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: nextNumber(sheets, 'general', scheme), series: 'general', name: view.name, createdAt: now, paper, orientation: 'landscape',
    viewports: [{ id: freshProjectId('viewport'), viewId: view.id, x: area.x + area.w / 2, y: area.y + area.h / 2 - 15, scale: fitting, width: 0, height: 0, center: null }],
  };
  return { sheets: [...sheets, sheet], sheetId: sheet.id };
}

/**
 * A detail hangs on a sheet of its own in the "other" series (A-901… by default), on the
 * smallest paper it fits, at the scale it was made for when that fits, else at
 * the most detailed set scale that does.
 */
function withDetailHung(sheets: readonly ProjectSheet[], view: ProjectView, extent: ModelExtent, now: number, scheme: NumberingScheme): { sheets: ProjectSheet[]; sheetId: string } {
  const sizes = [viewExtent(view, extent)];
  const { paper } = choosePaper([sizes]);
  const scale = view.scale && fitsScale(sizes, drawingArea(paper), view.scale) ? view.scale : fittingScale(sizes, drawingArea(paper));
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: nextNumber(sheets, 'other', scheme), series: 'other', name: view.name, createdAt: now, paper, orientation: 'landscape',
    viewports: rowOfViewports([view], sizes, scale, paper),
  };
  return { sheets: [...sheets, sheet], sheetId: sheet.id };
}

/** A sentence kept as data: a catalogue key and its parameters, translated where it is shown. */
export interface Reason {
  key: TranslationKey;
  params: Record<string, string | number>;
}

/**
 * Why a sheet is at its scale, in one line (concept B's reason, #20): the
 * most detailed scale its drawings fit at on its paper, one somebody chose,
 * or the smallest scale there is when the drawings are still larger than
 * the paper. The Wall and the DRAFTSET command both say this one line.
 * `null` for a sheet whose drawings do not share one scale.
 */
export function sheetScaleReason(sheet: ProjectSheet, views: readonly ProjectView[], extent: ModelExtent): { scale: number; fits: boolean; reason: Reason } | null {
  const vps = sheet.viewports ?? [];
  const scales = new Set(vps.map((v) => v.scale));
  if (scales.size !== 1) return null;
  const [scale] = scales;
  const members = vps.flatMap((vp) => views.find((v) => v.id === vp.viewId) ?? []);
  // A schedule or legend sets its own size: there is no scale to explain.
  if (members.length !== vps.length) return null;
  const paper = sheet.paper ?? SET_PAPER;
  const sizes = members.map((v) => viewExtent(v, extent));
  const area = drawingArea(paper);
  const fits = fittingScale(sizes, area) === scale;
  const reason: Reason = !fitsScale(sizes, area, scale) && scale === SET_SCALES[SET_SCALES.length - 1]
    ? { key: 'wall.reason.noFit', params: { scale, paper } }
    : fits ? { key: 'wall.reason.fits', params: { scale, paper } } : { key: 'wall.reason.chosen', params: { scale } };
  return { scale, fits, reason };
}
