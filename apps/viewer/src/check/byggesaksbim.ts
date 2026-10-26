/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ByggesaksBIM (Norway) readiness check in the app (#372). The shipped IDS is run over each loaded model by the
 * app's validation service (`runIdsCheck`: in the IDS worker, so the page stays responsive, and on the main thread only
 * where the worker cannot be used; pending property edits are applied), and the reports go through the engine's
 * `byggesaksbimFindings`, the same function `ifcsheet check --ids byggesaksbim` ends in, so the two say the same thing.
 */

import { parseIDS, type IDSValidationReport } from '@ifc-lite/ids';
import { BYGGESAKSBIM_IDS, byggesaksbimFindings } from '@bimvoice/ifcsheet/byggesaksbim';
import { runIdsCheck } from '@/lib/validation/run-ids-check';
import { elementByGlobalId } from '@/project/element-label';
import { toGlobalIdFromModels } from '@/store/globalId';
import { useViewerStore } from '@/store';
import type { ReadinessFinding } from './readiness';

/** The findings of the models open now; none when no model has parsed data. */
export async function runByggesaksbim(signal?: AbortSignal): Promise<ReadinessFinding[]> {
  const state = useViewerStore.getState();
  const document = parseIDS(BYGGESAKSBIM_IDS);
  const reports: IDSValidationReport[] = [];
  for (const [modelId, model] of state.models) {
    if (!model.ifcDataStore) continue;
    const { report } = await runIdsCheck({ document, modelId, dataStore: model.ifcDataStore, mutationView: state.getMutationView(modelId), locale: 'en', models: state.models, signal });
    reports.push(report);
  }
  return byggesaksbimFindings(reports);
}

/** Selects the element a GlobalId names, in whichever model holds it, so the properties panel shows it. False when it is not in the models. */
export function selectByGlobalId(guid: string): boolean {
  const at = elementByGlobalId(guid);
  if (!at) return false;
  const s = useViewerStore.getState();
  const ref = { modelId: at.modelId, expressId: at.expressId };
  s.setSelectedEntityIds([]);
  s.setSelectedEntityId(toGlobalIdFromModels(s.models, at.modelId, at.expressId));
  s.setSelectedEntity(ref);
  return true;
}
