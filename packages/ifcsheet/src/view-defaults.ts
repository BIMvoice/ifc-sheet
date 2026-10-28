/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The views a project starts with: one floor plan per building level, the
 * four elevations and a default 3D view. `syncDefaultViews` keeps the plan
 * list in step with the loaded models without ever deleting a view: a plan
 * whose level is gone stays (the navigator shows it as unresolved), so a
 * project file opened before its models load loses nothing.
 */

import { nameOf } from './names.js';
import type { ElevationDirection, ProjectLevel, ProjectView, PlanProjectView, UserLevel } from './document.js';
import { freshProjectId } from './ids.js';

export { freshProjectId } from './ids.js';

/** Standard architectural plan-cut height above the floor, metres. */
export const DEFAULT_PLAN_CUT_HEIGHT_M = 1.2;

/**
 * How far below the next level's floor a default plan cut stays at most,
 * metres: room for the next floor's build-up (slab, screed, finishes), which
 * reaches below that level's elevation line, typically 0.15 to 0.30 m.
 */
export const NEXT_FLOOR_CLEARANCE_M = 0.5;

/** Levels closer than this are the same level (federated models repeat them). */
export const LEVEL_MATCH_TOLERANCE_M = 0.25;

export const ELEVATION_DIRECTIONS: readonly ElevationDirection[] = ['north', 'east', 'south', 'west'];

/** The default name of an elevation, in the active language: stored as plain text when the view is made. */
export const elevationName = (direction: ElevationDirection): string => nameOf(`names.view.${direction}` as const);

export interface StoreyInput {
  name: string;
  elevation: number;
  globalId?: string;
  /** The storey's floor in the drawing frame (`ProjectLevel.floorY`), when its placement resolves. */
  floorY?: number;
}

/** Where a level's floor is in the drawing frame: the frame plan cuts, work planes and bands are in. */
export function levelFloorY(level: Pick<ProjectLevel, 'elevation' | 'floorY'>): number {
  return level.floorY ?? level.elevation;
}

/**
 * The default cut height above `level`'s floor, metres, given the `levels` of
 * the project: {@link DEFAULT_PLAN_CUT_HEIGHT_M}, kept below the build-up of
 * the next level up when that is closer than the cut would reach.
 *
 * With `gap` the distance to the next level's floor, the cut is
 * `min(1.2, max(gap - 0.5, gap / 2))`: a storey 1.0 m below the next is cut
 * at 0.5 m, 0.6 m below it at 0.3 m (the midpoint: below 1 m the clearance
 * would leave nothing above the floor). Storeys 1.7 m or more apart keep
 * exactly 1.2 m. Measured between floors (`levelFloorY`), so a slab whose top
 * sits above its storey's elevation moves both ends together; the 0.5 m
 * clearance is what covers the next slab's underside reaching below its
 * elevation line. The top level, and a project of one level, have no next
 * level and keep 1.2 m. A cut a user sets is stored in the view and is never
 * recomputed from this.
 */
export function defaultPlanCutHeight(level: Pick<ProjectLevel, 'elevation' | 'floorY'>, levels: readonly Pick<ProjectLevel, 'elevation' | 'floorY'>[] = []): number {
  const floor = levelFloorY(level);
  let gap = Infinity;
  for (const other of levels) {
    if (sameElevation(other.elevation, level.elevation)) continue;
    const d = levelFloorY(other) - floor;
    if (d > 0 && d < gap) gap = d;
  }
  if (!Number.isFinite(gap)) return DEFAULT_PLAN_CUT_HEIGHT_M;
  return Math.min(DEFAULT_PLAN_CUT_HEIGHT_M, Math.max(gap - NEXT_FLOOR_CLEARANCE_M, gap / 2));
}

/**
 * How far below its cut a plan looking down sees, metres: its view depth,
 * plus the empty space between the cut and the model top when the cut is
 * above it. The cut itself stays where it is, so nothing is cut there (#226);
 * a plan above everything (a roof plan, the top storey of a model whose
 * highest element is a slab) still sees as far into the model as its depth
 * says. A depth of 0 (the plan shows its cut only) stays 0.
 */
export function planDepthBelowCut(viewDepth: number, cut: number, modelTop: number): number {
  return viewDepth > 0 ? viewDepth + Math.max(0, cut - modelTop) : viewDepth;
}

/**
 * Merge storeys from every model into levels: storeys within
 * {@link LEVEL_MATCH_TOLERANCE_M} of each other are one level (the shortest
 * name wins), sorted top-down like a project browser lists them.
 */
export function levelsFromStoreys(storeys: readonly StoreyInput[]): ProjectLevel[] {
  const levels: ProjectLevel[] = [];
  const sorted = [...storeys].sort((a, b) => a.elevation - b.elevation);
  for (const storey of sorted) {
    const match = levels.find((l) => sameElevation(l.elevation, storey.elevation));
    if (match) {
      if (storey.globalId && !match.storeyGlobalIds.includes(storey.globalId)) match.storeyGlobalIds.push(storey.globalId);
      if (storey.name.length < match.name.length) match.name = storey.name;
      if (match.floorY === undefined && storey.floorY !== undefined) match.floorY = storey.floorY;
      continue;
    }
    levels.push({ name: storey.name, elevation: storey.elevation, storeyGlobalIds: storey.globalId ? [storey.globalId] : [], ...(storey.floorY !== undefined ? { floorY: storey.floorY } : {}) });
  }
  return levels.sort((a, b) => b.elevation - a.elevation);
}

/** The levels of the loaded models' storeys together with the ones the user defined; a user level at a storey's height is that storey's level. */
export function levelsWithUser(storeys: readonly StoreyInput[], userLevels: readonly UserLevel[] = []): ProjectLevel[] {
  return levelsFromStoreys([...storeys, ...userLevels.map(({ name, elevation }) => ({ name, elevation }))]);
}

export function sameElevation(a: number, b: number): boolean {
  return Math.abs(a - b) < LEVEL_MATCH_TOLERANCE_M;
}

/** The level a plan view resolves to among the loaded ones, if any. */
export function resolvePlanLevel(view: PlanProjectView, levels: readonly ProjectLevel[]): ProjectLevel | undefined {
  const byId = levels.find((l) => l.storeyGlobalIds.some((g) => view.level.storeyGlobalIds.includes(g)));
  return byId ?? levels.find((l) => sameElevation(l.elevation, view.level.elevation));
}

/** `base`, or `base (2)`, `base (3)`… — the first name no other view uses (case-insensitive). */
export function uniqueViewName(base: string, views: readonly Pick<ProjectView, 'name'>[]): string {
  const taken = new Set(views.map((v) => v.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function planViewFor(level: ProjectLevel, views: readonly ProjectView[], now = Date.now(), levels: readonly ProjectLevel[] = []): PlanProjectView {
  return {
    id: freshProjectId('view'),
    kind: 'plan',
    name: uniqueViewName(level.name, views),
    // The frame-derived floor stays with the live level (`levelFloorY`), never in the saved view.
    level: { name: level.name, elevation: level.elevation, storeyGlobalIds: [...level.storeyGlobalIds] },
    cutHeight: defaultPlanCutHeight(level, levels),
    auto: true,
    createdAt: now,
  };
}

/** The views a brand-new project gets for `levels`. */
export function defaultViews(levels: readonly ProjectLevel[], now = Date.now()): ProjectView[] {
  const views: ProjectView[] = [];
  for (const level of levels) views.push(planViewFor(level, views, now, levels));
  for (const direction of ELEVATION_DIRECTIONS) {
    views.push({ id: freshProjectId('view'), kind: 'elevation', name: elevationName(direction), direction, auto: true, createdAt: now });
  }
  views.push({ id: freshProjectId('view'), kind: '3d', name: '{3D}', viewpoint: null, auto: true, createdAt: now });
  return views;
}

/**
 * Add a plan for every loaded level no plan resolves to yet. Returns the
 * same array when nothing changed, so callers can skip a store write.
 */
export function syncDefaultViews(views: readonly ProjectView[], levels: readonly ProjectLevel[], now = Date.now()): readonly ProjectView[] {
  // A discipline plan is a plan of its level for its discipline only: the level still gets its own.
  const plans = views.filter((v): v is PlanProjectView => v.kind === 'plan' && !v.discipline);
  const missing = levels.filter((level) => !plans.some((p) => resolvePlanLevel(p, [level])));
  if (missing.length === 0) return views;
  const next = [...views];
  for (const level of missing) next.push(planViewFor(level, next, now, levels));
  return next;
}
