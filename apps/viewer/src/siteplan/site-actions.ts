/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Making a site plan, drawing its plot boundary, and putting a key plan on a
 * sheet.
 *
 * The site plan is a plan of the ground storey cut at the plans' cut height,
 * not a roof projection: the built area and the setbacks a permit states are
 * measured at the ground, from the walls that stand on it; an overhang above
 * (a balcony, a cantilevered floor) does not move them.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { addProjectView, useProjectStore } from '@/project/project-store';
import { planViewFor } from '@/project/view-defaults';
import { addViewport, updateViewport } from '@/project/sheets';
import { setCurrentLayer, currentLayerId, useDraftingSession } from '@/drafting/session';
import type { ProjectLevel, ProjectSheet, SheetViewport } from '@/project/types';
import { isSitePlan, PLOT_BOUNDARY_LAYER } from './plot';
import { keyPlanPlace, keyPlanScale, type Extent } from './key-plan';

/** A site plan's scale when made. */
export const SITE_PLAN_SCALE = 200;

/** The ground storey: the level nearest elevation 0 (the lower of two as near), else none. */
export function groundLevel(levels: readonly ProjectLevel[]): ProjectLevel | undefined {
  return [...levels].sort((a, b) => Math.abs(a.elevation) - Math.abs(b.elevation) || a.elevation - b.elevation)[0];
}

/** The project's site plan, made on the ground storey when there is none yet. Returns its id, or null without levels. */
export function ensureSitePlan(name: string): string | null {
  const { views, levels } = useProjectStore.getState();
  const existing = views.find(isSitePlan);
  if (existing) return existing.id;
  const level = groundLevel(levels);
  if (!level) return null;
  ensurePlotBoundaryLayer();
  return addProjectView({ ...planViewFor(level, views, Date.now(), levels), name, auto: false, site: true, scale: SITE_PLAN_SCALE });
}

/** The plot boundary layer, added once. */
export function ensurePlotBoundaryLayer(): void {
  const s = useProjectStore.getState();
  if (s.draftLayers.some((l) => l.id === PLOT_BOUNDARY_LAYER.id)) return;
  useProjectStore.setState({ draftLayers: [...s.draftLayers, { ...PLOT_BOUNDARY_LAYER, visible: true, locked: false }], dirty: true });
}

/**
 * Draw the plot boundary: polylines go on the plot boundary layer until the
 * next command ends, then on the layer that was current. `start` runs the
 * polyline command on the site plan once it can (`startWhenAttached`).
 */
export function drawPlotBoundary(viewId: string, start: (viewId: string, command: string) => () => void): () => void {
  ensurePlotBoundaryLayer();
  const previous = currentLayerId();
  setCurrentLayer(PLOT_BOUNDARY_LAYER.id);
  let began = false;
  const unsubscribe = useDraftingSession.subscribe((s) => {
    if (s.commandId !== null) began = true;
    else if (began) {
      unsubscribe();
      setCurrentLayer(previous);
    }
  });
  const cancel = start(viewId, 'polyline');
  return () => {
    cancel();
    unsubscribe();
    setCurrentLayer(previous);
  };
}

/**
 * A key plan of `viewport` on its sheet: the same plan, whole, at a scale that
 * fits the key plan's corner above the title block. Returns its viewport id;
 * an existing key plan of that viewport is returned as it is.
 */
export function addKeyPlan(sheet: ProjectSheet, viewport: SheetViewport, bounds: Extent | null): string {
  const existing = (sheet.viewports ?? []).find((v) => v.keyPlanOf === viewport.id);
  if (existing) return existing.id;
  let id = '';
  runAsOneUndoStep(() => {
    id = addViewport(sheet.id, viewport.viewId, keyPlanPlace(sheet), keyPlanScale(bounds));
    updateViewport(sheet.id, id, { keyPlanOf: viewport.id });
  });
  return id;
}
