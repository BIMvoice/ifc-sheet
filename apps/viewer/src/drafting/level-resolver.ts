/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a level mark reads in a given view: a plan's mark reads the elevation
 * of its storey, a section's or elevation's the height of its reference on the
 * view's plane. One place, so the drafting view that edits a mark and a sheet
 * that prints it cannot disagree on the number.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { resolvePlanLevel } from '@/project/view-defaults';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { drawingToWorld } from './frame';
import type { LevelResolver } from './level-mark';

/** The level a plan's mark names (by storey id or level name), else the plan's own. */
export function planLevelOf(view: ProjectView, levels: readonly ProjectLevel[], storey?: string): ProjectLevel | undefined {
  if (view.kind !== 'plan') return undefined;
  const own = resolvePlanLevel(view, levels) ?? view.level;
  const named = storey ? levels.find((l) => l.storeyGlobalIds.includes(storey) || l.name === storey) : undefined;
  return named ?? own;
}

/** The reference a mark placed on `view` records for the level the plan reads. */
export function storeyOf(view: ProjectView, levels: readonly ProjectLevel[]): string | undefined {
  const level = planLevelOf(view, levels);
  return level?.storeyGlobalIds[0] ?? level?.name;
}

/** How a reference is read in `view`; `plane` is the view's drawing plane (none: a section cannot resolve). */
export function levelResolverFor(view: ProjectView, levels: readonly ProjectLevel[], plane: SectionPlaneConfig | undefined): LevelResolver {
  return (ref) => {
    if (view.kind === 'plan') return ref.storey === undefined ? null : planLevelOf(view, levels, ref.storey)?.elevation ?? null;
    return plane ? drawingToWorld(plane, ref.at).y : null;
  };
}
