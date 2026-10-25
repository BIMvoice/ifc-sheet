/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's own classification (#89) as the engine's `classificationOf` takes it: the IfcClassificationReferences of the loaded models'
 * elements, read by the engine's `storeClassifications` (the same code the command line uses), plus what a tag resolves with.
 */

import { classificationOf, type ClassificationModel, type ClassificationResult } from '@bimvoice/ifcsheet';
import { storeClassifications } from '@bimvoice/ifcsheet/project';
import type { IfcDataStore } from '@ifc-lite/parser';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';

/** The model's own references for any element of the loaded models, by the model id an element names. */
export function loadedClassificationModel(): ClassificationModel {
  return storeClassifications(() => {
    const out = new Map<string, IfcDataStore>();
    for (const [id, model] of useViewerStore.getState().models) if (model.ifcDataStore) out.set(id, model.ifcDataStore);
    return out;
  });
}

/** The mapping tags and labels resolve with: the first of the project's (the one marked "use on tags" is moved first). */
export const tagClassificationMappings = () => (useProjectStore.getState().classificationMappings ?? []).slice(0, 1);

/** The classification a tag or label shows for an element: the model's own reference, else the first mapping. */
export function tagClassification(element: { className: string; typeName: string | null; materials: readonly string[]; modelId: string; expressId: number }): ClassificationResult | null {
  return classificationOf(element, tagClassificationMappings(), loadedClassificationModel());
}
