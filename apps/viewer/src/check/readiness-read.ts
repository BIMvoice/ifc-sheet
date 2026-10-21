/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The loaded models counted into `ModelFacts`. The counting moved to the engine package (`packages/ifcsheet/src/readiness-read.ts`, #164); this reads the stores and says how many storeys each model has, the ones created in this session included. */

import { readModelFacts, type FactSource } from '@bimvoice/ifcsheet/readiness-read';
import { useViewerStore } from '@/store';
import { modelLevels } from '@/project/model-levels';
import type { ModelFacts } from './readiness';

export { IFC_GUID, isPhysicalElement, readModelFacts } from '@bimvoice/ifcsheet/readiness-read';
export type { FactSource } from '@bimvoice/ifcsheet/readiness-read';

/** The facts of the models open now (hidden ones included: the set is drawn from all). */
export function currentModelFacts(): ModelFacts {
  const s = useViewerStore.getState();
  const sources: FactSource[] = [];
  for (const [modelId, model] of s.models) if (model.ifcDataStore) sources.push({ store: model.ifcDataStore, storeys: modelLevels(modelId).length });
  return readModelFacts(sources);
}
