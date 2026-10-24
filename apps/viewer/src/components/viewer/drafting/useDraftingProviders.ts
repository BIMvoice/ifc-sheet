/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What the drawing in front installs into the drafting session: the pickers, and the model data the one-action commands read. */

import { useEffect } from 'react';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { drawingToWorld } from '@/drafting/frame';
import { pickModelElement, type ReferenceSet } from '@/drafting/references';
import { syncLevelMarks } from '@/drafting/level-sync';
import { levelResolverFor, storeyOf } from '@/drafting/level-resolver';
import {
  setElementPicker, setViewElementsProvider, setPlanObstaclesProvider, setPlanPartsProvider, setRoomsProvider, setAnnotationProviders, setLevelReferenceProviders, setModelPicker, setWorkPlaneProvider,
} from '@/drafting/session';
import type { DraftEntity } from '@/drafting/types';
import { viewElements } from '@/labels/view-elements';
import { planParts } from '@/dimall/parts';
import { useProjectStore } from '@/project/project-store';
import { planSymbolObstacles } from '@/rcp/ceiling-tag-obstacles';
import { roomsOfPlan } from '@/tagall/rooms';
import { currentDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { roofAtPoint } from '@/project/roof-plan';
import { resolvePlanLevel } from '@/project/view-defaults';
import { viewWorkPlane } from '@/project/view-plane-config';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { selectFromPlan } from '@/components/viewer/plan/PlanPointer';
import { closedLoopsOf } from './drafting-shapes';

interface Providers {
  view: Exclude<ProjectView, { kind: '3d' }>;
  drawing: Drawing2D | null;
  references: ReferenceSet | null;
  entities: readonly DraftEntity[];
  plane: SectionPlaneConfig | undefined;
  levels: readonly ProjectLevel[];
  /** Screen pixels per drawing unit (the pick tolerance is in pixels). */
  scale: number;
}

export function useDraftingProviders({ view, drawing, references, entities, plane, levels, scale }: Providers): void {
  // An idle click on the drawing selects the model element under it (both selection channels, as the plan view does).
  useEffect(() => {
    setModelPicker((p, tolerance, additive) => {
      // Nothing cut under the click: a roof whose outline holds it (roofs are drawn over the plan, not cut).
      const id = (drawing && references ? pickModelElement(drawing, references, p, tolerance) : null) ?? (view.kind === 'plan' && plane ? roofAtPoint(view, plane, p) : null);
      if (id !== null || !additive) selectFromPlan(id, additive);
    });
    return () => setModelPicker(null);
  }, [drawing, references, view, plane]);
  // Commands that work on a model element (a door into a wall in elevation) ask what is under a point.
  useEffect(() => {
    setElementPicker((p) => (drawing && references ? pickModelElement(drawing, references, p, 6 / scale) : null));
    return () => setElementPicker(null);
  }, [drawing, references, scale]);
  // LABELALL: the elements this view draws, each with a point to label it at.
  useEffect(() => {
    setViewElementsProvider(() => (drawing ? viewElements(drawing) : []));
    return () => setViewElementsProvider(null);
  }, [drawing]);
  // DIMALL: the walls, doors and windows this plan is cut through.
  useEffect(() => {
    setPlanPartsProvider(() => planParts(drawing));
    return () => setPlanPartsProvider(null);
  }, [drawing]);
  // CEILTAG: the door leaves, swings and window frames this plan draws, which a tag keeps clear of (the same symbols the marks keep clear of).
  useEffect(() => {
    setPlanObstaclesProvider(() => planSymbolObstacles(view, levels, currentDrawingRuntime().geometryResult?.meshes ?? [], useProjectStore.getState().symbolFlips));
    return () => setPlanObstaclesProvider(null);
  }, [view, levels]);
  // TAGALL: the rooms of this plan, each space cut at the plan's height (read as the check reads them).
  useEffect(() => {
    setRoomsProvider(() => roomsOfPlan(view, levels, currentDrawingRuntime().geometryResult));
    return () => setRoomsProvider(null);
  }, [view, levels]);
  // Hatch boundaries: drafted closed shapes and the drawing's cut outlines. Level marks: the
  // plan's level, or the point's height on a section / elevation.
  useEffect(() => {
    setAnnotationProviders(
      () => closedLoopsOf(entities, drawing),
      (p) => {
        if (view.kind === 'plan') return (resolvePlanLevel(view, levels) ?? view.level).elevation;
        return plane ? drawingToWorld(plane, p).y : 0;
      },
    );
  }, [entities, drawing, view, levels, plane]);
  // Level marks: a plan's mark reads its storey, a section's the height of its reference.
  useEffect(() => {
    const resolve = levelResolverFor(view, levels, plane);
    setLevelReferenceProviders((p) => (view.kind === 'plan' ? { at: p, storey: storeyOf(view, levels) } : { at: p }), resolve);
    syncLevelMarks(view.id, resolve);
  }, [view, levels, plane]);
  useEffect(() => {
    setWorkPlaneProvider(() => viewWorkPlane(view, plane ?? null, levels), () => view);
  }, [plane, view, levels]);
}
