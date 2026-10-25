/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What the drawing in front installs into the drafting session: the pickers, and the model data the one-action commands read. */

import { useEffect, useMemo } from 'react';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { pickModelElement, type ReferenceSet } from '@/drafting/references';
import { syncLevelMarks } from '@/drafting/level-sync';
import { clearViewInputs, installViewInputs, setElementPicker, setModelPicker } from '@/drafting/session';
import { viewInputs } from '@/drafting/view-inputs';
import type { DraftEntity } from '@/drafting/types';
import { roofAtPoint } from '@/project/roof-plan';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { selectFromPlan } from '@/components/viewer/plan/PlanPointer';

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
  // Everything the one-action commands (LABELALL, DIMALL, TAGALL, CEILTAG, LEVELALL, hatch, level marks) read from this view
  // and its drawing is one function of them (`viewInputs`), the one the batch that annotates the whole set calls too.
  const inputs = useMemo(() => viewInputs({ view, drawing, entities, plane, levels }), [view, drawing, entities, plane, levels]);
  useEffect(() => installViewInputs(inputs), [inputs]);
  useEffect(() => clearViewInputs, []);
  // Level marks keep their references in step with the model: when the view, its levels or its plane change, not on every drafted entity.
  useEffect(() => {
    syncLevelMarks(view.id, inputs.resolveLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `inputs` is rebuilt on every draft edit; its resolver reads only the view, levels and plane
  }, [view, levels, plane]);
}
