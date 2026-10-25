/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The loaded models counted into `ModelFacts`. The counting moved to the engine package (`packages/ifcsheet/src/readiness-read.ts`, #164); this reads the stores and says how many storeys each model has, the ones created in this session included. */

import { readModelFacts, type FactSource } from '@bimvoice/ifcsheet/readiness-read';
import { estimatedAreas } from '@bimvoice/ifcsheet';
import { collectRoomRecords } from '@/urban/urban-models';
import { useViewerStore } from '@/store';
import { modelLevels } from '@/project/model-levels';
import { buildingFraming } from '@/project/model-rooms';
import { useProjectStore } from '@/project/project-store';
import { modelMeshes } from '@/draft-set/body';
import type { ModelFacts } from './readiness';

export { IFC_GUID, isPhysicalElement, readModelFacts } from '@bimvoice/ifcsheet/readiness-read';
export type { FactSource } from '@bimvoice/ifcsheet/readiness-read';

/** The facts of the models open now (hidden ones included: the set is drawn from all). */
export function currentModelFacts(): ModelFacts {
  const s = useViewerStore.getState();
  const sources: FactSource[] = [];
  for (const [modelId, model] of s.models) if (model.ifcDataStore) sources.push({ store: model.ifcDataStore, storeys: modelLevels(modelId).length });
  const facts = readModelFacts(sources);
  // The small elements the views are framed without (`buildingFraming`, the rule the command line frames by); none when the project frames on everything.
  const project = useProjectStore.getState();
  const far = project.includeFarElements === true ? [] : buildingFraming(project.levels, modelMeshes()).far;
  // The rooms measured from geometry: the same helper the command line asks, over the same rooms Au sums.
  const estimated = estimatedAreas(collectRoomRecords(project.levels).rooms);
  return { ...facts, ...(far.length > 0 ? { farElements: far } : {}), ...(estimated ? { estimatedAreas: estimated } : {}) };
}
