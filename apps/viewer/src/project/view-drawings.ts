/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Each open drawing tab's own generated drawing (phase 3b). A view's
 * generator (`ViewDrawingHost`) writes here; the tab in front is mirrored
 * into the viewer's one `drawing2D` so the Drawing panel's canvas, toolbar
 * and exports show it. Switching tabs is instant: a view regenerates only
 * when its own inputs change, never because another tab came forward.
 */

import { create } from 'zustand';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { viewProjection } from '@bimvoice/ifcsheet';
import type { ProjectView } from './types';
import type { ViewSectionPlane } from './view-plane';

export type ViewDrawingStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface ViewDrawingEntry {
  drawing: Drawing2D | null;
  status: ViewDrawingStatus;
  progress: number;
  phase: string;
  error: string | null;
}

export const EMPTY_VIEW_DRAWING: ViewDrawingEntry = { drawing: null, status: 'idle', progress: 0, phase: '', error: null };

export const useViewDrawings = create<{ byView: Record<string, ViewDrawingEntry> }>()(() => ({ byView: {} }));

export function patchViewDrawing(viewId: string, patch: Partial<ViewDrawingEntry>): void {
  useViewDrawings.setState((s) => ({
    byView: { ...s.byView, [viewId]: { ...(s.byView[viewId] ?? EMPTY_VIEW_DRAWING), ...patch } },
  }));
}

export function dropViewDrawing(viewId: string): void {
  useViewDrawings.setState((s) => {
    if (!(viewId in s.byView)) return s;
    const { [viewId]: _dropped, ...rest } = s.byView;
    return { byView: rest };
  });
}

/**
 * Whether the view's drawing is generated from the model. A drafting view has
 * no model behind it: it keeps the empty entry, so every consumer (sheets,
 * the editor) takes the "no model drawing" path they already have for a
 * project without geometry.
 */
export const generatesFromModel = (view: Pick<ProjectView, 'kind'>): boolean => view.kind !== 'drafting';

/** The display options a view overrides on top of the viewer's shared ones. */
export interface ViewDisplayOverrides {
  showConstructionProjection: boolean;
  constructionProjectionDepth: number | null;
}

/** Projection follows the view's depth (`viewProjection`, the rule the engine's sheets draw by too, #615). */
export const viewDisplayOverrides = (view: ProjectView): ViewDisplayOverrides => viewProjection(view);

/** A stable key for a resolved plane, so an unchanged view never regenerates. */
export function planeKey(plane: ViewSectionPlane | null): string {
  return plane ? JSON.stringify([plane.axis, plane.position, plane.flipped, plane.reflected === true, plane.custom ?? null]) : '';
}
