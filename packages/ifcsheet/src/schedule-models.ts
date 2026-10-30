/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The engine's fill of `ScheduleModel` (#581), the one read every schedule takes of a model: the parsed store, no edit
 * overlay, the headless list provider and the meshes of the opened model grouped by element. The web app fills the same
 * interface from its stores (`loadedScheduleModels`); `ifcsheet check --project` and `build --project` fill it here.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';
import { modelClassification } from './classification-read.js';
import { meshesByExpressId } from './element-size.js';
import type { ScheduleModel } from './joinery-schedule.js';
import { createHeadlessListProvider } from './list-provider.js';

/** An opened model, as far as a schedule reads it (`OpenedModel` has more). */
export interface OpenedScheduleSource {
  dataStore: IfcDataStore;
  /** The meshes in the viewer frame; absent or empty for a model read without geometry. */
  meshes?: readonly MeshData[];
}

/** The `ScheduleModel` of an opened model: one entry, its `meshesOf` only when the model has meshes. */
export function scheduleModelsOf(model: OpenedScheduleSource, name = '', modelId = 'model'): ScheduleModel[] {
  const { dataStore, meshes } = model;
  return [{
    modelId, name, dataStore, view: null,
    listProvider: () => createHeadlessListProvider(dataStore, name),
    classification: () => modelClassification({ modelId, dataStore }),
    ...(meshes ? { meshesOf: meshesByExpressId(meshes) } : {}),
  }];
}
