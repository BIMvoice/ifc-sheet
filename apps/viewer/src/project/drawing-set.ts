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
import { paperLabel, paperMm } from './paper';
import { drawingAreaIn, frameOf, type Rect } from './sheet-frame';
import { templateFields } from './sheet-templates';
import { fitViewportBox, SHEET_SCALES, viewportBox } from './sheets';
import { freshProjectId } from './view-defaults';
import type { ElevationDirection, Paper, PaperSize, ProjectSheet, ProjectView, SheetTemplate, SheetViewport, TemplateSeries } from './types';

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

export type SetGroup = 'plans' | 'elevations' | 'sections' | 'schedules';

/** What the drawing area depends on: a paper (landscape, the default frame), or a sheet's own paper, orientation and frame. */
export type SheetLayout = Paper | Pick<ProjectSheet, 'paper' | 'orientation' | 'frame'>;

const isSheetLike = (l: SheetLayout): l is Pick<ProjectSheet, 'paper' | 'orientation' | 'frame'> => typeof l === 'object' && !('kind' in l);

/** The paper, orientation and frame a new sheet starts with: the template's, else `paper` in landscape. */
function startOf(template: SheetTemplate | undefined, paper: PaperSize): Pick<ProjectSheet, 'paper' | 'orientation' | 'frame' | 'templateId'> {
  return template ? templateFields(template) : { paper, orientation: 'landscape' };
}

/** Width and height a view's drawing takes, metres, estimated from the model's extent. */
export function viewExtent(view: ProjectView, extent: ModelExtent): { w: number; h: number } {
  // A detail shows its rectangle only.
  if (view.detail) return { w: view.detail.max.x - view.detail.min.x, h: view.detail.max.y - view.detail.min.y };
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

/**
 * The drawing area of a sheet, paper mm: inside the frame, clear of the title
 * block. The one place "what fits on this paper" starts; a sheet passes itself.
 */
export function drawingArea(layout: SheetLayout = SET_PAPER): Rect {
  // A sheet that names no paper is drawn on A1 (`paperOf`), so its area is A1's.
  const l = isSheetLike(layout) ? { ...layout, paper: layout.paper ?? 'A1' } : { paper: layout };
  return drawingAreaIn(paperMm(l.paper, 'orientation' in l ? l.orientation : undefined), frameOf(l));
}

/** Drawings sit side by side on a landscape area and one above the other on a portrait one. */
export type Arrangement = 'row' | 'column';
const arrangementOf = (area: { w: number; h: number }): Arrangement => (area.h > area.w ? 'column' : 'row');

/** Whether `sizes` (metres) fit in `area` at 1:`scale`, side by side or stacked as the area's shape asks. */
export function fitsScale(sizes: readonly { w: number; h: number }[], area: { w: number; h: number }, scale: number): boolean {
  const k = 1000 / scale;
  if (arrangementOf(area) === 'column') {
    const width = Math.max(0, ...sizes.map((s) => s.w * k)) + GAP_MM * 2;
    const height = sizes.reduce((sum, s) => sum + s.h * k + TITLE_ROOM_MM, 0) + GAP_MM * (sizes.length + 1);
    return width <= area.w && height <= area.h;
  }
  const width = sizes.reduce((sum, s) => sum + s.w * k, 0) + GAP_MM * (sizes.length + 1);
  const height = Math.max(0, ...sizes.map((s) => s.h * k)) + TITLE_ROOM_MM + GAP_MM * 2;
  return width <= area.w && height <= area.h;
}

type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };

/** The drawing area of `layout` (mm) when a viewport box is larger than it; null when the box fits. */
export function overrun(box: { width: number; height: number }, layout: SheetLayout = SET_PAPER): { w: number; h: number } | null {
  const area = drawingArea(layout);
  return box.width > area.w || box.height > area.h ? { w: area.w, h: area.h } : null;
}

/** The most detailed offered scale (`SHEET_SCALES`) at which a drawing of `bounds` fits on `layout`; null when none does. */
export function detailedScaleThatFits(bounds: Bounds, layout: SheetLayout = SET_PAPER): number | null {
  return SHEET_SCALES.find((scale) => !overrun(fitViewportBox(bounds, scale), layout)) ?? null;
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

/**
 * Viewports for `views` across the drawing area of `layout` at `scale`: in one
 * row on a landscape area, one above the other on a portrait one, centred,
 * each centred on its drawing.
 */
export function placeViewports(views: readonly ProjectView[], sizes: readonly { w: number; h: number }[], scale: number, layout: SheetLayout = SET_PAPER): SheetViewport[] {
  const area = drawingArea(layout);
  const k = 1000 / scale;
  const make = (view: ProjectView, x: number, y: number): SheetViewport => ({ id: freshProjectId('viewport'), viewId: view.id, x, y, scale, width: 0, height: 0, center: null });
  if (arrangementOf(area) === 'column') {
    const heights = sizes.map((s) => s.h * k + TITLE_ROOM_MM);
    const total = heights.reduce((a, b) => a + b, 0) + GAP_MM * Math.max(0, views.length - 1);
    let top = area.y + (area.h - total) / 2;
    return views.map((view, i) => {
      const vp = make(view, area.x + area.w / 2, top + (sizes[i].h * k) / 2);
      top += heights[i] + GAP_MM;
      return vp;
    });
  }
  const widths = sizes.map((s) => s.w * k);
  const total = widths.reduce((a, b) => a + b, 0) + GAP_MM * Math.max(0, views.length - 1);
  let x = area.x + (area.w - total) / 2;
  const y = area.y + area.h / 2;
  return views.map((view, i) => {
    const vp = make(view, x + widths[i] / 2, y);
    x += widths[i] + GAP_MM;
    return vp;
  });
}

/**
 * The scale `sizes` are drawn at on `layout`: `preferred` (the scale a detail
 * was made for) when it fits, else the most detailed set scale that does.
 * The one answer to "what scale fits these on this paper", for the starting
 * set, a view hung later and a sheet whose paper changed.
 */
export function scaleOn(sizes: readonly { w: number; h: number }[], layout: SheetLayout, preferred?: number): number {
  const area = drawingArea(layout);
  return preferred && fitsScale(sizes, area, preferred) ? preferred : fittingScale(sizes, area);
}

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
  /** The template a group's sheets start from; a group without one is made on the smallest paper that fits. */
  templates?: Partial<Record<TemplateSeries, SheetTemplate>>;
}

/** One sheet of the set to be: its number, name and the drawings it holds. */
interface SetRow {
  group: SetGroup;
  number: string;
  name: string;
  members: ProjectView[];
}

/** The rows of the starting set, in reading order: plans bottom storey first, elevations in pairs, sections in pairs. A group with nothing to show has no row. */
function setRows(allViews: readonly ProjectView[]): SetRow[] {
  const rows: SetRow[] = [];
  // A detail is hung where it is made, not by the starting set.
  const views = allViews.filter((v) => !v.detail);
  const add = (group: SetGroup, number: string, name: string, members: ProjectView[]): void => {
    if (members.length > 0) rows.push({ group, number, name, members });
  };
  const plans = views.filter((v) => v.kind === 'plan').sort((a, b) => (a.kind === 'plan' && b.kind === 'plan' ? a.level.elevation - b.level.elevation : 0));
  pairs(plans).forEach((pair, i) => add('plans', `A-${101 + i}`, plans.length > 2 ? `Floor plans ${i + 1}` : 'Floor plans', pair));
  ELEVATION_PAIRS.forEach(({ directions, name }, i) => {
    add('elevations', `A-${201 + i}`, name, directions.flatMap((d) => views.filter((v) => v.kind === 'elevation' && v.direction === d)));
  });
  const sections = views.filter((v) => v.kind === 'section');
  pairs(sections).forEach((pair, i) => add('sections', `A-${301 + i}`, sections.length > 2 ? `Sections ${i + 1}` : 'Sections', pair));
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
 * sheet. The group a sheet belongs to is read back from its number
 * (`sheetGroup`).
 */
export function buildDrawingSet({ views, extent, now = Date.now(), templates = {} }: SetInput): ProjectSheet[] {
  const rows = setRows(views);
  const papers = papersOf(rows, extent);
  return rows.map(({ group, number, name, members }) => {
    const start = startOf(templates[group], papers.get(group)?.paper ?? SET_PAPER);
    const sizes = members.map((v) => viewExtent(v, extent));
    return { id: freshProjectId('sheet'), number, name, createdAt: now, ...start, viewports: placeViewports(members, sizes, scaleOn(sizes, start), start) };
  });
}

/** The series a sheet is in: its group, or `details` for the A-9xx sheets details hang on. */
export function sheetSeries(sheet: Pick<ProjectSheet, 'number'>): TemplateSeries | null {
  return sheetGroup(sheet) ?? (/^A-9\d\d$/.test(sheet.number) ? 'details' : null);
}

/** Which group a sheet of the set belongs to, by its number series (A-1xx plans, A-2xx elevations, A-3xx sections, A-6xx schedules). */
export function sheetGroup(sheet: Pick<ProjectSheet, 'number'>): SetGroup | null {
  const m = /^A-(\d)\d\d$/.exec(sheet.number);
  return m ? ({ '1': 'plans', '2': 'elevations', '3': 'sections', '6': 'schedules' } as Record<string, SetGroup>)[m[1]] ?? null : null;
}

/** The next free number of a group's series: A-101…, A-201…, A-301…, A-601…. */
export function nextInSeries(sheets: readonly Pick<ProjectSheet, 'number'>[], group: SetGroup): string {
  const taken = new Set(sheets.map((s) => s.number));
  let n = SERIES_START[group];
  while (taken.has(`A-${n}`)) n++;
  return `A-${n}`;
}

/** The group a view's sheet belongs to, and its number series' first number. */
export function groupOfView(view: ProjectView): SetGroup | null {
  if (view.kind === 'plan') return 'plans';
  if (view.kind === 'elevation') return 'elevations';
  if (view.kind === 'section') return 'sections';
  return null;
}

const SERIES_START: Record<SetGroup, number> = { plans: 101, elevations: 201, sections: 301, schedules: 601 };
const GROUP_NAMES: Record<SetGroup, string> = { plans: 'Floor plans', elevations: 'Elevations', sections: 'Sections', schedules: 'Schedules' };
/** Drawings a set sheet holds before a new one is started. */
export const PER_SHEET = 2;

/**
 * `sheets` with `view` hung where it belongs: beside the others on the last
 * sheet of its group while that has room, else on a new sheet numbered next
 * in the group's series. The sheet it lands on is laid out again at the scale
 * that fits. `null` for a view that has no group (3D) or is already hung.
 */
export function withViewHung(
  sheets: readonly ProjectSheet[], views: readonly ProjectView[], view: ProjectView, extent: ModelExtent, now = Date.now(),
  templates: Partial<Record<TemplateSeries, SheetTemplate>> = {},
): { sheets: ProjectSheet[]; sheetId: string } | null {
  if (sheets.some((s) => (s.viewports ?? []).some((vp) => vp.viewId === view.id))) return null;
  if (view.detail) return withDetailHung(sheets, view, extent, now, templates.details);
  const group = groupOfView(view);
  if (!group) return null;
  const layOut = (sheet: ProjectSheet, members: ProjectView[]): ProjectSheet => {
    const sizes = members.map((v) => viewExtent(v, extent));
    return { ...sheet, viewports: placeViewports(members, sizes, scaleOn(sizes, sheet), sheet) };
  };
  const inGroup = sheets.filter((s) => sheetGroup(s) === group);
  const last = inGroup.at(-1);
  if (last && (last.viewports?.length ?? 0) < PER_SHEET) {
    const members = [...(last.viewports ?? []).flatMap((vp) => views.find((v) => v.id === vp.viewId) ?? []), view];
    return { sheets: sheets.map((s) => (s.id === last.id ? layOut(s, members) : s)), sheetId: last.id };
  }
  // The new sheet starts from its series' template, else is made like the group's last sheet, else on the smallest paper that suits it.
  const start = templates[group] ? startOf(templates[group], SET_PAPER)
    : last ? { paper: last.paper ?? SET_PAPER, orientation: last.orientation ?? 'landscape', ...(last.frame ? { frame: last.frame } : {}), ...(last.templateId ? { templateId: last.templateId } : {}) }
      : startOf(undefined, choosePaper([[viewExtent(view, extent)]]).paper);
  const sheet = layOut({ id: freshProjectId('sheet'), number: nextInSeries(sheets, group), name: GROUP_NAMES[group], createdAt: now, ...start }, [view]);
  return { sheets: [...sheets, sheet], sheetId: sheet.id };
}

/**
 * A detail hangs on a sheet of its own in the "other" series (A-901…), on the
 * template's paper or else the smallest paper it fits, at the scale it was
 * made for when that fits, else the most detailed set scale that does.
 */
function withDetailHung(sheets: readonly ProjectSheet[], view: ProjectView, extent: ModelExtent, now: number, template?: SheetTemplate): { sheets: ProjectSheet[]; sheetId: string } {
  const sizes = [viewExtent(view, extent)];
  const start = startOf(template, choosePaper([sizes]).paper);
  const taken = new Set(sheets.map((s) => s.number));
  let n = 901;
  while (taken.has(`A-${n}`)) n++;
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: `A-${n}`, name: view.name, createdAt: now, ...start,
    viewports: placeViewports([view], sizes, scaleOn(sizes, start, view.scale), start),
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
  const paper = paperLabel(sheet.paper ?? SET_PAPER);
  const sizes = members.map((v) => viewExtent(v, extent));
  const area = drawingArea(sheet);
  const fits = fittingScale(sizes, area) === scale;
  const reason: Reason = !fitsScale(sizes, area, scale) && scale === SET_SCALES[SET_SCALES.length - 1]
    ? { key: 'wall.reason.noFit', params: { scale, paper } }
    : fits ? { key: 'wall.reason.fits', params: { scale, paper } } : { key: 'wall.reason.chosen', params: { scale } };
  return { scale, fits, reason };
}
