/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a drafting command reads from the view it works on, as ONE function of
 * the view and its generated drawing (#333): the elements the drawing shows,
 * the walls, doors and windows its plan is cut through, the rooms, the symbols
 * a tag keeps clear of, the hatch boundaries, and where a level mark gets its
 * reference and number.
 *
 * The view in front installs these into the drafting session
 * (`useDraftingProviders`); the batch that annotates the whole set
 * (`annotate-set/`) builds them for a view that is not open. Both call this,
 * so a command given a view that is open and the same view that is not reads
 * the same things: the two cannot drift.
 */

import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { planParts } from '@/dimall/parts';
import { viewElements } from '@/labels/view-elements';
import { currentDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { useProjectStore } from '@/project/project-store';
import { resolvePlanLevel } from '@/project/view-defaults';
import { viewWorkPlane } from '@/project/view-plane-config';
import { planSymbolObstacles } from '@/rcp/ceiling-tag-obstacles';
import { roomsOfPlan } from '@/tagall/rooms';
import { closedLoopsOf } from '@/components/viewer/drafting/drafting-shapes';
import { drawingToWorld } from './frame';
import { levelResolverFor, storeyOf } from './level-resolver';
import type { DraftContext } from './commands/types';
import type { DraftEntity } from './types';

/** The part of a command's context that comes from the view and its drawing. */
export type ViewInputs = Pick<DraftContext, 'closedLoops' | 'levelAt' | 'levelRefAt' | 'resolveLevel' | 'plane' | 'viewKind' | 'view' | 'viewElements' | 'planParts' | 'planObstacles' | 'rooms' | 'planLines'>;

export interface ViewInputsSource {
  view: Exclude<ProjectView, { kind: '3d' }>;
  /** The drawing the view stores (`drawingShownBy`), or none yet. */
  drawing: Drawing2D | null;
  /** The view's own drafted entities (the hatch boundaries include the closed ones). */
  entities: readonly DraftEntity[];
  /** The drawing's plane, else the view's work plane. */
  plane: SectionPlaneConfig | undefined;
  levels: readonly ProjectLevel[];
}

export function viewInputs({ view, drawing, entities, plane, levels }: ViewInputsSource): ViewInputs {
  const resolve = levelResolverFor(view, levels, plane);
  return {
    viewElements: () => (drawing ? viewElements(drawing) : []),
    planParts: () => planParts(drawing, currentDrawingRuntime().geometryResult?.meshes ?? []),
    // The door leaves, swings and window frames this plan draws, which a tag keeps clear of (the same symbols the marks keep clear of).
    planObstacles: () => planSymbolObstacles(view, levels, currentDrawingRuntime().geometryResult?.meshes ?? [], useProjectStore.getState().symbolFlips),
    // The rooms of this plan, each space cut at the plan's height (read as the check reads them).
    rooms: () => roomsOfPlan(view, levels, currentDrawingRuntime().geometryResult),
    // Every line the drawing carries, hidden ones too: a figure inside a room keeps off them, and a dimension line does not run along one.
    planLines: () => (drawing?.lines ?? []).map((l) => ({ a: { x: l.line.start.x, y: l.line.start.y }, b: { x: l.line.end.x, y: l.line.end.y } })),
    // Hatch boundaries: drafted closed shapes and the drawing's cut outlines.
    closedLoops: () => closedLoopsOf(entities, drawing),
    // Level marks: the plan's level, or the point's height on a section / elevation.
    levelAt: (p) => {
      if (view.kind === 'plan') return (resolvePlanLevel(view, levels) ?? view.level).elevation;
      return plane ? drawingToWorld(plane, p).y : 0;
    },
    // A plan's mark reads its storey, a section's the height of its reference.
    levelRefAt: (p) => (view.kind === 'plan' ? { at: p, storey: storeyOf(view, levels) } : { at: p }),
    resolveLevel: resolve,
    plane: () => viewWorkPlane(view, plane ?? null, levels),
    view: () => view,
    viewKind: () => (view.kind === 'plan' || view.kind === 'section' || view.kind === 'elevation' ? view.kind : null),
  };
}
