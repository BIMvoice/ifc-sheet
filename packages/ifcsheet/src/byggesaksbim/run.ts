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
import { byggesaksbimErrorFinding, byggesaksbimFindings, byggesaksbimSchemaFinding, isByggesaksbimSchema } from './byggesaksbim.js';
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

/**
 * The ByggesaksBIM findings of the opened models. A model that is not IFC4 is not checked: one finding says so (the IDS is
 * IFC4, and a run would read the model as IFC4). A run that fails throws; `byggesaksbimReadinessOrError` turns that into a finding.
 */
export async function byggesaksbimReadiness(models: readonly { dataStore: IfcDataStore; modelId?: string }[]): Promise<ReadinessFinding[]> {
  const document = byggesaksbimDocument();
  const reports: IDSValidationReport[] = [];
  const refused: string[] = [];
  for (const [i, m] of models.entries()) {
    if (!isByggesaksbimSchema(m.dataStore.schemaVersion)) { refused.push(m.dataStore.schemaVersion || 'of unknown schema'); continue; }
    reports.push(await byggesaksbimReport(m.dataStore, m.modelId ?? `model-${i}`, document));
  }
  return [...(refused.length > 0 ? [byggesaksbimSchemaFinding(refused)] : []), ...byggesaksbimFindings(reports)];
}

/** `byggesaksbimReadiness`, with a failure said as a finding ("could not run") instead of thrown; for callers that list findings. */
export async function byggesaksbimReadinessOrError(models: readonly { dataStore: IfcDataStore; modelId?: string }[]): Promise<ReadinessFinding[]> {
  try {
    return await byggesaksbimReadiness(models);
  } catch (error) {
    return [byggesaksbimErrorFinding(error)];
  }
}
