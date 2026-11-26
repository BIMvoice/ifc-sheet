/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keeps the project in step with the loaded models, and autosaves it.
 *
 * Levels come from every loaded model's IfcBuildingStorey list (with
 * GlobalIds, so a plan survives a re-export that renumbers express ids).
 * The project autosaves to localStorage under the set of loaded model keys,
 * so reopening the same models restores their views; the
 * `.ifclite-project.json` file is the shareable copy.
 */

import { useEffect } from 'react';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { modelLevels } from './model-levels';
import { loadProjectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import type { StoreyInput } from './view-defaults';
import type { ProjectModelRef } from './types';
import { autosaveKey } from './project-saved';
import { watchProjectForAutosave } from './autosave-watch';
import { markSessionClosed, markSessionOpen, planAutosave } from './recovery';
import { noticeAutosaveTooNew } from './autosave-notice';
import { forgetRecoveryOffer, offerRecovery, restoreModelState } from './recovery-store';
import { restoreRasters } from './autosave-rasters';
import { keepProjectForNewVersion, modelVersionSwapActive } from './model-version';
import { startingMaterials } from './demo-project';
import { batchHolds, useLoadBatch } from '@/hooks/ingest/load-batch';

interface StoreySource {
  spatialHierarchy?: { byStorey: ReadonlyMap<number, unknown>; storeyElevations: ReadonlyMap<number, number> } | null;
  entities: { getName(id: number): string | null; getGlobalId(id: number): string };
}

export function storeysOf(ds: StoreySource | null | undefined): StoreyInput[] {
  if (!ds?.spatialHierarchy) return [];
  const { byStorey, storeyElevations } = ds.spatialHierarchy;
  return Array.from(byStorey.keys(), (id) => ({
    name: ds.entities.getName(id) || `Storey #${id}`,
    elevation: storeyElevations.get(id) ?? 0,
    globalId: ds.entities.getGlobalId(id) || undefined,
  }));
}

export function modelRef(model: Pick<FederatedModel, 'id' | 'name' | 'sourceContentHash'>): ProjectModelRef {
  return { key: model.sourceContentHash ?? model.name, name: model.name };
}

function loadedModels(): { refs: ProjectModelRef[]; storeys: StoreyInput[] } {
  const { models, ifcDataStore } = useViewerStore.getState();
  if (models.size === 0) {
    return ifcDataStore ? { refs: [{ key: 'legacy', name: 'Model' }], storeys: storeysOf(ifcDataStore) } : { refs: [], storeys: [] };
  }
  const refs: ProjectModelRef[] = [];
  const storeys: StoreyInput[] = [];
  for (const model of models.values()) {
    if (!model.ifcDataStore) continue;
    refs.push(modelRef(model));
    // Effective storeys: parsed ones not deleted, plus levels added in this session.
    storeys.push(...modelLevels(model.id));
  }
  return { refs, storeys };
}

/** Whether the project in front holds a set: from its first sheet on, it is the person's to keep (#863). */
function hasWork(project: { sheets: readonly unknown[] }): boolean {
  return project.sheets.length > 0;
}

/** Mount once: follows model loads and autosaves the project. */
export function useProjectSync(): void {
  useEffect(() => {
    let slot: string | null = null;
    // The slot in front holds a newer build's autosave: it is not written for as long as these models are in front.
    let readOnlySlot = false;

    const onModels = () => {
      // Files opened together are one batch (#863): the project follows them once, when the last is in, so it gets the
      // levels and the autosave of all of them, as if they had been opened at once, not those of the first alone.
      if (batchHolds(useLoadBatch.getState().batch)) return;
      const { refs, storeys } = loadedModels();
      if (refs.length === 0) return;
      const key = autosaveKey(refs);
      if (key !== slot) {
        // The models in front before these ended as they should: theirs is not a session that died.
        if (slot && !readOnlySlot) markSessionClosed(slot);
        slot = key;
        forgetRecoveryOffer();
        const current = useProjectStore.getState();
        const overlaps = current.models.some((m) => refs.some((r) => r.key === m.key));
        // Models added to the models of the project in front (#863): once it holds a set, that project goes on,
        // whatever these models left before; their earlier project is offered back, never put over it. Nothing is
        // compared field by field, so no edit (a scale, a paper, an annotation) can be missed.
        const carryOn = overlaps && hasWork(current);
        const plan = planAutosave(key, undefined, carryOn);
        readOnlySlot = plan.tooNew;
        // No marker on a slot this session does not write: a crash here leaves nothing of ours to offer.
        if (!plan.tooNew) markSessionOpen(key);
        if (modelVersionSwapActive()) keepProjectForNewVersion(refs);
        else if (plan.restore) {
          loadProjectDocument(plan.restore.doc);
          void restoreModelState(key, () => slot);
          void restoreRasters(key);
        } else if (!overlaps) {
          resetProject();
          // The demo project starts with the materials its model is built of, hatched (`demo-project.ts`).
          const materials = startingMaterials(refs);
          if (materials) useProjectStore.setState({ materials });
        }
        // The last session on these models died with work no project file holds: the intro and the drawer offer it back.
        if (plan.recoverable) offerRecovery({ key, doc: plan.recoverable.doc, savedAt: plan.recoverable.savedAt, modelName: refs.map((r) => r.name).join(', ') });
        if (plan.tooNew) noticeAutosaveTooNew();
      }
      syncProjectWithModels(refs, storeys);
    };

    onModels();
    const unsubModels = useViewerStore.subscribe((state, prev) => {
      if (state.models !== prev.models || state.ifcDataStore !== prev.ifcDataStore || state.mutationVersion !== prev.mutationVersion) onModels();
    });
    const unsubBatch = useLoadBatch.subscribe((state, prev) => {
      if (batchHolds(prev.batch) && !batchHolds(state.batch)) onModels();
    });
    const stopAutosave = watchProjectForAutosave(() => (readOnlySlot ? null : slot));
    // The page closing as a page does is a clean end; coming back from the back-forward cache reopens it.
    const closed = () => { if (slot && !readOnlySlot) markSessionClosed(slot); };
    const reopened = (e: PageTransitionEvent) => { if (e.persisted && slot && !readOnlySlot) markSessionOpen(slot); };
    window.addEventListener('pagehide', closed);
    window.addEventListener('pageshow', reopened);
    return () => {
      unsubModels();
      unsubBatch();
      stopAutosave();
      window.removeEventListener('pagehide', closed);
      window.removeEventListener('pageshow', reopened);
      closed();
    };
  }, []);
}
