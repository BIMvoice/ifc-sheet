/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's own classification (#89) read from parsed models: the IfcClassificationReferences an element carries through
 * IfcRelAssociatesClassification, its type's included (the parser's `extractClassificationsOnDemand`), as the
 * {@link ClassificationModel} `classificationOf` takes. The app and the command line both make theirs here.
 *
 * Its own entry with the headless chain: it loads the parser.
 */

import { extractClassificationsOnDemand, type IfcDataStore } from '@ifc-lite/parser';
import type { ClassificationModel } from './classification.js';

/** The references of the entities of `stores` (by the model id an element names). An element of a model that is not here has none. */
export function storeClassifications(stores: ReadonlyMap<string, IfcDataStore> | (() => ReadonlyMap<string, IfcDataStore>)): ClassificationModel {
  return {
    referencesOf: (element) => {
      const store = (typeof stores === 'function' ? stores() : stores).get(element.modelId ?? '');
      return store && element.expressId !== undefined ? extractClassificationsOnDemand(store, element.expressId) : [];
    },
  };
}

/** The model's own references (#89) as a `ScheduleModel` carries them: the one fill both the app and `scheduleModelsOf` use, and the default of a model that sets none. */
export function modelClassification(model: { modelId: string; dataStore: IfcDataStore }): ClassificationModel {
  return storeClassifications(new Map([[model.modelId, model.dataStore]]));
}
