/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The app's fill of the engine's `ScheduleModel` (#581), the one read every schedule takes of a model: each loaded model's
 * store, its mutation overlay (unsaved edits), the overlay-aware name read, the list provider, and the meshes of an element
 * (the flat ones, else the pieces of a GPU-instanced element from the live renderer). The engine fills the same interface from
 * an opened model (`scheduleModelsOf`), so a schedule reads either host the same way.
 */

import { modelClassification, type ScheduleModel } from '@bimvoice/ifcsheet/project';
import { createListDataProvider, type ListDataProvider } from '@/lib/lists';
import { useViewerStore } from '@/store';
import { entityName } from '@/lib/commands/modeling/authored-kinds';
import { prepareListProviders } from '@/lib/lists/prepare-providers';
import { elementMeshLookup, type InstancedMeshes } from './element-meshes';

export interface LoadedScheduleOptions {
  /** Resolves the elements drawn by GPU instancing (default: the live renderer's scene). */
  instanced?: InstancedMeshes;
  /** Also the models the user has hidden (default: the visible ones only). The joinery rows list every loaded model. */
  hidden?: boolean;
}

/** The loaded models as `ScheduleModel`s: a model without a parsed store is left out, and so is a hidden one unless `hidden`. */
export function loadedScheduleModels({ instanced, hidden = false }: LoadedScheduleOptions = {}): ScheduleModel[] {
  const s = useViewerStore.getState();
  const models: ScheduleModel[] = [];
  let prepared: ReturnType<typeof prepareListProviders> | undefined;
  for (const [modelId, model] of s.models) {
    const dataStore = model.ifcDataStore;
    if (!dataStore || (!hidden && model.visible === false)) continue;
    const view = s.mutationViews.get(modelId) ?? null;
    models.push({
      modelId, name: model.name, dataStore, view,
      nameOf: (id) => entityName({ dataStore, view }, id),
      meshesOf: elementMeshLookup(model, instanced),
      classification: () => modelClassification({ modelId, dataStore }),
      listProvider: () => (prepared ??= prepareListProviders(s, {})).pairs.find((pair) => pair.modelId === modelId)!.provider,
    });
  }
  return models;
}

/** The list provider of a schedule model: the one it carries, else the app's over its store and overlay. */
export function providerOf(model: ScheduleModel): ListDataProvider {
  return model.listProvider?.() ?? createListDataProvider(model.dataStore, model.name ?? '', undefined, model.view ?? undefined);
}
