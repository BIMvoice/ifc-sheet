/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `byggesaksbim.ids` run in process, over opened models: what `ifcsheet check --ids byggesaksbim` does. The app runs the
 * same document in its validation worker (`apps/viewer/src/check/byggesaksbim.ts`) and hands the reports to the same
 * `byggesaksbimFindings`. Node-side and headless: it parses the IDS and walks the entity tables.
 */

import { createTranslationService, parseIDS, validateIDS, type IDSDocument, type IDSValidationReport } from '@ifc-lite/ids';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { ReadinessFinding } from '../readiness.js';
import { byggesaksbimFindings } from './byggesaksbim.js';
import { BYGGESAKSBIM_IDS } from './byggesaksbim-ids.js';

/** The shipped IDS, parsed; every caller gets its own copy. */
export const byggesaksbimDocument = (): IDSDocument => parseIDS(BYGGESAKSBIM_IDS);

/** The report of one model against the document. Passing entities are not kept: the findings name the failing ones. */
export async function byggesaksbimReport(dataStore: IfcDataStore, modelId = 'model', document: IDSDocument = byggesaksbimDocument()): Promise<IDSValidationReport> {
  const accessor = createDataAccessor(dataStore);
  return validateIDS(document, accessor, {
    modelId, schemaVersion: dataStore.schemaVersion || 'IFC4', entityCount: dataStore.entityCount || accessor.getAllEntityIds().length,
  }, { translator: createTranslationService('en'), includePassingEntities: false });
}

/** The ByggesaksBIM findings of the opened models. */
export async function byggesaksbimReadiness(models: readonly { dataStore: IfcDataStore; modelId?: string }[]): Promise<ReadinessFinding[]> {
  const document = byggesaksbimDocument();
  const reports: IDSValidationReport[] = [];
  for (const [i, m] of models.entries()) reports.push(await byggesaksbimReport(m.dataStore, m.modelId ?? `model-${i}`, document));
  return byggesaksbimFindings(reports);
}
