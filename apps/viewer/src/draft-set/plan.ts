/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The planner: a model's storeys, extents and names in, a draft drawing set
 * out — one plan per storey, the four elevations, two sections through the
 * middle, each on a sheet at a scale that fits. Pure and deterministic.
 *
 * Rules (the numbers are the constants below):
 *  - Drawings are grouped as plans (A-1xx), elevations (A-2xx) and sections
 *    (A-3xx); within a group every drawing shares one scale, one paper size
 *    and one orientation.
 *  - A drawing's box on the paper is its extent at the scale plus the
 *    viewport margin on each side; boxes keep `GAP_MM` from the frame and
 *    from each other, and clear the title block.
 *  - Paper: the smallest of A3..A0 on which the biggest drawing of the group
 *    fits at 1:100 or larger. When none does, the largest paper and the
 *    largest scale that fits it; when nothing fits, the largest paper and
 *    the smallest scale, reported (`fits: false`).
 *  - Scale: the largest offered scale (no larger than 1:20) at which the
 *    biggest drawing fits alone.
 *  - The plan that carries the section marks gets a fixed box reaching past the
 *    line ends by `SECTION_OVERHANG_M` and `MARK_ROOM_MM`, so arrows and names
 *    are not clipped; every other viewport fits its drawing by itself.
 *  - Two drawings go side by side when the two biggest fit that way at that
 *    scale, otherwise one per sheet.
 *  - Sheet numbers run on without gaps in each group.
 *  - Sections are cut through the middle of the model's box, A-A along the
 *    x axis looking north and B-B along the z axis looking east, marked on
 *    the plan of the storey closest to ±0.00.
 *  - View depth: a section sees to the far side of the box beyond its cut
 *    (half the box plus `DEPTH_MARGIN_M`); an elevation sees through the
 *    whole box plus `DEPTH_MARGIN_M`.
 */

import { sectionViewName } from '@/drafting/section-symbol';
import type { ElevationDirection, PaperSize } from '@/project/types';
import { ELEVATION_INSET_M } from '@/project/view-plane';
import type {
  DraftSetInput, DraftSetPlan, PlannedElevation, PlannedPlan, PlannedSection, PlannedSheet, PlannedView, PlannedViewport,
  Reason, SheetGroup, SheetSpec,
} from './types';

/** Distance of drawings from the frame and from each other, mm. */
export const GAP_MM = 10;
/** Papers a draft set is made on, smallest first (A4 is too small for a set). */
export const DRAFT_PAPERS: readonly PaperSize[] = ['A3', 'A2', 'A1', 'A0'];
/** A paper is accepted when its drawings reach at least this scale (1:100). */
export const TARGET_SCALE = 100;
/** The largest scale a draft set uses (1:20): a model never fills a sheet at 1:5. */
export const LARGEST_SCALE = 20;
/** Added to a view's depth beyond the box face it must reach, metres. */
export const DEPTH_MARGIN_M = 1;
/** How far a section line runs past the box, metres. */
export const SECTION_OVERHANG_M = 1;
/** Room beyond a section line's end for its arrow and name, paper mm. */
export const MARK_ROOM_MM = 25;
/** Plan cut height above a floor, metres (as `DEFAULT_PLAN_CUT_HEIGHT_M`). */
const PLAN_CUT_M = 1.2;
const LEVEL_MATCH_M = 0.25;
/** Auto-fit viewport boxes are never smaller than this (`fitViewportBox`). */
const MIN_BOX_MM = { w: 40, h: 30 };

const GROUP_BASE: Record<SheetGroup, number> = { plans: 100, elevations: 200, sections: 300 };
const ELEVATIONS: readonly ElevationDirection[] = ['north', 'east', 'south', 'west'];
const ELEVATION_NAMES: Record<ElevationDirection, string> = { north: 'North Elevation', east: 'East Elevation', south: 'South Elevation', west: 'West Elevation' };

const reason = (key: Reason['key'], params: Reason['params'] = {}): Reason => ({ key, params });
const up = (v: number) => Math.ceil(v * 10 - 1e-9) / 10;
const round1 = (v: number) => Math.round(v * 10) / 10;

/** A drawing's extent in metres; `marginMm` replaces the usual room around it (a plan that carries section marks needs more). */
interface Extent { w: number; h: number; marginMm?: number }
interface Candidate { paper: PaperSize; orientation: 'landscape' | 'portrait'; scale: number; fits: boolean; area: Area }
interface Area { x: number; y: number; w: number; h: number }

function boxAt(ext: Extent, scale: number, spec: SheetSpec): Extent {
  const k = 1000 / scale;
  const margin = ext.marginMm ?? spec.viewportMarginMm;
  return { w: Math.max(MIN_BOX_MM.w, ext.w * k + margin * 2), h: Math.max(MIN_BOX_MM.h, ext.h * k + margin * 2) };
}

/** The part of a sheet drawings may use: inside the frame and clear of the title block. */
function usableArea(paper: { w: number; h: number }, orientation: 'landscape' | 'portrait', spec: SheetSpec): Area {
  const W = orientation === 'landscape' ? paper.w : paper.h;
  const H = orientation === 'landscape' ? paper.h : paper.w;
  const left = spec.frameMarginMm + GAP_MM;
  const bottom = spec.frameMarginMm + spec.titleBlockMm.h + GAP_MM;
  return { x: left, y: left, w: W - 2 * left, h: H - left - bottom };
}

const rowFits = (boxes: readonly Extent[], area: Area): boolean =>
  boxes.reduce((s, b) => s + b.w, 0) + GAP_MM * (boxes.length - 1) <= area.w + 1e-6 && Math.max(...boxes.map((b) => b.h)) <= area.h + 1e-6;

/** Largest offered scale at which the biggest drawing fits alone on this area, or null. */
function largestFittingScale(extents: readonly Extent[], area: Area, scales: readonly number[], spec: SheetSpec): number | null {
  for (const scale of scales) {
    const boxes = extents.map((e) => boxAt(e, scale, spec));
    if (boxes.every((b) => rowFits([b], area))) return scale;
  }
  return null;
}

/** The two widest boxes side by side. */
function pairFits(boxes: readonly Extent[], area: Area): boolean {
  const widest = [...boxes].sort((a, b) => b.w - a.w).slice(0, 2);
  return rowFits(widest, area);
}

/** Largest offered scale at which the two widest drawings fit side by side, from `from` (the single-fit scale) on. */
function largestPairScale(extents: readonly Extent[], area: Area, spec: SheetSpec, from: number): number | null {
  for (const scale of [...spec.scales].filter((s) => s >= from).sort((a, b) => a - b)) {
    if (pairFits(extents.map((e) => boxAt(e, scale, spec)), area)) return scale;
  }
  return null;
}

function chooseCandidate(extents: readonly Extent[], spec: SheetSpec): Candidate {
  const scales = spec.scales.filter((s) => s >= LARGEST_SCALE).sort((a, b) => a - b);
  const offered = DRAFT_PAPERS.map((n) => spec.papers.find((p) => p.name === n)).filter((p): p is SheetSpec['papers'][number] => !!p);
  const papers = offered.length > 0 ? offered : [...spec.papers].sort((a, b) => a.w * a.h - b.w * b.h);
  const best = (paper: SheetSpec['papers'][number]): Candidate => {
    let result: Candidate | null = null;
    for (const orientation of ['landscape', 'portrait'] as const) {
      const area = usableArea(paper, orientation, spec);
      const scale = largestFittingScale(extents, area, scales, spec);
      const cand: Candidate = { paper: paper.name, orientation, scale: scale ?? scales[scales.length - 1], fits: scale !== null, area };
      // The larger scale wins; at equal scale landscape (tried first) stays.
      if (!result || (cand.fits && (!result.fits || cand.scale < result.scale))) result = cand;
    }
    return result as Candidate;
  };
  let last: Candidate | null = null;
  for (const paper of papers) {
    last = best(paper);
    if (last.fits && last.scale <= TARGET_SCALE) return last;
  }
  return last as Candidate;
}

interface GroupDrawing { view: PlannedView; extent: Extent; plan?: PlannedPlan; /** The viewport box is set, not left to fit the drawing. */ fixedBox?: boolean }

interface Packed { sheets: PlannedSheet[]; note: Reason | null }

function packGroup(group: SheetGroup, drawings: readonly GroupDrawing[], titleKey: Reason['key'], kind: string, input: DraftSetInput, firstNumber: number): Packed {
  if (drawings.length === 0) return { sheets: [], note: null };
  const { spec } = input;
  const cand = chooseCandidate(drawings.map((d) => d.extent), spec);
  // Two side by side at the scale of the pair, when that is no coarser than 1:100: a set reads best at one scale.
  const pairScale = drawings.length > 1 && cand.fits ? largestPairScale(drawings.map((d) => d.extent), cand.area, spec, cand.scale) : null;
  const scale = pairScale !== null && pairScale <= TARGET_SCALE ? pairScale : cand.scale;
  const boxes = drawings.map((d) => boxAt(d.extent, scale, spec));
  const paired = drawings.length > 1 && (pairScale === scale || (!cand.fits && pairFits(boxes, cand.area)));
  const per = paired ? 2 : 1;
  const sheets: PlannedSheet[] = [];
  for (let i = 0; i < drawings.length; i += per) {
    const chunk = drawings.slice(i, i + per);
    const chunkBoxes = boxes.slice(i, i + per);
    const total = chunkBoxes.reduce((s, b) => s + b.w, 0) + GAP_MM * (chunk.length - 1);
    let left = cand.area.x + (cand.area.w - total) / 2;
    const viewports: PlannedViewport[] = chunk.map((d, j) => {
      const box = chunkBoxes[j];
      const vp = { viewKey: d.view.key, scale, x: round1(left + box.w / 2), y: round1(cand.area.y + cand.area.h / 2), width: round1(box.w), height: round1(box.h), fixedBox: d.fixedBox === true };
      left += box.w + GAP_MM;
      return vp;
    });
    const params = { scale, paper: cand.paper, kind };
    const why = !cand.fits ? reason('draftSet.reason.noFit', params)
      : chunk.length === 2 ? reason('draftSet.reason.both', params)
      : drawings.length === 1 ? reason('draftSet.reason.only', { ...params, kind: kind.replace(/s$/, '') })
      : paired ? reason('draftSet.reason.last', params)
      : reason('draftSet.reason.single', params);
    sheets.push({
      group,
      number: `A-${firstNumber + sheets.length}`,
      title: reason(titleKey, { names: chunk.map((d) => d.view.name).join(' / ') }),
      paper: cand.paper,
      orientation: cand.orientation,
      viewports,
      titleBlock: titleBlock(input),
      reason: why,
      fits: cand.fits,
    });
  }
  return { sheets, note: cand.fits ? null : reason('draftSet.note.noFit', { kind, scale, paper: cand.paper }) };
}

function titleBlock(input: DraftSetInput): Record<string, string> {
  const project = input.buildingName && input.buildingName !== input.projectName ? `${input.projectName} - ${input.buildingName}` : input.projectName;
  return { ...(project ? { project } : {}), ...(input.date ? { date: input.date } : {}) };
}

function storeyLevels(input: DraftSetInput): { name: string; elevation: number }[] {
  const out: { name: string; elevation: number }[] = [];
  for (const s of [...input.storeys].sort((a, b) => a.elevation - b.elevation)) {
    if (!out.some((o) => Math.abs(o.elevation - s.elevation) < LEVEL_MATCH_M)) out.push({ name: s.name, elevation: s.elevation });
  }
  return out;
}

/** The draft drawing set for a model. */
export function planDraftSet(input: DraftSetInput): DraftSetPlan {
  const { bounds } = input;
  if (!bounds) return { views: [], sheets: [], notes: [reason('draftSet.note.noModel')] };
  const dx = Math.max(bounds.max.x - bounds.min.x, 1);
  const dy = Math.max(bounds.max.y - bounds.min.y, 1);
  const dz = Math.max(bounds.max.z - bounds.min.z, 1);
  const mid = { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const notes: Reason[] = [];

  let levels = storeyLevels(input);
  const fallback = levels.length === 0;
  if (fallback) {
    levels = [{ name: 'Plan', elevation: bounds.min.y }];
    notes.push(reason('draftSet.note.noStoreys', { height: round1(dy / 2) }));
  }
  const plans: GroupDrawing[] = levels.map((level) => {
    const view: PlannedPlan = {
      key: `plan:${round1(level.elevation)}`, kind: 'plan', name: level.name, level,
      cutHeight: fallback ? round1(dy / 2) : PLAN_CUT_M, scale: 0,
    };
    return { view, extent: { w: dx, h: dz }, plan: view };
  });
  const ground = plans.reduce((a, b) => (Math.abs(b.plan!.level.elevation) < Math.abs(a.plan!.level.elevation) ? b : a));
  // The plan with the section marks must show them whole: its box reaches past the line ends.
  ground.extent = { w: dx + 2 * SECTION_OVERHANG_M, h: dz + 2 * SECTION_OVERHANG_M, marginMm: input.spec.viewportMarginMm + MARK_ROOM_MM };
  ground.fixedBox = true;

  const elevations: GroupDrawing[] = ELEVATIONS.map((direction) => {
    const across = direction === 'north' || direction === 'south' ? dx : dz;
    const through = direction === 'north' || direction === 'south' ? dz : dx;
    const depth = up(through + DEPTH_MARGIN_M);
    const planeOffset = { north: bounds.min.z + ELEVATION_INSET_M, south: bounds.max.z - ELEVATION_INSET_M, east: bounds.max.x - ELEVATION_INSET_M, west: bounds.min.x + ELEVATION_INSET_M }[direction];
    const view: PlannedElevation = {
      key: `elevation:${direction}`, kind: 'elevation', name: ELEVATION_NAMES[direction], direction, planeOffset, depth,
      depthReason: reason('draftSet.depth.elevation', { depth, margin: DEPTH_MARGIN_M }),
    };
    return { view, extent: { w: across, h: dy } };
  });

  const sectionOf = (axis: 'x' | 'z'): GroupDrawing => {
    const alongX = axis === 'x';
    const line = alongX
      ? { a: { x: bounds.min.x - SECTION_OVERHANG_M, y: mid.z }, b: { x: bounds.max.x + SECTION_OVERHANG_M, y: mid.z }, side: { x: mid.x, y: mid.z - 1 } }
      : { a: { x: mid.x, y: bounds.min.z - SECTION_OVERHANG_M }, b: { x: mid.x, y: bounds.max.z + SECTION_OVERHANG_M }, side: { x: mid.x + 1, y: mid.z } };
    const depth = up((alongX ? dz : dx) / 2 + DEPTH_MARGIN_M);
    const view: PlannedSection = {
      key: `section:${axis}`, kind: 'section', name: sectionViewName(alongX ? 'A' : 'B'), axis, line, onPlan: ground.view.key, depth,
      depthReason: reason('draftSet.depth.section', { depth, margin: DEPTH_MARGIN_M }),
    };
    return { view, extent: { w: alongX ? dx : dz, h: dy } };
  };
  const sections = [sectionOf('x'), sectionOf('z')];

  const groups: [SheetGroup, GroupDrawing[], Reason['key'], string][] = [
    ['plans', plans, 'draftSet.title.plans', 'plans'],
    ['elevations', elevations, 'draftSet.title.elevations', 'elevations'],
    ['sections', sections, 'draftSet.title.sections', 'sections'],
  ];
  const sheets: PlannedSheet[] = [];
  for (const [group, drawings, titleKey, kind] of groups) {
    const packed = packGroup(group, drawings, titleKey, kind, input, GROUP_BASE[group] + 1);
    sheets.push(...packed.sheets);
    if (packed.note) notes.push(packed.note);
    if (group === 'plans') for (const d of plans) d.plan!.scale = packed.sheets[0]?.viewports[0]?.scale ?? 100;
  }
  const views: PlannedView[] = [...plans, ...elevations, ...sections].map((d) => d.view);
  return { views, sheets, notes };
}

